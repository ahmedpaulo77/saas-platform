// src/pages/POS.js - نقطة البيع مع دعم المطعم: تيك أواي/ديليفري + إضافات + طباعة حرارية
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc, query, where, orderBy, limit, runTransaction } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import { EGYPT_PAYMENTS, getPaymentLabel } from "../utils/paymentMethods";

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
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const isCafe = userIndustry === "cafe";
  const isRestaurantOnly = userIndustry === "restaurant";
  const isRestaurant = (isRestaurantOnly || isCafe);
  const isFood = isRestaurant;
  const isPharmacy = userIndustry === "pharmacy";
  const foodLabel = isCafe ? "الكافيه" : "المطعم";
  const foodIcon = isCafe ? "☕" : "🍽️";

  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
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

  const fetchCategories = useCallback(async () => {
    if (!isRestaurant) return;
    try {
      const snap = await getDocs(getScopedQuery("menu_categories", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setCategories(data);
    } catch (e) { console.error(e); }
  }, [isRestaurant, userRole, userCompanyId, currentUser?.uid]);

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
          total += parseFloat(inv.amount) || 0;
          const p = parseFloat(inv.paidAmount) || 0;
          paid += p;
          // ⚠️ ما ن fallbackش على `source` — ده *مصدر الطلب* (whatsapp/direct)
          // مش طريقة دفع. كان بيخلي أي طلب واتساب نقدي يتحسب كاش في الدرج.
          const m = inv.paymentMethod || "cash";
          byMethod[m] = (byMethod[m] || 0) + p;
          if (m === "cash") cashSales += p;
          windowInvoices.set(d.id, { ts, paymentMethod: m });
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
    Promise.all([fetchProducts(), fetchClients(), fetchCategories(), fetchShift()]);
  }, [fetchProducts, fetchClients, fetchCategories, fetchShift]);

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
      const restored = [];
      for (const it of items) {
        const prod = products.find((p) => p.id === it.productId);
        if (!prod) continue;
        const qty = Math.min(it.quantity || 1, prod.quantity || 0);
        if (qty <= 0) continue;
        restored.push({ ...prod, quantity: qty, stockQty: prod.quantity });
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
      const typeMap = { men: "رجالي", women: "حريمي", kids: "أطفال", unisex: "يونيسكس" };
      details.push(typeMap[product.type] || product.type);
    }
    if (product.size) details.push(product.size);
    if (product.color) details.push(product.color);
    return details.join(" - ");
  };

  // ── إدارة السلة ──
  function addToCart(product) {
    // صيدلية: منع بيع صنف منتهي الصلاحية (تاريخ الصنف نفسه)
    if (isPharmacy && product.expiryDate) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (new Date(product.expiryDate) < today) { alert("هذا الدواء منتهي الصلاحية — البيع موقوف"); return; }
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.quantity) { alert(t("pos.qtyOver")); return prev; }
        return prev.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      } else {
        if (product.quantity < 1) { alert(t("pos.notAvail")); return prev; }
        return [...prev, { ...product, quantity: 1, stockQty: product.quantity }];
      }
    });
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((item) => item.id !== productId));
    setCartItemNotes((prev) => { const n = { ...prev }; delete n[productId]; return n; });
    setCartItemExtras((prev) => { const n = { ...prev }; delete n[productId]; return n; });
  }

  function updateCartQuantity(productId, newQty) {
    if (newQty < 0) return;
    if (newQty === 0) { removeFromCart(productId); return; }
    setCart((prev) => prev.map((item) => {
      if (item.id !== productId) return item;
      if (newQty > (item.stockQty || item.quantity)) { alert(t("pos.qtyOver")); return item; }
      return { ...item, quantity: newQty };
    }));
  }

  // حساب سعر صنف مع الإضافات — للمطعم فقط (مخفي للكافيه)
  function getItemTotalPrice(item) {
    const basePrice = (item.price || 0) * item.quantity;
    if (!isRestaurantOnly) return basePrice;
    const extras = item.extras || [];
    const selectedExtraIdxs = cartItemExtras[item.id] || [];
    const extrasTotal = selectedExtraIdxs.reduce((sum, idx) => {
      const ex = extras[idx];
      return ex ? sum + (parseFloat(ex.price) || 0) * item.quantity : sum;
    }, 0);
    return basePrice + extrasTotal;
  }

  const subtotal = round2(cart.reduce((sum, item) => sum + getItemTotalPrice(item), 0));
  const deliveryFeeNum = parseFloat(deliveryFee) || 0;
  // ⚠️ رسوم التوصيل لازم تفضل بره amount. كل القارئات (InvoiceTable.jsx،
  //    utils/invoiceHelpers.js، Invoices.js) بتعمل totalWithFee = amount + deliveryFee.
  //    لو حطيناها جوّه amount كمان، الفاتورة كانت بتعرض 240 بدل 120.
  const total = round2(subtotal + (orderType === "delivery" ? deliveryFeeNum : 0));

  // ── طباعة حرارية ──
  function handleThermalPrint(invoiceData) {
    const clientName = invoiceData?.clientName || clients.find((c) => c.id === selectedClient)?.name || newClientName.trim() || "زبون";
    const orderTypeLabel = ORDER_TYPES.find((o) => o.value === orderType)?.label || "";
    const orderSourceLabel = ORDER_SOURCES.find((o) => o.value === orderSource)?.label || "";

    const itemsRows = cart.map((item) => {
      const selectedExtraIdxs = cartItemExtras[item.id] || [];
      const extras = isRestaurantOnly ? (item.extras || []).filter((_, i) => selectedExtraIdxs.includes(i)) : [];
      const extrasText = extras.length > 0 ? `<div style="font-size:10px;color:#666;padding-right:8px;">+ ${extras.map((e) => e.name).join(", ")}</div>` : "";
      const noteText = cartItemNotes[item.id] ? `<div style="font-size:10px;color:#888;font-style:italic;padding-right:8px;">📝 ${cartItemNotes[item.id]}</div>` : "";
      return `<tr>
        <td style="padding:3px 6px;border-bottom:1px dashed #ccc;vertical-align:top;">
          ${item.name}${extrasText}${noteText}
        </td>
        <td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;vertical-align:top;">${item.quantity}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;vertical-align:top;">${item.price}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;vertical-align:top;font-weight:bold;">${getItemTotalPrice(item).toFixed(2)}</td>
      </tr>`;
    }).join("");

    const deliveryInfo = orderType === "delivery" ? `
      <div style="margin:6px 0;font-size:12px;">
        <strong>📍 العنوان:</strong> ${deliveryAddress || "—"}<br/>
        ${deliveryPhone ? `<strong>📞 هاتف:</strong> ${deliveryPhone}` : ""}
        ${deliveryFeeNum > 0 ? `<br/><strong>🛵 رسوم التوصيل:</strong> ${deliveryFeeNum} ج.م` : ""}
      </div>` : orderType === "dine_in" && tableNumber ? `
      <div style="margin:6px 0;font-size:12px;">
        <strong>🪑 رقم الطاولة:</strong> ${tableNumber}
      </div>` : "";

    const printContent = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 13px; width: 80mm; padding: 8px; }
  h2 { text-align: center; font-size: 16px; margin-bottom: 4px; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f0f0f0; padding: 4px 6px; font-size: 11px; }
  @media print {
    body { width: 80mm; }
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>
<h2>${foodIcon} فاتورة ${foodLabel}</h2>
<div class="center" style="font-size:11px;color:#666;">${new Date().toLocaleString("ar-EG")}</div>
<div class="divider"></div>
<div style="font-size:12px;margin-bottom:4px;">
  <strong>الزبون:</strong> ${clientName}<br/>
  <strong>نوع الطلب:</strong> ${orderTypeLabel}<br/>
  <strong>المصدر:</strong> ${orderSourceLabel}
</div>
${deliveryInfo}
${customerNote ? `<div style="font-size:11px;color:#555;margin:4px 0;"><strong>ملاحظة:</strong> ${customerNote}</div>` : ""}
<div class="divider"></div>
<table>
  <thead><tr>
    <th style="text-align:right;">الصنف</th>
    <th>الكمية</th>
    <th>السعر</th>
    <th>الإجمالي</th>
  </tr></thead>
  <tbody>${itemsRows}</tbody>
</table>
<div class="divider"></div>
<div style="text-align:left;font-size:13px;">
  <div>المجموع: ${subtotal.toFixed(2)} ج.م</div>
  ${orderType === "delivery" && deliveryFeeNum > 0 ? `<div>رسوم التوصيل: ${deliveryFeeNum} ج.م</div>` : ""}
  <div style="margin-top:4px;font-size:15px;font-weight:bold;border-top:2px solid #000;padding-top:4px;">
    الإجمالي: ${total.toFixed(2)} ج.م
  </div>
</div>
<div class="divider"></div>
<div class="center" style="font-size:11px;margin-top:6px;">شكراً لزيارتكم 🙏</div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) { alert("السماح بالـ popups مطلوب للطباعة"); return; }
    win.document.write(printContent);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  // ── Checkout ──
  async function checkout(e) {
    e.preventDefault();
    if (cart.length === 0) { alert(t("pos.addFirst")); return; }
    if (isRestaurant && orderType === "delivery" && !deliveryAddress.trim()) {
      alert("يرجى إدخال عنوان التوصيل"); return;
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
      const stockRefs = cart.map((item) => doc(db, "inventory", item.id));
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
          const usable = valid.filter(
            (b) => !b.expiryDate || new Date(b.expiryDate) >= todayStart
          );
          const expired = valid.filter(
            (b) => b.expiryDate && new Date(b.expiryDate) < todayStart
          );
          if (valid.length > 0 && usable.length === 0) {
            throw new Error(`الدواء "${item.name}" كل تشغيلاته منتهية الصلاحية — البيع موقوف`);
          }
          let remaining = item.quantity;
          const plan = [];
          usable.forEach((b) => {
            if (remaining <= 0) return;
            const take = Math.min(remaining, parseFloat(b.quantity) || 0);
            if (take > 0) plan.push({ batchId: b.id, take });
            remaining = round2(remaining - take);
          });
          // ⚠️ ما نكملش لو التشغيلات الصالحة مش مكفية — الكود القديم كان
          // بيواصل وبيسيب الـ batches غلط عن الـ inventory.
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
          const selectedExtraIdxs = cartItemExtras[item.id] || [];
          const selectedExtras = (item.extras || []).filter((_, i) => selectedExtraIdxs.includes(i));
          return {
            productId: item.id,
            productName: item.name,
            // amount مخزّن كمان عشان Sales.jsx والتقارير يقراوا السعر وقت
            // البيع مش السعر الحالي للمنتج (اللي بيتغيّر بعد كده).
            amount: round2(getItemTotalPrice(item)),
            quantity: item.quantity,
            price: item.price || 0,
            extras: isRestaurantOnly ? selectedExtras : [],
            note: cartItemNotes[item.id] || "",
            itemTotal: round2(getItemTotalPrice(item)),
            // حقول الملابس
            productType: item.type || "",
            productSize: item.size || "",
            productColor: item.color || "",
          };
        }),
        subtotal,
        discount: 0,
        deliveryFee: isRestaurant && orderType === "delivery" ? deliveryFeeNum : 0,
        total,
        // amount = قيمة البضاعة بس (بدون توصيل) — ده الـ contract اللي كل
        // القارئات بتفترضه. الـ total هو اللي اتحصّل فعلاً.
        amount: subtotal,
        status: "paid",
        paidAmount: total,
        paymentMethod: paymentMethod || "cash",
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

      await runTransaction(db, async (tx) => {
        // كل القراءات الأول — Firestore بيرفض أي كتابة قبل آخر قراءة
        const freshSnaps = await Promise.all(stockRefs.map((r) => tx.get(r)));
        const freshBatches = batchWriteRefs.length
          ? await Promise.all(batchWriteRefs.map((r) => tx.get(r)))
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

        freshBatches.forEach((snap, i) => {
          const ref = batchWriteRefs[i];
          const currentQty = parseFloat(snap.data()?.quantity) || 0;
          const take = fefoTakes.get(ref.path) || 0;
          tx.update(ref, { quantity: round2(currentQty - take) });
        });

        tx.set(invoiceRef, invDoc);
      });

      // طباعة تلقائية للمطعم
      if (isRestaurant) handleThermalPrint(invDoc);

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
      setTableNumber("");
      setCustomerNote("");
      setPhoneHint("");
      setCartItemNotes({});
      setCartItemExtras({});
      await Promise.all([fetchProducts(), fetchClients()]);
      if (!isRestaurant) alert(t("pos.ok"));
    } catch (e) {
      console.error(e);
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
              🟢 وردية #{shift.number} مفتوحة منذ {shift.openedAt ? new Date(shift.openedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "—"}
            </span>
            <span style={{ fontSize: 12, color: "#64748b" }}>كاش البداية: {(shift.openingCash || 0).toLocaleString()}</span>
            <button type="button" onClick={previewClosing} className="btn-primary btn-sm" style={{ marginRight: "auto" }}>تقفيل الوردية</button>
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
                    <td style={{ fontSize: 12 }}>{c.openedAt ? new Date(c.openedAt).toLocaleString("ar-EG") : "—"}</td>
                    <td style={{ fontSize: 12 }}>{c.closedAt ? new Date(c.closedAt).toLocaleString("ar-EG") : <span style={{ color: "#16a34a", fontWeight: 700 }}>مفتوحة</span>}</td>
                    <td>{c.salesCount ?? "—"}</td>
                    <td style={{ fontWeight: 700 }}>{c.paidTotal != null ? Number(c.paidTotal).toLocaleString() : "—"}</td>
                    <td>{c.returnsCount ?? "—"}</td>
                    <td style={{ color: "#b45309", fontWeight: 700 }}>{c.returnsTotal != null ? Number(c.returnsTotal).toLocaleString() : "—"}</td>
                    <td style={{ color: "#16a34a", fontWeight: 700 }}>{c.cashIn != null ? Number(c.cashIn).toLocaleString() : "—"}</td>
                    <td style={{ color: "#dc2626", fontWeight: 700 }}>{c.cashOut != null ? Number(c.cashOut).toLocaleString() : "—"}</td>
                    <td>{c.countedCash != null ? Number(c.countedCash).toLocaleString() : "—"}</td>
                    <td style={{ fontWeight: 800, color: (c.difference || 0) === 0 ? "#16a34a" : (c.difference || 0) > 0 ? "#2563eb" : "#dc2626" }}>
                      {c.difference != null ? `${c.difference > 0 ? "+" : ""}${Number(c.difference).toLocaleString()}` : "—"}
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
                  const inCart = cart.find((c) => c.id === product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={product.quantity < 1}
                      style={{
                        background: "white",
                        border: `2px solid ${inCart ? "#f59e0b" : product.quantity < 1 ? "#e2e8f0" : "#e2e8f0"}`,
                        borderRadius: 12, padding: "12px",
                        cursor: product.quantity < 1 ? "not-allowed" : "pointer",
                        opacity: product.quantity < 1 ? 0.5 : 1,
                        transition: "border-color 0.2s, transform 0.15s",
                        textAlign: "right",
                        fontFamily: "Cairo, sans-serif",
                        display: "flex", flexDirection: "column", gap: 4,
                        position: "relative",
                      }}
                      onMouseEnter={(e) => {
                        if (product.quantity >= 1) {
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
                      {isRestaurant && product.category && (
                        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>
                          {getCategoryLabel(product.category)}
                        </div>
                      )}
                      <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{product.name}</div>
                      {!isRestaurant && product.barcode && (
                        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", direction: "ltr", textAlign: "right" }}>
                          {product.barcode}
                        </div>
                      )}
                      {details && <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 500 }}>{details}</div>}
                      {!isRestaurant && (
                        <div style={{ fontSize: 12, color: "#64748b" }}>{product.category || t("pos.noCat")}</div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontWeight: 800, color: "#10b981" }}>{product.price} {t("currency")}</span>
                        <span className="badge" style={{ background: product.quantity < 5 ? "#fef2f2" : "#f0fdf4", color: product.quantity < 5 ? "#dc2626" : "#16a34a", fontSize: 10 }}>
                          {product.quantity} {t("pos.remaining")}
                        </span>
                      </div>
                      {/* إضافات المنيو — للمطعم فقط */}
                      {isRestaurantOnly && (product.extras || []).length > 0 && (
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
                <input type="number" min="1" placeholder={t("in.tableNumberPh") || "رقم الطاولة"}
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
                  const selectedExtraIdxs = cartItemExtras[item.id] || [];
                  return (
                    <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            {item.price} {t("currency")} × {item.quantity}
                            {isRestaurantOnly && selectedExtraIdxs.length > 0 && (
                              <span style={{ color: "#6d28d9" }}>
                                {" "}+ {selectedExtraIdxs.reduce((s, idx) => s + (item.extras?.[idx]?.price || 0), 0) * item.quantity} {t("currency")} إضافات
                              </span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>−</button>
                        <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center" }}>{item.quantity}</span>
                        <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} className="btn-success btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}
                          disabled={item.quantity >= (item.stockQty || item.quantity)}>+</button>
                        <button onClick={() => removeFromCart(item.id)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>

                      {/* إضافات الصنف — للمطعم فقط */}
                      {isRestaurantOnly && (item.extras || []).length > 0 && (
                        <div style={{ marginTop: 6, paddingRight: 4 }}>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>الإضافات:</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {item.extras.map((ex, idx) => {
                              const isSelected = selectedExtraIdxs.includes(idx);
                              return (
                                <button key={idx} type="button"
                                  onClick={() => {
                                    const current = cartItemExtras[item.id] || [];
                                    const updated = isSelected ? current.filter((i) => i !== idx) : [...current, idx];
                                    setCartItemExtras({ ...cartItemExtras, [item.id]: updated });
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
                          value={cartItemNotes[item.id] || ""}
                          onChange={(e) => setCartItemNotes({ ...cartItemNotes, [item.id]: e.target.value })}
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
              <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>{t("pay.title") || "طريقة الدفع"}</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}>
                {EGYPT_PAYMENTS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

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
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{closePreview.total.toLocaleString()}</div>
                  </div>
                  <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>المحصل</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#16a34a" }}>{closePreview.paid.toLocaleString()}</div>
                  </div>
                  <div style={{ background: "#fffbeb", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>مرتجعات ({closePreview.returnsCount || 0})</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#b45309" }}>{(closePreview.returnsTotal || 0).toLocaleString()}</div>
                  </div>
                </div>
                {Object.keys(closePreview.byMethod).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>{t("close.byMethod") || "التحصيل حسب طريقة الدفع"}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.entries(closePreview.byMethod).map(([m, amt]) => (
                        <span key={m} style={{ background: "#eef2ff", color: "#4338ca", padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                          {getPaymentLabel(m)}: {amt.toLocaleString()}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                      مبيعات الكاش: {(closePreview.cashSales ?? 0).toLocaleString()} {t("currency")}
                      {(closePreview.returnsTotal || 0) > 0 && (
                        <span style={{ color: "#b45309" }}> — مرتجعات تُخصم: {(closePreview.returnsTotal || 0).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                )}
                <form onSubmit={submitClosing}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>داخل تلقائي ({closePreview.expInCount || 0})</div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#16a34a" }}>{(closePreview.cashIn || 0).toLocaleString()}</div>
                    </div>
                    <div style={{ background: "#fef2f2", borderRadius: 8, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>خارج تلقائي ({closePreview.expOutCount || 0})</div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#dc2626" }}>{(closePreview.cashOut || 0).toLocaleString()}</div>
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
                      {t("close.expected") || "المتوقع"}: {closingExpected(closePreview, shift.openingCash).toLocaleString()} — {t("close.diff") || "الفرق"}: {(((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)) > 0 ? "+" : "") + round2((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)).toLocaleString()}
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
