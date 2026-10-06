// src/pages/POS.js - نقطة البيع مع دعم المطعم: تيك أواي/ديليفري + إضافات + طباعة حرارية
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc, query, where, orderBy, limit, runTransaction, writeBatch } from "firebase/firestore";
import { isOffline } from "../utils/offline.js";
import { readStockCache } from "../utils/stock.js";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, fetchUserCompany } from "../utils/companyQuery.js";
import { printReceipt, receiptCode } from "../utils/receipt.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { EGYPT_PAYMENTS, getPaymentLabel } from "../utils/paymentMethods.js";
import { fmtDateTime, moneyShort } from "../utils/fmt.js";
import { planStockOut, expandRecipeLines, convertQty } from "../utils/stock.js";
import { occupyTableByNumber } from "../utils/tableSync.js";

// round2 بيقرّب فلوس عند حدّين عشان ما نتكسبش أخطاء 0.1+0.2.
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// أنواع الطلبات للمطعم - تيك أواي وديليفري بس
const ORDER_TYPES = [
  { value: "takeaway", label: "🥡 تيك أواي" },
  { value: "delivery", label: "🛵 توصيل" },
    { value: "dine_in", label: "🍽️ صالة" },

];

// مصدر الأوردر - الكاشير هو اللي بينقل من واتساب/طلبات/سيتي
const ORDER_SOURCES = [
  { value: "direct", label: "🏪 مباشر" },
  { value: "whatsapp", label: "💬 واتساب" },
  { value: "phone", label: "📞 تليفون" },
  { value: "talabat", label: "🛵 طلبات" },
  { value: "city_app", label: "🏙️ سيتي آب" },
];

export default function POS() {
  const { t, lang, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const isCafe = userIndustry === "cafe";
  const isRestaurantOnly = userIndustry === "restaurant";
  const isRestaurant = (isRestaurantOnly || isCafe);
  const isFood = isRestaurant;
  const isPharmacy = userIndustry === "pharmacy";
  const foodLabel = isCafe ? "الكافيه" : "المطعم";
  const foodIcon = isCafe ? "☕" : "🍽️";
  // مخزنيًا: مطعم فقط يستهلك خامات عبر الوصفات — الكافيه يبيع من المخزون
  const isRestaurantStock = isRestaurantOnly;

  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  // اسم الشركة بيطبع في رأس الفاتورة.|super_admin مالوش شركة واحدة، فمفيش
  // header واحد ينفع الكل — دي الحالة الوحيدة اللي بنسيب الاسم فيها فاضي.
  const [company, setCompany] = useState(null);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [categories, setCategories] = useState([]); // أقسام المنيو من Firestore
  const [selectedClient, setSelectedClient] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // عميل جديد سريع من الكاشير (من غير ما يروح صفحة العملاء)
  const [newClientName, setNewClientName] = useState("");
  const [addingClient, setAddingClient] = useState(false);

  // حقول المطعم
  const [orderType, setOrderType] = useState("takeaway");
  const [orderSource, setOrderSource] = useState("direct");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [phoneHint, setPhoneHint] = useState("");
  const [repeating, setRepeating] = useState(false);

  // إضافات مخصصة لكل صنف في السلة
  const [cartItemNotes, setCartItemNotes] = useState({}); // { productId: note }
  const [cartItemExtras, setCartItemExtras] = useState({}); // { productId: [extraIdx] }

  const fetchProducts = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchClients = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid));
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  // اسم الشركة = ترويسة الفاتورة. بيتجلب مرة واحدة مش مع كل عملية بيع.
  useEffect(() => {
    if (!userCompanyId) { setCompany(null); return; }
    let alive = true;
    fetchUserCompany(userCompanyId)
      .then((c) => { if (alive) setCompany(c); })
      .catch(() => { if (alive) setCompany(null); });
    return () => { alive = false; };
  }, [userCompanyId]);

  const fetchCategories = useCallback(async () => {
    if (!isRestaurant) return;
    try {
      const snap = await getDocs(getScopedQuery("menu_categories", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setCategories(data);
    } catch (e) { console.error(e); }
  }, [isRestaurant, userRole, userCompanyId, currentUser?.uid]);

  // خامات المطعم — لحساب إتاحة كل طبق من وصفته (بدل رقم quantity الوهمي للطبق)
  const [rawMats, setRawMats] = useState([]);
  const fetchRawMats = useCallback(async () => {
    if (!isRestaurantStock || !userCompanyId) { setRawMats([]); return; }
    try {
      const snap = await getDocs(getScopedQuery("raw_materials", userRole, userCompanyId, currentUser?.uid));
      setRawMats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  }, [isRestaurantStock, userRole, userCompanyId, currentUser?.uid]);

  const rawMatsById = useMemo(() => {
    const m = new Map();
    rawMats.forEach((x) => m.set(x.id, x));
    return m;
  }, [rawMats]);

  // أقصى عدد أطباق يتعمل من الخامات الحالية (null = الطبق بلا وصفة → غير معروف)
  // mult = معامل المقاس (الوسط يستهلك ×1.5 مثلاً)
  function dishAvailability(product, mult = 1) {
    if (!isRestaurantStock) return null;
    const m = parseFloat(mult) > 0 ? parseFloat(mult) : 1;
    const recipe = Array.isArray(product?.recipe)
      ? product.recipe.filter((e) => e?.materialId && parseFloat(e?.qty) > 0)
      : [];
    if (recipe.length === 0) return null;
    let max = Infinity;
    for (const step of recipe) {
      const mat = rawMatsById.get(step.materialId);
      if (!mat) return 0;
      const stockQty = parseFloat(mat.quantity) || 0;
      const need = (parseFloat(step.qty) || 0) * m;
      if (!(need > 0)) continue;
      const conv = convertQty(need, step.unit, mat.unit);
      if (!(conv.qty > 0)) return 0;
      max = Math.min(max, Math.floor(stockQty / conv.qty));
      if (max <= 0) return 0;
    }
    return max === Infinity ? null : max;
  }

  // مودال اختيار المقاس بسعره (منتجات المطعم متعددة الأحجام)
  const [sizePicker, setSizePicker] = useState(null);
  const sizePickerSizes = sizePicker && Array.isArray(sizePicker.sizes)
    ? sizePicker.sizes.filter((s) => s && s.size)
    : [];

  // ── الوردية والتقفيل اليدوي ──
  const [shift, setShift] = useState(null); // التقفيلة المفتوحة
  const [closings, setClosings] = useState([]);
  const [openingCash, setOpeningCash] = useState("");
  const [opening, setOpening] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeForm, setCloseForm] = useState({ countedCash: "", receiver: "", notes: "" });
  const [closePreview, setClosePreview] = useState(null);
  const [closing, setClosing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  // دفع مقسم (جزء كاش + جزء فيزا/محفظة) — مطعم فقط
  // (الحساب بـ Math.round هنا لأن round2 معرّفة تحت — تجنب TDZ)
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitMethod1, setSplitMethod1] = useState("cash");
  const [splitAmount1, setSplitAmount1] = useState("");
  const [splitMethod2, setSplitMethod2] = useState("visa");
  const [splitAmount2, setSplitAmount2] = useState("");
  const split1 = Math.round((parseFloat(splitAmount1) || 0) * 100) / 100;
  const split2 = Math.round((parseFloat(splitAmount2) || 0) * 100) / 100;
  const splitTotal = Math.round((split1 + split2) * 100) / 100;

  const fetchShift = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(getScopedQuery("closings", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setClosings(data.slice(0, 10));
      setShift(data.find((c) => c.status === "open") || null);
    } catch (e) { console.error(e); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  async function openShift(e) {
    e?.preventDefault();
    if (!userCompanyId) return;
    setOpening(true);
    try {
      const maxNo = closings.reduce((m, c) => Math.max(m, parseInt(c.number) || 0), 0);
      await addDoc(collection(db, "closings"), {
        number: maxNo + 1,
        status: "open",
        openedAt: new Date().toISOString(),
        openedBy: currentUser?.uid || null,
        openedByEmail: currentUser?.email || "",
        openingCash: parseFloat(openingCash) || 0,
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      setOpeningCash("");
      await fetchShift();
    } catch (err) {
      console.error(err);
      alert("تعذر فتح الوردية");
    }
    setOpening(false);
  }

  // حساب مبيعات الوردية المفتوحة (من فتحها لحد دلوقتي) — المرتجعات تنقص الكاش
  // داخل/خارج يُسحب تلقائياً من صفحة المصروفات والإدخالات (اتجاه in/out — القديم بدون اتجاه = خارج)
  async function previewClosing() {
    if (!shift) return;
    try {
      const [snap, retSnap, expSnap] = await Promise.all([
        getDocs(getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("returns", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("expenses", userRole, userCompanyId, currentUser?.uid)).catch((e) => {
          console.warn("expenses fetch for closing:", e?.message);
          return { docs: [] };
        }),
      ]);
      const from = new Date(shift.openedAt || shift.createdAt).getTime();
      const now = Date.now();
      const byMethod = {};
      let count = 0, total = 0, paid = 0, cashSales = 0;
      // فهرس الفواتير في النافذة دي — نحتاجه عشان نعرف مرتجع بيع تبع
      // فيتن أنا (الفاتورة الأم) كانت كاش ولا فيزا/endaréz，且 هل هي
      // في نفس النافذة ولا فات قديمة.
      const windowInvoices = new Map();
      snap.docs.forEach((d) => {
        const inv = d.data();
        const ap = inv.approval || "validated";
        if (ap !== "validated") return;
        const ts = new Date(inv.date || inv.createdAt || 0).getTime();
        if (ts >= from && ts <= now) {
          count++;
          // الإجمالي يشمل رسوم التوصيل (كانت ناقصة وbyMethod أكبر منها ظلمًا)
          total += (parseFloat(inv.amount) || 0) + (parseFloat(inv.deliveryFee) || 0);
          const p = parseFloat(inv.paidAmount) || 0;
          paid += p;
          // ⚠️ ما ن fallbackش على `source` — ده *مصدر الطلب* (whatsapp/direct)
          // مش طريقة دفع. كان بيخلي أي طلب واتساب نقدي يتحسب كاش في الدرج.
          if (inv.splitPayment && Array.isArray(inv.splitPayments)) {
            // فك المقسم لطرقه — جزء الكاش يدخل المتوقع (كان ضايع تحت "split")
            let hasCashPart = false;
            inv.splitPayments.forEach((sp) => {
              const m = sp.method || "cash";
              const a = parseFloat(sp.amount) || 0;
              byMethod[m] = (byMethod[m] || 0) + a;
              if (m === "cash") { cashSales += a; hasCashPart = true; }
            });
            windowInvoices.set(d.id, { ts, paymentMethod: hasCashPart ? "cash" : (inv.splitPayments[0]?.method || "cash") });
          } else {
            const m = inv.paymentMethod || "cash";
            byMethod[m] = (byMethod[m] || 0) + p;
            if (m === "cash") cashSales += p;
            windowInvoices.set(d.id, { ts, paymentMethod: m });
          }
        }
      });
      let returnsCount = 0, returnsTotal = 0, cashReturnsTotal = 0;
      retSnap.docs.forEach((d) => {
        const r = d.data();
        if (r.kind && r.kind !== "sale") return;
        const ts = new Date(r.date || r.createdAt || 0).getTime();
        if (!(ts >= from && ts <= now)) return;
        const amt = parseFloat(r.amount) || 0;
        returnsCount++;
        returnsTotal += amt;
        // مرتجع بطاقة/محفظة ما دخلش الدرج أصلاً، ومرتجع فاتورة من
        // وردية/شهر فات مااتحطش في درج النهاردة. الكود القديم كان بيخصم
        // أي مرتجع من المتوقع وده كان بيدي فرق وهمي كبير في التقفيل.
        const parent = r.refId ? windowInvoices.get(r.refId) : null;
        const parentIsCash = parent ? parent.paymentMethod === "cash" : false;
        const parentInWindow = parent ? parent.ts >= from : false;
        if (parentIsCash && parentInWindow) cashReturnsTotal += amt;
      });
      // نعرض الإجمالي في التقرير لكن نخصم الكاش بس من المتوقع
      let cashIn = 0, cashOut = 0, expInCount = 0, expOutCount = 0;
      try {
        expSnap.docs.forEach((d) => {
          const e = d.data();
          const ts = new Date(e.createdAt || e.date || 0).getTime();
          if (!(ts >= from && ts <= now)) return;
          const amt = parseFloat(e.amount) || 0;
          if ((e.direction || "out") === "in") { cashIn += amt; expInCount++; }
          else { cashOut += amt; expOutCount++; }
        });
      } catch (e) { console.warn("expenses sum:", e?.message); }
      setClosePreview({ count, total, paid, cashSales, byMethod, returnsCount, returnsTotal, cashReturnsTotal, cashIn, cashOut, expInCount, expOutCount });
      setShowCloseModal(true);
    } catch (err) {
      console.error(err);
      alert("تعذر حساب مبيعات الوردية");
    }
  }

  function closingExpected(preview, openingCashVal) {
    const cashSales = preview?.cashSales ?? preview?.paid ?? 0;
    // ⚠️ cashReturnsTotal (كاش + نفس النافذة) مش returnsTotal (كل المرتجعات)
    return round2(
      (parseFloat(openingCashVal) || 0) +
      cashSales +
      (parseFloat(preview?.cashIn) || 0) -
      (parseFloat(preview?.cashOut) || 0) -
      (parseFloat(preview?.cashReturnsTotal) || 0)
    );
  }

  async function submitClosing(e) {
    e.preventDefault();
    if (!shift || !closePreview) return;
    setClosing(true);
    try {
      const counted = parseFloat(closeForm.countedCash) || 0;
      const cashIn = parseFloat(closePreview.cashIn) || 0;
      const cashOut = parseFloat(closePreview.cashOut) || 0;
      const expected = closingExpected(closePreview, shift.openingCash);
      await updateDoc(doc(db, "closings", shift.id), {
        status: "closed",
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.uid || null,
        closedByEmail: currentUser?.email || "",
        salesCount: closePreview.count,
        salesTotal: closePreview.total,
        paidTotal: closePreview.paid,
        cashSales: closePreview.cashSales ?? closePreview.paid,
        byMethod: closePreview.byMethod,
        returnsCount: closePreview.returnsCount || 0,
        returnsTotal: closePreview.returnsTotal || 0,
        // المرتجع النقدي بس — اللي اتخصم فعليًا من المتوقع
        cashReturnsTotal: closePreview.cashReturnsTotal || 0,
        countedCash: counted,
        expectedCash: expected,
        difference: round2(counted - expected),
        cashIn,
        cashOut,
        expInCount: closePreview.expInCount || 0,
        expOutCount: closePreview.expOutCount || 0,
        receiver: closeForm.receiver || "",
        notes: closeForm.notes || "",
      });
      setShowCloseModal(false);
      setCloseForm({ countedCash: "", receiver: "", notes: "" });
      setClosePreview(null);
      await fetchShift();
      alert("تم تقفيل الوردية وحفظ التسليم");
    } catch (err) {
      console.error(err);
      alert("تعذر التقفيل");
    }
    setClosing(false);
  }

  useEffect(() => {
    Promise.all([fetchProducts(), fetchClients(), fetchCategories(), fetchRawMats(), fetchShift()]);
  }, [fetchProducts, fetchClients, fetchCategories, fetchRawMats, fetchShift]);

  // ── عميل جديد سريع: حفظ في العملاء واختياره فوراً ──
  async function handleQuickAddClient() {
    if (!newClientName.trim()) { alert("اكتب اسم العميل الأول"); return; }
    if (!userCompanyId) return;
    setAddingClient(true);
    try {
      const phoneToSave = (deliveryPhone || "").trim();
      // منع التكرار: لو الرقم موجود اختاره وخلاص
      if (phoneToSave) {
        const existing = clients.find((c) => (c.phone || "").trim() === phoneToSave);
        if (existing) {
          setSelectedClient(existing.id);
          setNewClientName("");
          setAddingClient(false);
          return;
        }
      }
      const docRef = await addDoc(collection(db, "clients"), {
        name: newClientName.trim(),
        phone: phoneToSave,
        address: (deliveryAddress || "").trim(),
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      const newClient = { id: docRef.id, name: newClientName.trim(), phone: phoneToSave, address: (deliveryAddress || "").trim() };
      setClients((prev) => [...prev, newClient]);
      setSelectedClient(docRef.id);
      setNewClientName("");
    } catch (e) {
      console.error(e);
      alert("تعذر حفظ العميل");
    }
    setAddingClient(false);
  }

  // ── لما الكاشير يكتب رقم التليفون: هات آخر عنوان متسجل لنفس الرقم ──
  async function lookupAddressByPhone(phone) {
    const clean = (phone || "").trim();
    if (!isRestaurant || clean.length < 7 || !userCompanyId) {
      setPhoneHint("");
      return;
    }
    // لو الرقم بتاع عميل مسجل اختاره تلقائي
    const matched = clients.find((c) => (c.phone || "").trim() === clean);
    if (matched) {
      setSelectedClient(matched.id);
      if (!deliveryAddress.trim() && matched.address) {
        setDeliveryAddress(matched.address);
      }
    }
    try {
      const q = query(
        collection(db, "invoices"),
        where("companyId", "==", userCompanyId),
        where("deliveryPhone", "==", clean),
        orderBy("createdAt", "desc"),
        limit(3)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const last = snap.docs[0].data();
        // لو العنوان فاضي عند الكاشير عبّيه تلقائي من آخر أوردر
        if (!deliveryAddress.trim() && last.deliveryAddress) {
          setDeliveryAddress(last.deliveryAddress);
        }
        setPhoneHint(`✓ زبون متكرر — آخر طلب: ${last.deliveryAddress || "بدون عنوان"}`);
      } else {
        setPhoneHint("");
      }
    } catch (e) {
      // index ناقص أو خطأ — نتجاهل بهدوء عشان منعطلش الكاشير
      console.warn("phone lookup:", e.message);
    }
  }

  // ── تكرار آخر أوردر لنفس الرقم (بنفس الأصناف) ──
  async function repeatLastOrder() {
    const clean = (deliveryPhone || "").trim();
    if (clean.length < 7) { alert("اكتب رقم التليفون الأول"); return; }
    if (!userCompanyId) return;
    setRepeating(true);
    try {
      const q = query(
        collection(db, "invoices"),
        where("companyId", "==", userCompanyId),
        where("deliveryPhone", "==", clean),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) { alert("مفيش أوردرات سابقة للرقم ده"); return; }
      const last = snap.docs[0].data();
      const items = last.items || [];
      if (items.length === 0) { alert("آخر أوردر فاضي"); return; }
      // رجّع الأصناف للسلة لو المنتج لسه موجود ومتاح
      // (مطعم: السقف من إتاحة الوصفة مش من رقم الطبق الوهمي)
      const restored = [];
      for (const it of items) {
        const prod = products.find((p) => p.id === it.productId);
        if (!prod) continue;
        const size = it.size || "";
        const mult = parseFloat(it.mult) > 0 ? parseFloat(it.mult) : 1;
        const key = cartKeyOf(prod.id, size);
        const avail = isRestaurantStock ? dishAvailability(prod) : null;
        const cap = avail === null ? (prod.quantity || 0) : Math.floor(avail / mult);
        const qty = Math.min(it.quantity || 1, cap);
        if (qty <= 0) continue;
        restored.push({ ...prod, key, size, mult, price: it.price ?? prod.price, quantity: qty, stockQty: cap });
      }
      if (restored.length === 0) { alert("أصناف آخر أوردر مش متاحة حالياً"); return; }
      setCart(restored);
      if (last.deliveryAddress) setDeliveryAddress(last.deliveryAddress);
      if (last.tableNumber) setTableNumber(String(last.tableNumber));
      if (last.orderType) setOrderType(last.orderType);
      if (last.source) setOrderSource(last.source);
    } catch (e) {
      console.error(e);
      alert("تعذر جلب آخر أوردر");
    }
    setRepeating(false);
  }

  // فلتر المنتجات (شامل الباركود للسكانر)
  const filteredProducts = products.filter((p) => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      p.name.toLowerCase().includes(term) ||
      (p.category && p.category.toLowerCase().includes(term)) ||
      (p.type && p.type.toLowerCase().includes(term)) ||
      (p.size && p.size.toLowerCase().includes(term)) ||
      (p.color && p.color.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.toLowerCase().includes(term));
    const matchCat = filterCategory === "all" || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  // السكانر: Enter على باركود مطابق تماماً يضيف للسلة فوراً
  function handleSearchKeyDown(e) {
    if (e.key !== "Enter") return;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return;
    const exact = products.find((p) => (p.barcode || "").toLowerCase() === term);
    if (exact) {
      e.preventDefault();
      addToCart(exact);
      setSearchTerm("");
    }
  }

  function getCategoryLabel(catId) {
    const found = categories.find((c) => c.id === catId || c.name === catId);
    if (found) return `${found.icon || ""} ${found.name}`;
    return catId || "";
  }

  // ── دالة مساعدة للـ details ──
  const getProductDetails = (product) => {
    if (isRestaurant) return product.description || "";
    const details = [];
    if (product.type) {
      const typeMap = { men: t("inv.typeMen"), women: t("inv.typeWomen"), boys: t("inv.typeBoys"), girls: t("inv.typeGirls"), unisex: t("inv.typeUnisex") };
      details.push(typeMap[product.type] || product.type);
    }
    if (product.size) details.push(product.size);
    if (product.color) details.push(product.color);
    return details.join(" - ");
  };

  // ── إدارة السلة ──
  // مفتاح السطر = الصنف + المقاس (نفس الصنف بمقاسين = سطرين)
  const cartKeyOf = (productId, size) => `${productId}__${size || ""}`;
  // sizeOpt للمطعم: { size, price, mult } من المقاس المختار — بدونه السعر/المقاس الأساسي
  function addToCart(product, sizeOpt = null) {
    // صيدلية: منع بيع صنف منتهي الصلاحية (تاريخ الصنف نفسه)
    if (isPharmacy && product.expiryDate) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (new Date(product.expiryDate) < today) { alert("هذا الدواء منتهي الصلاحية — البيع موقوف"); return; }
    }
    const size = sizeOpt?.size ?? product.size ?? "";
    const price = sizeOpt ? (parseFloat(sizeOpt.price) || 0) : product.price;
    const mult = sizeOpt ? (parseFloat(sizeOpt.mult) > 0 ? parseFloat(sizeOpt.mult) : 1) : 1;
    const key = cartKeyOf(product.id, size);
    // مطعم: السقف من إتاحة الوصفة × المعامل (null = بلا وصفة → السماح مع تحذير الشارة)
    const avail = isRestaurantStock ? dishAvailability(product) : null;
    const cap = avail === null ? (product.quantity ?? Infinity) : Math.floor(avail / mult);
    // ملاحظة التحضير الافتراضية تتملي تلقائيًا لو الكاشير مكتبش واحدة
    if (isRestaurant && product.preparationNote) {
      setCartItemNotes((prevNotes) => {
        if (prevNotes[key]) return prevNotes;
        return { ...prevNotes, [key]: product.preparationNote };
      });
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        if (existing.quantity + 1 > cap) { alert(t("pos.qtyOver")); return prev; }
        return prev.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item);
      } else {
        if (cap < 1) { alert(t("pos.notAvail")); return prev; }
        return [...prev, { ...product, key, size, price, mult, quantity: 1, stockQty: cap }];
      }
    });
  }

  function removeFromCart(cartKey) {
    setCart((prev) => prev.filter((item) => (item.key || item.id) !== cartKey));
    setCartItemNotes((prev) => { const n = { ...prev }; delete n[cartKey]; return n; });
    setCartItemExtras((prev) => { const n = { ...prev }; delete n[cartKey]; return n; });
  }

  function updateCartQuantity(cartKey, newQty) {
    if (newQty < 0) return;
    if (newQty === 0) { removeFromCart(cartKey); return; }
    setCart((prev) => prev.map((item) => {
      if ((item.key || item.id) !== cartKey) return item;
      if (newQty > (item.stockQty || item.quantity)) { alert(t("pos.qtyOver")); return item; }
      return { ...item, quantity: newQty };
    }));
  }

  // حساب سعر صنف مع الإضافات — للمطعم فقط (مخفي للكافيه)
  function getItemTotalPrice(item) {
    const basePrice = (item.price || 0) * item.quantity;
    if (!isRestaurant) return basePrice;
    const extras = item.extras || [];
    const selectedExtraIdxs = cartItemExtras[item.key || item.id] || [];
    const extrasTotal = selectedExtraIdxs.reduce((sum, idx) => {
      const ex = extras[idx];
      return ex ? sum + (parseFloat(ex.price) || 0) * item.quantity : sum;
    }, 0);
    return basePrice + extrasTotal;
  }

  const subtotal = round2(cart.reduce((sum, item) => sum + getItemTotalPrice(item), 0));
  // خصم المطعم (مبلغ أو نسبة) — الكافيه والمطعم فقط، وباقي الأنشطة بلا خصم كما كانت
  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState("amount");
  const discountRaw = Math.max(0, parseFloat(discount) || 0);
  const discountNum = (isRestaurant && discountRaw > 0)
    ? (discountType === "percent"
      ? round2(subtotal * Math.min(discountRaw, 100) / 100)
      : round2(Math.min(discountRaw, subtotal)))
    : 0;
  const deliveryFeeNum = parseFloat(deliveryFee) || 0;
  // ⚠️ رسوم التوصيل لازم تفضل بره amount. كل القارئات (InvoiceTable.jsx،
  //    utils/invoiceHelpers.js، Invoices.js) بتعمل totalWithFee = amount + deliveryFee.
  //    لو حطيناها جوّه amount كمان، الفاتورة كانت بتعرض 240 بدل 120.
  const total = round2(Math.max(0, subtotal - discountNum) + (orderType === "delivery" ? deliveryFeeNum : 0));

  // ── طباعة حرارية ──
  // ── الفاتورة ──
  // بتطبع لكل المهنة. العناوين والبيانات بتتظبط حسب الصناعة
  // (فاتورة كشف للعيادة، فاتورة طلب للمطعم/الكافيه، فاتورة بيع للباقي)،
  // وكل القيم المتغيّرة بتعمل HTML-escape جوه نافذة الطباعة.
  function printSaleReceipt(invoiceData, docId) {
    const code = receiptCode(docId);
    const blocks = [];

    // حقول المطعم/الكافيه بس — ما تظهرش في فاتورة صيدلية
    if (isRestaurant) {
      const typeLabel = ORDER_TYPES.find((o) => o.value === orderType)?.label || "";
      const sourceLabel = ORDER_SOURCES.find((o) => o.value === orderSource)?.label || "";
      if (typeLabel) blocks.push({ label: "نوع الطلب", value: typeLabel });
      if (sourceLabel) blocks.push({ label: "المصدر", value: sourceLabel });
      if (orderType === "delivery" && deliveryAddress) {
        blocks.push({ label: "العنوان", value: deliveryAddress });
      }
      if (deliveryPhone.trim()) blocks.push({ label: "الهاتف", value: deliveryPhone.trim() });
      if (orderType === "dine_in" && tableNumber) {
        blocks.push({ label: "الطاولة", value: tableNumber });
      }
      if (customerNote.trim()) blocks.push({ label: "ملاحظة", value: customerNote.trim() });
    }

    const res = printReceipt({
      lang,
      industry: userIndustry,
      storeName: company?.name || "",
      code,
      cashier: currentUser?.displayName || currentUser?.email || "",
      clientName: invoiceData?.clientName || "",
      paymentLabel: invoiceData?.splitPayment && Array.isArray(invoiceData?.splitPayments)
        ? invoiceData.splitPayments.map((sp) => `${getPaymentLabel(sp.method)} ${(parseFloat(sp.amount) || 0).toFixed(2)}`).join(" + ")
        : getPaymentLabel(invoiceData?.paymentMethod || paymentMethod),
      items: (invoiceData?.items || []).map((it) => ({
        name: it.productName,
        quantity: it.quantity,
        price: it.price,
        total: it.itemTotal ?? it.amount ?? 0,
        size: it.productSize,
        color: it.productColor,
        type: it.productType,
        note: it.note,
        extras: it.extras,
      })),
      subtotal: invoiceData?.subtotal ?? 0,
      discount: invoiceData?.discount ?? 0,
      deliveryFee: invoiceData?.deliveryFee ?? 0,
      total: invoiceData?.total ?? 0,
      paid: invoiceData?.paidAmount ?? null,
      blocks,
      barcode: true,
    });

    if (!res.ok) {
      // المتصفح رفض الـ popup. تقولnetscape للمستخدم رقم الفاتورة يدويًا
      // بدل ما يختفي البيع من غير أثر.
      alert(
        "تم البيع بنجاح، بس المتصفح منع فتح نافذة الطباعة.\n" +
          "اسمح بالـ popups لهذا الموقع أو اطبع الفاتورة من صفحة الفواتير.\n" +
          "رقم الفاتورة: " + code
      );
    }
  }



  // ── Checkout ──
  async function checkout(e) {
    e.preventDefault();
    if (cart.length === 0) { alert(t("pos.addFirst")); return; }
    if (isRestaurant && orderType === "delivery" && !deliveryAddress.trim()) {
      alert("يرجى إدخال عنوان التوصيل"); return;
    }
    // التحقق من الدفع المقسم: مبلغين + طريقتين مختلفتين + المجموع = الإجمالي
    if (isRestaurant && splitPayment) {
      if (!(split1 > 0) || !(split2 > 0)) { alert("اكتب مبالغ الدفع المقسم"); return; }
      if (splitMethod1 === splitMethod2) { alert("طريقتا الدفع المقسم لازم تكونا مختلفتين"); return; }
      if (Math.abs(splitTotal - total) > 0.01) {
        alert(`مجموع الدفع (${splitTotal.toFixed(2)}) لا يساوي الإجمالي (${total.toFixed(2)})`); return;
      }
    }
    setSubmitting(true);
    try {
      // لو الكاشير كتب اسم عميل جديد من غير ما يدوس حفظ — احفظه تلقائي مع الفاتورة
      let finalClientId = selectedClient || null;
      let finalClientName = clients.find((c) => c.id === selectedClient)?.name || "";
      if (isRestaurant && !finalClientId && (newClientName.trim() || deliveryPhone.trim())) {
        try {
          const phoneToSave = (deliveryPhone || "").trim();
          const existing = phoneToSave ? clients.find((c) => (c.phone || "").trim() === phoneToSave) : null;
          if (existing) {
            finalClientId = existing.id;
            finalClientName = existing.name;
          } else {
            const cRef = await addDoc(collection(db, "clients"), {
              name: newClientName.trim() || `زبون ${phoneToSave || "نقدي"}`,
              phone: phoneToSave,
              address: (deliveryAddress || "").trim(),
              companyId: userCompanyId,
              createdBy: currentUser?.uid || null,
              createdAt: new Date().toISOString(),
            });
            finalClientId = cRef.id;
            finalClientName = newClientName.trim() || phoneToSave;
            setClients((prev) => [...prev, { id: cRef.id, name: finalClientName, phone: phoneToSave, address: (deliveryAddress || "").trim() }]);
          }
        } catch (e) { console.warn("auto-create client:", e.message); }
      }

      // ═══════════════════════════════════════════════════════════════
      // CHECKOUT — ذرّي (atomic)
      // ═══════════════════════════════════════════════════════════════
      // المشكلة القديمة: كان بينزل المخزون سطر سطر (getDoc + updateDoc) وبعدين
      // يعمل addDoc للفاتورة. لو أي خطوة فشلت، كان المخزون اتخصم والبيع
      // ماتسجلش — خسارة صامتة. وكمان مفيش فحص كفاية مخزون، فكان بينتج
      // مخزون سالب، وفحص الصلاحية في الصيدلية كان بيرمي بعد الخصم.
      //
      // الحل: validate كل حاجة قبل أي كتابة، بعدين runTransaction واحد فيه
      // (أ) كل القراءات (ب) كل الكتابات — Firestore بيطلب الترتيب ده بالظبط.
      const batchSnap = isPharmacy
        ? await getDocs(getScopedQuery("batches", userRole, userCompanyId, currentUser?.uid))
        : null;
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      // ── مرحلة 1: تحقّق (مفيش أي كتابة) ──
      // مطعم: توافر الخامات عبر وصفات الأطباق (كمية الطبق نفسها لا تُخصم)
      let recipeMats = [];
      if (isRestaurantStock) {
        const dishIds = [...new Set(cart.map((item) => item.id))];
        const menuSnaps = await Promise.all(dishIds.map((id) => getDoc(doc(db, "inventory", id))));
        const dishById = new Map(dishIds.map((id, i) => [id, menuSnaps[i]]));
        const { materialLines, skipped } = expandRecipeLines(
          // المقاس يضاعف استهلاك الوصفة (وسط ×1.5 مثلاً)
          cart.map((item) => ({ productId: item.id, quantity: (parseFloat(item.quantity) || 0) * (parseFloat(item.mult) > 0 ? parseFloat(item.mult) : 1) })), dishById
        );
        if (skipped.length > 0) console.warn("POS dishes without recipe (stock not consumed):", skipped);
        const matSnaps = await Promise.all(materialLines.map((l) => getDoc(doc(db, "raw_materials", l.productId))));
        recipeMats = materialLines.map((line, i) => ({
          line,
          ref: doc(db, "raw_materials", line.productId),
          name: matSnaps[i].data()?.name || line.productId,
          avail: parseFloat(matSnaps[i].data()?.quantity) || 0,
        }));
        recipeMats.forEach(({ line, name, avail }) => {
          if (avail < line.quantity) {
            throw new Error(`الخامة غير متوفرة: "${name}" — المتاح ${avail} والمطلوب ${line.quantity}`);
          }
        });
      }
      const stockRefs = isRestaurantStock ? [] : cart.map((item) => doc(db, "inventory", item.id));
      const stockSnaps = await Promise.all(stockRefs.map((r) => getDoc(r)));

      stockSnaps.forEach((snap, i) => {
        const item = cart[i];
        if (!snap.exists()) {
          throw new Error(`المنتج "${item.name}" غير موجود في المخزون`);
        }
        const currentQty = parseFloat(snap.data().quantity) || 0;
        if (currentQty < item.quantity) {
          throw new Error(
            `الكمية غير متوفرة: "${item.name}" — المتاح ${currentQty} والمطلوب ${item.quantity}`
          );
        }
      });

      // FEFO للصيدلية: خطّط الصرف قبل أي كتابة، وتأكد إن الكمية تكفي
      const fefoPlan = new Map(); // productId -> [{ batchId, take }]
      if (isPharmacy && batchSnap) {
        const allBatches = batchSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        cart.forEach((item) => {
          const valid = allBatches
            .filter((b) => b.productId === item.id && (parseFloat(b.quantity) || 0) > 0)
            .sort((a, b) => new Date(a.expiryDate || "9999") - new Date(b.expiryDate || "9999"));

          // ⚠️🔴 إصلاح: الصنف اللي **مالوش تشغيلات مسجّلة خالص** (غالبًا
          // اتعمل من صفحة المخزون مباشرة، أو دوا قديم) كان بيترمي
          // "ناقص 1" وميتباعش أبدًا — مع إن مخزونه وافر.
          // السبب: usable فاضي فـ remaining فضل = الكمية المطلوبة.
          //
          // الصحيح: FEFO بتطبَّق على الأدوية اللي **بتتتبع صلاحيتها فقط**
          // (اللي ليها تشغيلة). اللي مالوش تشغيلة = صنف عادي، نبيعه من
          // المخزون زي ما الكود القديم كان بيعمل.
          if (valid.length === 0) {
            fefoPlan.set(item.id, []); // من غير صرف على تشكيلات
            return;
          }

          const usable = valid.filter(
            (b) => !b.expiryDate || new Date(b.expiryDate) >= todayStart
          );
          const expired = valid.filter(
            (b) => b.expiryDate && new Date(b.expiryDate) < todayStart
          );
          if (usable.length === 0) {
            const names = valid.map((b) => b.batchNumber || b.id).join("، ");
            const dates = valid
              .map((b) => b.expiryDate)
              .filter(Boolean)
              .join("، ");
            throw new Error(
              `الدواء "${item.name}" كل تشغيلاته منتهية الصلاحية (${names}${dates ? " — " + dates : ""}). ` +
              `امسح/عدّل التشغيلة من صفحة "التشغيلات" أو سجّل له تشغيلة جديدة.`
            );
          }
          let remaining = item.quantity;
          const plan = [];
          usable.forEach((b) => {
            if (remaining <= 0) return;
            const take = Math.min(remaining, parseFloat(b.quantity) || 0);
            if (take > 0) plan.push({ batchId: b.id, take });
            remaining = round2(remaining - take);
          });
          // ⚠️ هنا التشكيلات موجودة، فلازم تغطي الكمية. لو ماغطتتش
          // معناه إن الكمية المتبقية مش موجودة فعلاً.
          if (remaining > 0.001) {
            throw new Error(
              `الكمية غير متوفرة في التشغيلات الصالحة: "${item.name}" — ناقص ${remaining}`
            );
          }
          if (expired.length > 0) {
            console.warn("expired batches skipped:", expired.map((b) => b.batchNumber));
          }
          fefoPlan.set(item.id, plan);
        });
      }

      // ── مرحلة 2: الكتابة الذرّية ──
      // فهرس: مسار دوك التشغيلة → إجمالي الكمية اللي هتخصم منه.
      // لازم نبنيه جوّه الـ transaction عشان نعرف الكمية المخصومة لكل دوك.
      const fefoTakes = new Map();
      const batchWriteRefs = [];
      if (isPharmacy) {
        fefoPlan.forEach((plan) =>
          plan.forEach(({ batchId, take }) => {
            const ref = doc(db, "batches", batchId);
            batchWriteRefs.push(ref);
            fefoTakes.set(ref.path, round2((fefoTakes.get(ref.path) || 0) + take));
          })
        );
      }

      const invDoc = {
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdByEmail: currentUser?.email || "",
        clientId: finalClientId,
        clientName: finalClientName,
        items: cart.map((item) => {
          const selectedExtraIdxs = cartItemExtras[item.key || item.id] || [];
          const selectedExtras = (item.extras || []).filter((_, i) => selectedExtraIdxs.includes(i));
          return {
            productId: item.id,
            productName: item.name,
            // amount مخزّن كمان عشان Sales.jsx والتقارير يقراوا السعر وقت
            // البيع مش السعر الحالي للمنتج (اللي بيتغيّر بعد كده).
            amount: round2(getItemTotalPrice(item)),
            quantity: item.quantity,
            price: item.price || 0,
            // المقاس ومعامل الوصفة — للمرتجع والتكلفة (افتراضي مقاس/معامل 1)
            size: item.size || "",
            mult: parseFloat(item.mult) > 0 ? parseFloat(item.mult) : 1,
            extras: isRestaurant ? selectedExtras : [],
            note: cartItemNotes[item.key || item.id] || "",
            itemTotal: round2(getItemTotalPrice(item)),
            // حقول الملابس
            productType: item.type || "",
            productSize: item.size || "",
            productColor: item.color || "",
          };
        }),
        subtotal,
        discount: discountNum,
        discountType: isRestaurant ? discountType : "",
        deliveryFee: isRestaurant && orderType === "delivery" ? deliveryFeeNum : 0,
        total,
        // amount = قيمة البضاعة بس (بدون توصيل) — ده الـ contract اللي كل
        // القارئات بتفترضه. الـ total هو اللي اتحصّل فعلاً.
        amount: subtotal,
        status: "paid",
        paidAmount: total,
        paymentMethod: (isRestaurant && splitPayment) ? "split" : (paymentMethod || "cash"),
        ...(isRestaurant && splitPayment ? { splitPayment: true, splitPayments: [{ method: splitMethod1, amount: split1 }, { method: splitMethod2, amount: split2 }] } : {}),
        approval: "validated",
        validatedBy: currentUser?.uid || null,
        validatedAt: new Date().toISOString(),
        // حقول المطعم
        orderType: isRestaurant ? orderType : "",
        orderSource: isRestaurant ? orderSource : "",
        source: isRestaurant ? orderSource : "",
        orderStatus: isRestaurant ? "new" : "",
        deliveryAddress: isRestaurant && orderType === "delivery" ? deliveryAddress : "",
        deliveryPhone: isRestaurant ? deliveryPhone.trim() : "",
        tableNumber: isRestaurant && orderType === "dine_in" ? tableNumber : "",
        customerNote: isRestaurant ? customerNote : "",
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        type: "pos",
      };

      const invoiceRef = doc(collection(db, "invoices"));

      // أوفلاين: نفس الفحوصات على الكاش + batch تُحفظ محليًا وتتزامن لاحقًا.
      // (ليست ذرّية عبر الأجهزة — مقبول في وضع الانقطاع، والسيرفر هو المرجع عند التزامن)
      if (isOffline()) {
        const { refs: matRefs, snaps: matSnaps } = recipeMats.length
          ? await readStockCache("raw_materials", recipeMats.map((m) => m.line.productId))
          : { refs: [], snaps: [] };
        const matById = new Map(matRefs.map((r, i) => [r.id, matSnaps[i]]));
        if (isRestaurantStock && recipeMats.length) {
          try {
            const entries = recipeMats.map((m) => ({ ref: m.ref, snap: matById.get(m.line.productId) || null, line: m.line }));
            if (entries.some((e) => !e.snap || !e.snap.exists())) throw new Error(t("offline.noData"));
            planStockOut(entries, { isTrader: false });
          } catch (txErr) {
            if (txErr?.message === "INSUFFICIENT_STOCK") throw new Error("الكمية غير متوفرة في الخامات — قلل الكمية أو سجّل فاتورة شراء أولاً");
            throw txErr;
          }
        }
        const batch = writeBatch(db);
        if (!isRestaurantStock) {
          stockSnaps.forEach((snap, i) => {
            const item = cart[i];
            if (!snap.exists()) throw new Error(t("offline.noData"));
            const currentQty = parseFloat(snap.data().quantity) || 0;
            if (currentQty < item.quantity) {
              throw new Error(`الكمية غير متوفرة: "${item.name}" — المتاح ${currentQty} والمطلوب ${item.quantity}`);
            }
            batch.update(stockRefs[i], { quantity: round2(currentQty - item.quantity) });
          });
        } else if (recipeMats.length) {
          const entries = recipeMats.map((m) => ({ ref: m.ref, snap: matById.get(m.line.productId), line: m.line }));
          planStockOut(entries, { isTrader: false }).forEach(({ ref, updates }) => batch.update(ref, updates));
        }
        const batchById = new Map((batchSnap?.docs || []).map((d) => [d.id, d]));
        batchWriteRefs.forEach((ref) => {
          const snap = batchById.get(ref.id);
          const currentQty = parseFloat(snap?.data()?.quantity) || 0;
          const take = fefoTakes.get(ref.path) || 0;
          batch.update(ref, { quantity: round2(currentQty - take) });
        });
        batch.set(invoiceRef, invDoc);
        await batch.commit();
      } else
      await runTransaction(db, async (tx) => {
        // كل القراءات الأول — Firestore بيرفض أي كتابة قبل آخر قراءة
        const freshSnaps = await Promise.all(stockRefs.map((r) => tx.get(r)));
        const freshBatches = batchWriteRefs.length
          ? await Promise.all(batchWriteRefs.map((r) => tx.get(r)))
          : [];
        // مطعم: إعادة قراءة الخامات جوّه الـ transaction
        const freshMats = isRestaurantStock && recipeMats.length
          ? await Promise.all(recipeMats.map((m) => tx.get(m.ref)))
          : [];

        // إعادة التحقق جوّه الـ transaction (الكمية ممكن تكون اتغيّرت
        // بين التحقق الأول والـ transaction من جهاز تاني)
        freshSnaps.forEach((snap, i) => {
          const item = cart[i];
          const currentQty = parseFloat(snap.data()?.quantity) || 0;
          if (currentQty < item.quantity) {
            throw new Error(
              `الكمية غير متوفرة: "${item.name}" — المتاح ${currentQty} والمطلوب ${item.quantity}`
            );
          }
        });

        // ── بعد ما كل القراءات خلصت: كل الكتابات ──
        freshSnaps.forEach((snap, i) => {
          const item = cart[i];
          const currentQty = parseFloat(snap.data()?.quantity) || 0;
          tx.update(stockRefs[i], { quantity: round2(currentQty - item.quantity) });
        });

        // مطعم: خصم الخامات (كمية الطبق لا تُخصم — الاستهلاك عبر الوصفة فقط)
        if (isRestaurantStock && recipeMats.length) {
          try {
            const entries = freshMats.map((snap, i) => ({ ref: recipeMats[i].ref, snap, line: recipeMats[i].line }));
            planStockOut(entries, { isTrader: false }).forEach(({ ref, updates }) => tx.update(ref, updates));
          } catch (txErr) {
            // سباق نادر: خامة خلصت بين التحقق والكتابة — رسالة عربية للكاشير
            if (txErr?.message === "INSUFFICIENT_STOCK") throw new Error("الكمية غير متوفرة في الخامات — قلل الكمية أو سجّل فاتورة شراء أولاً");
            throw txErr;
          }
        }

        freshBatches.forEach((snap, i) => {
          const ref = batchWriteRefs[i];
          const currentQty = parseFloat(snap.data()?.quantity) || 0;
          const take = fefoTakes.get(ref.path) || 0;
          tx.update(ref, { quantity: round2(currentQty - take) });
        });

        tx.set(invoiceRef, invDoc);
      });

      // ── الفاتورة: بتطبع لكل المهن، مش للمطاعم بس ──
      // قبل كند كان السطر ده شغال لو isRestaurant بس، فأي صيدلية/ملابس/
      // مقاول بيبيع مبيطبعش حاجة وبيشوف alert "تم البيع" وخلاص.
      printSaleReceipt(invDoc, invoiceRef.id);

      // طلب صالة برقم طاولة → إشغالها تلقائيًا (نار وهادئة — لا توقف البيع لو فشلت)
      if (orderType === "dine_in" && tableNumber.trim()) {
        occupyTableByNumber(userCompanyId, tableNumber.trim());
      }

      // reset
      setCart([]);
      setSelectedClient("");
      setPaymentMethod("cash");
      setNewClientName("");
      setOrderType("takeaway");
      setOrderSource("direct");
      setDeliveryAddress("");
      setDeliveryPhone("");
      setDeliveryFee("");
      setDiscount("");
      setDiscountType("amount");
      setSplitPayment(false);
      setSplitAmount1("");
      setSplitAmount2("");
      setTableNumber("");
      setCustomerNote("");
      setPhoneHint("");
      setCartItemNotes({});
      setCartItemExtras({});
      // reset — تحديث المخزون محليًا بدل سحب كل الأصناف بالصور من جديد
      // (نفس حساب السيرفر؛ أي فرق من جهاز آخر يتظبط مع أول تحميل كامل)
      if (!isRestaurantStock) {
        const soldMap = new Map(cart.map((item) => [item.id, item.quantity]));
        setProducts((prev) => prev.map((p) => soldMap.has(p.id)
          ? { ...p, quantity: round2(Math.max(0, (parseFloat(p.quantity) || 0) - soldMap.get(p.id))) }
          : p));
      }
      // تحديث الخامات بعد البيع عشان شارات الإتاحة تتظبط فورًا
      await Promise.all([fetchClients(), fetchRawMats()]);
      // مفيش alert("تم البيع") بعد كند — الفاتورة اللي طالعة في نافذة الطباعة
      // هي التأكيد. alert كان بيغطي على نافذة الطباعة وبيزحلقها.
    } catch (e) {
      console.error(e);
      // أوفلاين وبيانات غير مخزنة: رسالة مفهومة بدل خطأ تقني إنجليزي
      if (e?.code === "unavailable" && isOffline()) {
        alert(t("offline.noData"));
        setSubmitting(false);
        return;
      }
      // ⚠️ مابنشوفش "pos.fail" بس — الكاشير لازم يعرف السبب (كمية غير متوفرة،
      // دوا منتهي، صلاحية مقفولة...) عشان يقرر يسكوب الطلب ولا يعدّل الكمية.
      const reason = typeof e?.message === "string" ? e.message : "";
      const isBusinessError =
        /الكمية|المنتج|الدواء|التشغيلات|الصلاحية|منتهية/.test(reason) ||
        /insufficient|expired|unavailable/i.test(reason);
      alert(isBusinessError && reason ? reason : t("pos.fail"));
      // لو السبب تقني مش تجاري، نخلّي الكاشير يعرف إن العملية اتوقفت
      if (!isBusinessError) console.warn("checkout failed — cart kept, no stock touched");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading"><div className="spinner"></div>{t("pos.loading")}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-cash-register" style={{ color: "#10b981", marginLeft: 10 }}></i>
              {isRestaurant ? `${foodIcon} كاشير ${foodLabel}` : t("pos.title")}
            </h1>
            <p className="subtitle">{isRestaurant ? `تسجيل طلبات ${foodLabel} ـ تيك أواي وتوصيل سريع` : t("pos.subtitle")}</p>
          </div>
        </div>

        {/* ── شريط الوردية ── */}
        {!shift ? (
          <form onSubmit={openShift} style={{ display: "flex", gap: 8, alignItems: "center", background: "#fffbeb", border: "2px dashed #f59e0b", borderRadius: 10, padding: "8px 12px", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>🕐 مفيش وردية مفتوحة</span>
            <input type="number" min="0" step="0.01" placeholder="كاش بداية الوردية (اختياري)"
              value={openingCash} onChange={(e) => setOpeningCash(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, width: 200 }} />
            <button type="submit" disabled={opening} className="btn-primary btn-sm">{opening ? "..." : "فتح وردية"}</button>
            {closings.length > 0 && (
              <button type="button" onClick={() => setShowHistory(!showHistory)} className="btn-secondary btn-sm">التقفيلات السابقة ({closings.length})</button>
            )}
          </form>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#f0fdf4", border: "2px solid #86efac", borderRadius: 10, padding: "8px 12px", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>
              🟢 وردية #{shift.number} مفتوحة منذ {shift.openedAt ? new Date(shift.openedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "—"}
            </span>
            <span style={{ fontSize: 12, color: "#64748b" }}>كاش البداية: {moneyShort(shift.openingCash || 0, locale)}</span>
            <button type="button" onClick={previewClosing} className="btn-primary btn-sm" style={{ marginInlineEnd: "auto" }}>تقفيل الوردية</button>
            <button type="button" onClick={() => setShowHistory(!showHistory)} className="btn-secondary btn-sm">السجل</button>
          </div>
        )}

        {showHistory && closings.length > 0 && (
          <div className="table-container" style={{ marginBottom: 16 }}>
            <div className="table-header"><h3>تقفيلات سابقة</h3></div>
            <table>
              <thead><tr><th>#</th><th>الفتح</th><th>القفل</th><th>فواتير</th><th>محصل</th><th>مرتجع عدد</th><th>مرتجع مبلغ</th><th>داخل</th><th>خارج</th><th>معدود</th><th>الفرق</th><th>المستلم</th></tr></thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>#{c.number}</td>
                    <td style={{ fontSize: 12 }}>{c.openedAt ? fmtDateTime(c.openedAt, locale) : "—"}</td>
                    <td style={{ fontSize: 12 }}>{c.closedAt ? fmtDateTime(c.closedAt, locale) : <span style={{ color: "#16a34a", fontWeight: 700 }}>مفتوحة</span>}</td>
                    <td>{c.salesCount ?? "—"}</td>
                    <td style={{ fontWeight: 700 }}>{c.paidTotal != null ? moneyShort(c.paidTotal, locale) : "—"}</td>
                    <td>{c.returnsCount ?? "—"}</td>
                    <td style={{ color: "#b45309", fontWeight: 700 }}>{c.returnsTotal != null ? moneyShort(c.returnsTotal, locale) : "—"}</td>
                    <td style={{ color: "#16a34a", fontWeight: 700 }}>{c.cashIn != null ? moneyShort(c.cashIn, locale) : "—"}</td>
                    <td style={{ color: "#dc2626", fontWeight: 700 }}>{c.cashOut != null ? moneyShort(c.cashOut, locale) : "—"}</td>
                    <td>{c.countedCash != null ? moneyShort(c.countedCash, locale) : "—"}</td>
                    <td style={{ fontWeight: 800, color: (c.difference || 0) === 0 ? "#16a34a" : (c.difference || 0) > 0 ? "#2563eb" : "#dc2626" }}>
                      {c.difference != null ? `${c.difference > 0 ? "+" : ""}${moneyShort(c.difference, locale)}` : "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>{c.receiver || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20, alignItems: "start" }}>

          {/* ── المنتجات / المنيو ── */}
          <div>
            {/* بحث + فلتر الأقسام */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div className="search-wrapper" style={{ flex: 1 }}>
                <i className="fas fa-search search-icon"></i>
                <input
                  type="text"
                  placeholder={isRestaurant ? (isCafe ? "ابحث في منيو الكافيه..." : "ابحث في منيو المطعم...") : "🔍 ابحث بالاسم أو اسكان الباركود..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  autoFocus
                />
              </div>
              {isRestaurant && categories.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={() => setFilterCategory("all")}
                    style={{
                      padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 20,
                      border: `2px solid ${filterCategory === "all" ? "#f59e0b" : "#e2e8f0"}`,
                      background: filterCategory === "all" ? "#fffbeb" : "white",
                      color: filterCategory === "all" ? "#d97706" : "#64748b",
                      cursor: "pointer",
                    }}
                  >الكل</button>
                  {categories.map((cat) => (
                    <button key={cat.id}
                      onClick={() => setFilterCategory(filterCategory === cat.id ? "all" : cat.id)}
                      style={{
                        padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 20,
                        border: `2px solid ${filterCategory === cat.id ? "#f59e0b" : "#e2e8f0"}`,
                        background: filterCategory === cat.id ? "#fffbeb" : "white",
                        color: filterCategory === cat.id ? "#d97706" : "#64748b",
                        cursor: "pointer",
                      }}
                    >{cat.icon} {cat.name}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Grid الأصناف */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12 }}>
              {filteredProducts.length === 0 ? (
                <div className="empty-state" style={{ gridColumn: "1/-1" }}>
                  <div className="empty-icon"><i className="fas fa-box-open"></i></div>
                  <p>{searchTerm || filterCategory !== "all" ? t("common.noResults") : t("pos.noProducts")}</p>
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const details = getProductDetails(product);
                  // مطعم: الإتاحة من الوصفة والخامات (null = بلا وصفة → تنبيه فقط).
                  // غير المطعم: نفس السلوك القديم (رصيد الصنف).
                  const dishAvail = isRestaurantStock ? dishAvailability(product) : null;
                  const noRecipe = isRestaurantStock && dishAvail === null;
                  const soldOut = isRestaurantStock ? dishAvail === 0 : product.quantity < 1;
                  // المطعم: الاسم والسعر فقط (التفاصيل الداخلية لا تظهر على الكارت)
                  const prodSizes = (isRestaurantStock && Array.isArray(product.sizes) ? product.sizes.filter((s) => s && s.size) : []);
                  const fromPrice = prodSizes.length > 0
                    ? Math.min(...prodSizes.map((s) => parseFloat(s.price) || 0))
                    : product.price;
                  const inCartQty = cart.filter((c) => c.id === product.id).reduce((s, c) => s + (parseFloat(c.quantity) || 0), 0);
                  const inCart = inCartQty > 0 ? { quantity: inCartQty } : null;
                  return (
                    <button
                      key={product.id}
                      onClick={() => (prodSizes.length > 0 ? setSizePicker(product) : addToCart(product))}
                      disabled={soldOut}
                      style={{
                        background: "white",
                        border: `2px solid ${inCart ? "#f59e0b" : soldOut ? "#e2e8f0" : "#e2e8f0"}`,
                        borderRadius: 12, padding: "12px",
                        cursor: soldOut ? "not-allowed" : "pointer",
                        opacity: soldOut ? 0.5 : 1,
                        transition: "border-color 0.2s, transform 0.15s",
                        textAlign: "start",
                        fontFamily: "Cairo, sans-serif",
                        display: "flex", flexDirection: "column", gap: 4,
                        position: "relative",
                      }}
                      onMouseEnter={(e) => {
                        if (!soldOut) {
                          e.currentTarget.style.borderColor = "#10b981";
                          e.currentTarget.style.transform = "translateY(-2px)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = inCart ? "#f59e0b" : "#e2e8f0";
                        e.currentTarget.style.transform = "none";
                      }}
                    >
                      {inCart && (
                        <span style={{
                          position: "absolute", top: 6, left: 6,
                          background: "#f59e0b", color: "white",
                          borderRadius: "50%", width: 20, height: 20,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700,
                        }}>{inCart.quantity}</span>
                      )}
                      {isRestaurant && !isRestaurantStock && product.category && (
                        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>
                          {getCategoryLabel(product.category)}
                        </div>
                      )}
                      <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{product.name}</div>
                      {isRestaurantStock && prodSizes.length > 0 && (
                        <div style={{ fontSize: 10, color: "#1e3a8a", fontWeight: 700 }}>📏 {prodSizes.length} مقاسات</div>
                      )}
                      {!isRestaurantStock && product.barcode && (
                        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", direction: "ltr", textAlign: "right" }}>
                          {product.barcode}
                        </div>
                      )}
                      {!isRestaurantStock && details && <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 500 }}>{details}</div>}
                      {!isRestaurant && (
                        <div style={{ fontSize: 12, color: "#64748b" }}>{product.category || t("pos.noCat")}</div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontWeight: 800, color: "#10b981" }}>
                          {prodSizes.length > 0 ? `يبدأ من ${fromPrice}` : product.price} {t("currency")}
                        </span>
                        {!isRestaurantStock && (
                          <span className="badge" style={{ background: product.quantity < 5 ? "#fef2f2" : "#f0fdf4", color: product.quantity < 5 ? "#dc2626" : "#16a34a", fontSize: 10 }}>
                            {product.quantity} {t("pos.remaining")}
                          </span>
                        )}
                      </div>
                      {!isRestaurantStock && isRestaurant && (product.extras || []).length > 0 && (
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {product.extras.slice(0, 3).map((ex, i) => (
                            <span key={i} style={{ fontSize: 9, background: "#ede9fe", color: "#6d28d9", padding: "1px 6px", borderRadius: 10 }}>
                              {ex.name}{ex.price > 0 ? ` +${ex.price}` : ""}
                            </span>
                          ))}
                          {product.extras.length > 3 && <span style={{ fontSize: 9, color: "#94a3b8" }}>+{product.extras.length - 3}</span>}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* مودال اختيار المقاس بسعره (منتج واحد = مقاسات متعددة) */}
            {sizePicker && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setSizePicker(null)}>
                <div style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{sizePicker.name}</h3>
                    <button type="button" onClick={() => setSizePicker(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}>×</button>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>اختار المقاس — السعر والاستهلاك حسب المقاس</div>
                  {sizePickerSizes.map((sz, idx) => {
                    const mult = parseFloat(sz.mult) > 0 ? parseFloat(sz.mult) : 1;
                    const avail = dishAvailability(sizePicker, mult);
                    const out = avail === 0;
                    return (
                      <button key={idx} type="button" disabled={out}
                        onClick={() => { addToCart(sizePicker, { size: sz.size, price: sz.price, mult }); setSizePicker(null); }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "12px 14px", marginBottom: 8, borderRadius: 10, cursor: out ? "not-allowed" : "pointer", border: `2px solid ${out ? "#e2e8f0" : "#6366f1"}`, background: out ? "#f8fafc" : "white", opacity: out ? 0.5 : 1, fontFamily: "Cairo" }}>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>📏 {sz.size}</span>
                        <span style={{ fontSize: 12, color: out ? "#dc2626" : "#64748b", fontWeight: 700 }}>
                          {out ? "غير متاح" : (avail !== null ? `متاح ~${avail}` : "")}
                        </span>
                        <span style={{ fontWeight: 900, fontSize: 15, color: "#10b981" }}>{parseFloat(sz.price) || 0} {t("currency")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── السلة ── */}
          <div className="card" style={{ position: "sticky", top: 16 }}>
            <h3 style={{ marginBottom: 14 }}>
              <i className="fas fa-shopping-cart" style={{ color: "#10b981" }}></i>
              {isRestaurant ? " الطلب" : " " + t("pos.cart")}
              {cart.length > 0 && (
                <span className="badge" style={{ marginRight: 8, background: "#10b981", color: "white" }}>{cart.length}</span>
              )}
            </h3>

            {/* مصدر الأوردر للمطعم */}
            {isRestaurant && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>مصدر الأوردر</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ORDER_SOURCES.map((os) => (
                    <button key={os.value} type="button"
                      onClick={() => setOrderSource(os.value)}
                      style={{
                        padding: "6px 10px", fontSize: 12, fontWeight: 700,
                        border: `2px solid ${orderSource === os.value ? "#6366f1" : "#e2e8f0"}`,
                        borderRadius: 10,
                        background: orderSource === os.value ? "#eef2ff" : "white",
                        color: orderSource === os.value ? "#4338ca" : "#64748b",
                        cursor: "pointer",
                      }}
                    >{os.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* نوع الطلب للمطعم */}
            {isRestaurant && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>نوع الطلب</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {ORDER_TYPES.map((ot) => (
                    <button key={ot.value} type="button"
                      onClick={() => setOrderType(ot.value)}
                      style={{
                        flex: 1, padding: "8px", fontSize: 13, fontWeight: 700,
                        border: `2px solid ${orderType === ot.value ? "#f59e0b" : "#e2e8f0"}`,
                        borderRadius: 10,
                        background: orderType === ot.value ? "#fffbeb" : "white",
                        color: orderType === ot.value ? "#d97706" : "#64748b",
                        cursor: "pointer",
                      }}
                    >{ot.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* حقول الديليفري */}
            {isRestaurant && orderType === "delivery" && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="text" placeholder="📍 عنوان التوصيل *"
                  value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                />
                <input type="tel" placeholder="📞 رقم الهاتف"
                  value={deliveryPhone}
                  onChange={(e) => setDeliveryPhone(e.target.value)}
                  onBlur={(e) => lookupAddressByPhone(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                />
                {phoneHint && (
                  <div style={{ fontSize: 11, color: "#16a34a", background: "#f0fdf4", padding: "4px 8px", borderRadius: 6 }}>
                    {phoneHint}
                  </div>
                )}
                <button type="button" onClick={repeatLastOrder} disabled={repeating}
                  style={{ padding: "6px", fontSize: 12, fontWeight: 700, border: "1px dashed #6366f1", borderRadius: 8, background: "white", color: "#6366f1", cursor: "pointer" }}>
                  {repeating ? "جاري الجلب..." : "🔁 تكرار آخر أوردر لنفس الرقم"}
                </button>
                <input type="number" step="0.5" min="0" placeholder="🛵 رسوم التوصيل"
                  value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                />
              </div>
            )}

            {/* رقم الطاولة للصالة */}
            {isRestaurant && orderType === "dine_in" && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="number" min="1" placeholder={t("in.tableNumberPh")}
                  value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                />
              </div>
            )}

            {/* رقم التليفون للتيك أواي برضه (عشان نعرف المصدر والزبون المتكرر) */}
            {isRestaurant && orderType !== "delivery" && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="tel" placeholder="📞 رقم الهاتف (اختياري - للتكرار)"
                  value={deliveryPhone}
                  onChange={(e) => setDeliveryPhone(e.target.value)}
                  onBlur={(e) => lookupAddressByPhone(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                />
                {phoneHint && (
                  <div style={{ fontSize: 11, color: "#16a34a", background: "#f0fdf4", padding: "4px 8px", borderRadius: 6 }}>
                    {phoneHint}
                  </div>
                )}
              </div>
            )}

            {/* الزبون */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#64748b" }}>{isRestaurant ? "الزبون" : t("pos.client")}</label>
              <select value={selectedClient} onChange={(e) => { setSelectedClient(e.target.value); if (e.target.value) setNewClientName(""); }}>
                <option value="">{isRestaurant ? "زبون نقدي / بدون تسجيل" : t("pos.walkIn")}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}{client.phone ? ` — ${client.phone}` : ""}</option>
                ))}
              </select>
              {/* إضافة عميل جديد وهو واقف في الكاشير */}
              {isRestaurant && !selectedClient && (
                <div style={{ marginTop: 8, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>+ عميل جديد (هيتحفظ تلقائي مع الفاتورة)</div>
                  <input type="text" placeholder="👤 اسم العميل *"
                    value={newClientName} onChange={(e) => setNewClientName(e.target.value)}
                    style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}
                  />
                  <input type="tel" placeholder="📞 رقم الهاتف"
                    value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)}
                    onBlur={(e) => lookupAddressByPhone(e.target.value)}
                    style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}
                  />
                  <input type="text" placeholder="📍 العنوان"
                    value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                    style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}
                  />
                  <button type="button" onClick={handleQuickAddClient} disabled={addingClient || !newClientName.trim()}
                    style={{ padding: "6px", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 8, background: !newClientName.trim() ? "#e2e8f0" : "#6366f1", color: "white", cursor: "pointer" }}>
                    {addingClient ? "جاري الحفظ..." : "💾 حفظ العميل في العملاء"}
                  </button>
                </div>
              )}
              {isRestaurant && selectedClient && (
                <button type="button" onClick={() => setSelectedClient("")}
                  style={{ marginTop: 6, background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 11 }}>
                  ✕ إلغاء اختيار العميل
                </button>
              )}
            </div>

            {/* ملاحظة عامة */}
            {isRestaurant && (
              <div style={{ marginBottom: 12 }}>
                <input type="text" placeholder="📝 ملاحظة عامة على الطلب"
                  value={customerNote} onChange={(e) => setCustomerNote(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            )}

            {/* أصناف السلة */}
            <div style={{ maxHeight: 340, overflowY: "auto", marginBottom: 12 }}>
              {cart.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px 0" }}>
                  <div className="empty-icon"><i className="fas fa-cart-plus"></i></div>
                  <p>{isRestaurant ? "اضغط على صنف لإضافته للطلب" : t("pos.emptyCart")}</p>
                </div>
              ) : (
                cart.map((item) => {
                  const itemKey = item.key || item.id;
                  const selectedExtraIdxs = cartItemExtras[itemKey] || [];
                  return (
                    <div key={itemKey} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>
                            {item.name}
                            {item.size ? <span style={{ fontSize: 11, color: "#1e3a8a", fontWeight: 700 }}> ({item.size})</span> : null}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            {item.price} {t("currency")} × {item.quantity}
                            {isRestaurant && selectedExtraIdxs.length > 0 && (
                              <span style={{ color: "#6d28d9" }}>
                                {" "}+ {selectedExtraIdxs.reduce((s, idx) => s + (item.extras?.[idx]?.price || 0), 0) * item.quantity} {t("currency")} إضافات
                              </span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => updateCartQuantity(itemKey, item.quantity - 1)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>−</button>
                        <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center" }}>{item.quantity}</span>
                        <button onClick={() => updateCartQuantity(itemKey, item.quantity + 1)} className="btn-success btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}
                          disabled={item.quantity >= (item.stockQty || item.quantity)}>+</button>
                        <button onClick={() => removeFromCart(itemKey)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>

                      {/* إضافات الصنف — مطعم وكافيه */}
                      {isRestaurant && (item.extras || []).length > 0 && (
                        <div style={{ marginTop: 6, paddingRight: 4 }}>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>الإضافات:</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {item.extras.map((ex, idx) => {
                              const isSelected = selectedExtraIdxs.includes(idx);
                              return (
                                <button key={idx} type="button"
                                  onClick={() => {
                                    const k = item.key || item.id;
                                    const current = cartItemExtras[k] || [];
                                    const updated = isSelected ? current.filter((i) => i !== idx) : [...current, idx];
                                    setCartItemExtras({ ...cartItemExtras, [k]: updated });
                                  }}
                                  style={{
                                    padding: "2px 8px", fontSize: 11, borderRadius: 12, cursor: "pointer",
                                    border: `1px solid ${isSelected ? "#6d28d9" : "#e2e8f0"}`,
                                    background: isSelected ? "#ede9fe" : "white",
                                    color: isSelected ? "#6d28d9" : "#64748b",
                                    fontWeight: isSelected ? 700 : 400,
                                  }}
                                >
                                  {ex.name}{ex.price > 0 ? ` +${ex.price}` : ""}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ملاحظة على الصنف */}
                      {isRestaurant && (
                        <input type="text" placeholder="ملاحظة على هذا الصنف (اختياري)"
                          value={cartItemNotes[item.key || item.id] || ""}
                          onChange={(e) => setCartItemNotes({ ...cartItemNotes, [item.key || item.id]: e.target.value })}
                          style={{ marginTop: 6, width: "100%", padding: "5px 8px", border: "1px dashed #e2e8f0", borderRadius: 6, fontSize: 11, boxSizing: "border-box", background: "#fafafa" }}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* طريقة الدفع */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>{t("pay.title")}</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}>
                {EGYPT_PAYMENTS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* دفع مقسم: جزء كاش + جزء تاني — مطعم فقط (زي نقطة بيع الملابس) */}
            {isRestaurant && (
              <div style={{ marginBottom: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  <input type="checkbox" checked={splitPayment} onChange={(e) => setSplitPayment(e.target.checked)} />
                  ⚡ دفع مقسم (مثال: جزء كاش + جزء فيزا)
                </label>
                {splitPayment && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    <select value={splitMethod1} onChange={(e) => setSplitMethod1(e.target.value)}
                      style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}>
                      {EGYPT_PAYMENTS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <input type="number" min="0" step="0.5" placeholder="المبلغ الأول"
                      value={splitAmount1} onChange={(e) => setSplitAmount1(e.target.value)}
                      style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }} />
                    <select value={splitMethod2} onChange={(e) => setSplitMethod2(e.target.value)}
                      style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}>
                      {EGYPT_PAYMENTS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <input type="number" min="0" step="0.5" placeholder="المبلغ الثاني"
                      value={splitAmount2} onChange={(e) => setSplitAmount2(e.target.value)}
                      style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }} />
                    <div style={{ gridColumn: "1/-1", fontSize: 12, fontWeight: 700, color: Math.abs(splitTotal - total) < 0.01 ? "#059669" : "#dc2626" }}>
                      المجموع: {splitTotal.toFixed(2)} / الإجمالي: {total.toFixed(2)}
                      {splitMethod1 === splitMethod2 ? " — ⚠️ الطريقتان متطابقتان" : ""}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* الإجمالي */}
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>{t("pos.subtotal")}</span>
                <span style={{ fontWeight: 700 }}>{subtotal.toFixed(2)} {t("currency")}</span>
              </div>
              {isRestaurant && orderType === "delivery" && deliveryFeeNum > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>🛵 رسوم التوصيل</span>
                  <span style={{ fontWeight: 700, color: "#f59e0b" }}>{deliveryFeeNum.toFixed(2)} {t("currency")}</span>
                </div>
              )}
              {isRestaurant && (
                <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => setDiscountType("amount")}
                      style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: `1px solid ${discountType === "amount" ? "#6366f1" : "#e2e8f0"}`, background: discountType === "amount" ? "#eef2ff" : "white", color: discountType === "amount" ? "#4338ca" : "#64748b", cursor: "pointer" }}>
                      ج.م
                    </button>
                    <button type="button" onClick={() => setDiscountType("percent")}
                      style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: `1px solid ${discountType === "percent" ? "#6366f1" : "#e2e8f0"}`, background: discountType === "percent" ? "#eef2ff" : "white", color: discountType === "percent" ? "#4338ca" : "#64748b", cursor: "pointer" }}>
                      %
                    </button>
                  </div>
                  <input type="number" min="0" step="0.5" placeholder="خصم"
                    value={discount} onChange={(e) => setDiscount(e.target.value)}
                    style={{ flex: 1, padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }} />
                  {discountNum > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#059669", whiteSpace: "nowrap" }}>−{discountNum.toFixed(2)}</span>
                  )}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px dashed #e2e8f0", paddingTop: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: "#1e293b" }}>{t("pos.total")}</span>
                <span style={{ fontWeight: 900, fontSize: 20, color: "#10b981" }}>{total.toFixed(2)} {t("currency")}</span>
              </div>
            </div>

            <button
              onClick={checkout}
              className="btn-primary btn-block"
              disabled={cart.length === 0 || submitting}
              style={{
                background: cart.length === 0 ? "#cbd5e1" : "linear-gradient(135deg,#10b981,#059669)",
                fontSize: 16, padding: "14px",
              }}
            >
              {submitting ? (
                <><i className="fas fa-spinner fa-spin"></i> {t("pos.completing")}</>
              ) : (
                <>
                  <i className={isRestaurant ? "fas fa-print" : "fas fa-check-circle"}></i>
                  {isRestaurant
                    ? ` تأكيد الطلب وطباعة — ${total.toFixed(2)} ${t("currency")}`
                    : ` ${t("pos.complete", { amount: total.toFixed(2) })}`}
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── مودال تقفيل الوردية وتسليم الشيفت ── */}
        {showCloseModal && shift && closePreview && (
          <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-cash-register" style={{ color: "#16a34a" }}></i> تقفيل وردية #{shift.number}</h3>
                <button className="modal-close" onClick={() => setShowCloseModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>فواتير الوردية</div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{closePreview.count}</div>
                  </div>
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>إجمالي</div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{moneyShort(closePreview.total, locale)}</div>
                  </div>
                  <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>المحصل</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#16a34a" }}>{moneyShort(closePreview.paid, locale)}</div>
                  </div>
                  <div style={{ background: "#fffbeb", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>مرتجعات ({closePreview.returnsCount || 0})</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#b45309" }}>{moneyShort(closePreview.returnsTotal || 0, locale)}</div>
                  </div>
                </div>
                {Object.keys(closePreview.byMethod).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>{t("close.byMethod")}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.entries(closePreview.byMethod).map(([m, amt]) => (
                        <span key={m} style={{ background: "#eef2ff", color: "#4338ca", padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                          {getPaymentLabel(m)}: {moneyShort(amt, locale)}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                      مبيعات الكاش: {moneyShort(closePreview.cashSales ?? 0, locale)} {t("currency")}
                      {(closePreview.returnsTotal || 0) > 0 && (
                        <span style={{ color: "#b45309" }}> — مرتجعات تُخصم: {moneyShort(closePreview.returnsTotal || 0, locale)}</span>
                      )}
                    </div>
                  </div>
                )}
                <form onSubmit={submitClosing}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>داخل تلقائي ({closePreview.expInCount || 0})</div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#16a34a" }}>{moneyShort(closePreview.cashIn || 0, locale)}</div>
                    </div>
                    <div style={{ background: "#fef2f2", borderRadius: 8, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>خارج تلقائي ({closePreview.expOutCount || 0})</div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#dc2626" }}>{moneyShort(closePreview.cashOut || 0, locale)}</div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>الكاش المعدود في الدرج * ({t("currency")})</label>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={closeForm.countedCash} onChange={(e) => setCloseForm({ ...closeForm, countedCash: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>المستلم (الشيفت اللي بعدك)</label>
                    <input type="text" placeholder="اسم المستلم"
                      value={closeForm.receiver} onChange={(e) => setCloseForm({ ...closeForm, receiver: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>ملاحظات التسليم</label>
                    <input type="text" placeholder="ملاحظه"
                      value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} />
                  </div>
                  {closeForm.countedCash !== "" && (
                    <div style={{ fontSize: 14, fontWeight: 800, padding: 10, borderRadius: 8, textAlign: "center",
                      background: Math.abs((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)) < 0.005 ? "#f0fdf4" : "#fef2f2",
                      color: Math.abs((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)) < 0.005 ? "#16a34a" : "#dc2626" }}>
                      {t("close.expected")}: {moneyShort(closingExpected(closePreview, shift.openingCash), locale)} — {t("close.diff")}: {(((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)) > 0 ? "+" : "") + moneyShort(round2((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)), locale)}
                    </div>
                  )}
                  <div className="modal-footer" style={{ marginTop: 12 }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowCloseModal(false)}>{t("common.cancel")}</button>
                    <button type="submit" className="btn-primary" disabled={closing}>{closing ? "..." : "تأكيد التقفيل والتسليم"}</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
