// src/pages/Purchases.js - فواتير الشراء من الموردين (بتزوّد المخزون)
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { getAvailableModules } from "../utils/modules.js";
import { logActivity } from "../utils/auditLogger.js";
import { createReturn } from "../utils/returns.js";
import AutocompleteInput from "../components/common/AutocompleteInput.js";
import Pagination from "../components/common/PaginationV2.js";
import { useFirestorePagination } from "../hooks/useFirestorePagination.js";
import JsBarcode from "jsbarcode";
import PurchasesFilterBar from "./PurchasesFilterBar.jsx";
import PurchasesStatsCards from "./PurchasesStatsCards.jsx";
import PurchasePayModal from "./PurchasePayModal.jsx";
import PurchaseReturnModal from "./PurchaseReturnModal.jsx";
import PurchaseEditModal from "./PurchaseEditModal.jsx";
import PurchasesQuickSupplier from "./PurchasesQuickSupplier.jsx";
import PurchasesQuickProduct from "./PurchasesQuickProduct.jsx";
import { getProductUnit, lineAmount, stockDelta, isKgUnit, roundQty, round2 } from "../utils/traderUnits.js";
import { stockTargetFor, stockCostKeyFor, stockLineId, readStockTx, readStockCache, planStockIn, planStockOut } from "../utils/stock.js";
import { isOffline, handleOfflineError } from "../utils/offline.js";
import { moneyShort, fmtDate } from "../utils/fmt.js";
import { printPurchaseThermal } from "../utils/printPurchaseThermal.js";
const PAGE_SIZE = 25;

export default function Purchases() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const availableModules = getAvailableModules(userIndustry, userRole);
  const hasInventory = availableModules.has("inventory");
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const isTrader = userIndustry === "trader";
  const isClothing = userIndustry === "clothing";
  // المطعم: هدف المخزون هو الخامات (raw_materials) — لا "inventory"
  const isRestaurant = userIndustry === "restaurant";
  const stockTarget = stockTargetFor(userIndustry);
  const stockCostKey = stockCostKeyFor(stockTarget);

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  const [newPurchase, setNewPurchase] = useState({
    supplierId: "",
    items: [], // [{ productId, quantity, weight, unit, unitCost, amount }]
    amount: "",
    status: "pending",
    description: "",
    dueDate: "",
  });

  // إضافة مورد/منتج سريع من نفس الصفحة
  const [showQuickSupplier, setShowQuickSupplier] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState("");
  const [quickSupplierPhone, setQuickSupplierPhone] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [showQuickProduct, setShowQuickProduct] = useState(false);
  const [quickProductName, setQuickProductName] = useState("");
  const [quickProductPrice, setQuickProductPrice] = useState("");
  const [quickProductSize, setQuickProductSize] = useState("");
  const [quickProductColor, setQuickProductColor] = useState("");
  const [quickProductCode, setQuickProductCode] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [variantCodes, setVariantCodes] = useState([]);

  const [editingPurchase, setEditingPurchase] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // الدفعات الجزئية (اللي بندفعها للمورد)
  const [payingPurchase, setPayingPurchase] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);

  // مرتجع شراء
  const [returningPurchase, setReturningPurchase] = useState(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnQtys, setReturnQtys] = useState({});
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);

  async function submitPurchaseReturn(e) {
    e.preventDefault();
    if (!returningPurchase) return;
    // Prevent double returns: sum prior returned qty per productId for this purchase
    let priorMap = {};
    try {
      const rq = query(collection(db, "returns"), where("refId", "==", returningPurchase.id), where("companyId", "==", userCompanyId));
      const priorSnap = await getDocs(rq);
      priorSnap.docs.forEach((d) => {
        const rd = d.data();
        (rd.items || rd.lines || []).forEach((l) => {
          if (!l.productId) return;
          priorMap[l.productId] = (priorMap[l.productId] || 0) + (parseFloat(l.quantity) || 0);
        });
      });
    } catch (err) { console.warn("prior returns fetch:", err?.message); }
    const items = getPurchaseItems(returningPurchase);
    const lines = items.map((it, idx) => {
      const rq = parseFloat(returnQtys[idx]) || 0;
      const oq = parseFloat(it.quantity) || 0;
      const already = priorMap[it.productId] || 0;
      const remaining = Math.max(0, oq - already);
      const allowed = Math.min(rq, remaining);
      const ratio = oq > 0 ? allowed / oq : 0;
      return {
        productId: it.productId,
        quantity: allowed,
        weight: it.weight || "",
        unit: it.unit || "",
        amount: (parseFloat(it.amount) || 0) * ratio,
      };
    }).filter((l) => l.quantity > 0);
    if (lines.length === 0) { alert("حدد كمية مرتجع أكبر من صفر"); return; }
    setReturning(true);
    try {
      const suppName = suppliers.find((s) => s.id === returningPurchase.supplierId)?.name || "";
      await createReturn({
        kind: "purchase",
        refId: returningPurchase.id,
        entityId: returningPurchase.supplierId,
        entityName: suppName,
        lines,
        reason: returnReason,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
        isTrader,
        // المرتجع يعكس من نفس هدف المخزون الذي زادته الفاتورة
        target: returningPurchase.stockTarget || stockTarget,
      });
      setShowReturnModal(false);
      setReturningPurchase(null);
      setReturnQtys({});
      setReturnReason("");
      await Promise.all([resetPagination(), fetchProducts()]);
      alert("تم تسجيل مرتجع الشراء وخصمه من المخزون");
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setReturning(false);
  }

  // ✅ وصف المقاس/اللون للمنتج — ملابس بس.
  // الصنايع التانية ما بتخزّنش size/color أصلاً، فالفحص ده بيمنع
  // " / " فاضية تطلع في سطر الصنف لو منتج قديم لسه فاضي.
  const variantLabel = (prod) => {
    if (!prod || !isClothing) return "";
    return [prod.size, prod.color].filter(Boolean).join(" / ");
  };

  // ✅ حساب مبلغ الصنف: سعر الوحدة × الوزن (للكيلو) أو × العدد
  const calculateItemAmount = (unit, unitCost, quantity, weight) =>
    lineAmount(unit || "piece", unitCost, quantity, weight);

  // ✅ إجمالي الفاتورة = مجموع مبالغ الأصناف (مقفول مثل فواتير البيع)
  const itemsTotal = useMemo(
    () =>
      (newPurchase.items || []).reduce(
        (s, it) => s + (parseFloat(it.amount) || 0),
        0,
      ),
    [newPurchase.items],
  );
  const hasItems = (newPurchase.items || []).length > 0;
  // ✅ إجمالي العدد = مجموع الكميات (قطع)
  const formTotalQty = useMemo(
    () =>
      (newPurchase.items || []).reduce(
        (s, it) => s + (parseFloat(it.quantity) || 0),
        0,
      ),
    [newPurchase.items],
  );

  // ✅ أصناف الفاتورة: الجديدة (items) أو القديمة (productId مفرد) للتوافق
  const getPurchaseItems = (p) => {
    if (p.items && p.items.length > 0) return p.items;
    if (p.productId)
      return [
        {
          productId: p.productId,
          quantity: p.quantity || 0,
          weight: p.weight || "",
          unit: p.unit || "",
          unitCost: p.unitCost || 0,
          amount: p.amount || 0,
        },
      ];
    return [];
  };

  const filters = useMemo(() => {
    const f = [];
    if (filterStatus !== "all") {
      f.push(["status", "==", filterStatus]);
    }
    return f;
  }, [filterStatus]);

  const {
    data: purchases,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset: resetPagination,
  } = useFirestorePagination("purchases", userRole, userCompanyId, currentUser?.uid, {
    pageSize: PAGE_SIZE,
    orderByField: "createdAt",
    orderDirection: "desc",
    filters,
    enabled: !!userCompanyId,
  });

  // جلب الموردين (لل autocomplete)
  const fetchSuppliers = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        getScopedQuery("suppliers", userRole, userCompanyId, currentUser?.uid)
      );
      setSuppliers(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          phone: d.data().phone || "",
        }))
      );
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  // جلب الأصناف (لل autocomplete - اختياري لو مفيش مخزون)
  // مطعم: القائمة = الخامات (raw_materials)، غيره: المنتجات (inventory)
  const fetchProducts = useCallback(async () => {
    if (!userCompanyId || !hasInventory) return;
    try {
      const snap = await getDocs(
        getScopedQuery(stockTarget, userRole, userCompanyId, currentUser?.uid)
      );
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid, hasInventory, stockTarget]);

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
  }, [fetchSuppliers, fetchProducts]);

  useEffect(() => {
    if (!userCompanyId) return;
    (async () => {
      try {
        const snap = await getDocs(getScopedQuery("variant_codes", userRole, userCompanyId, currentUser?.uid));
        setVariantCodes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    })();
  }, [userRole, userCompanyId, currentUser?.uid]);

  const quickSizeOptions = [...new Set(variantCodes.filter((c) => c.kind === "size").map((c) => c.name || c.code).filter(Boolean))].sort();
  const quickColorOptions = [...new Set(variantCodes.filter((c) => c.kind === "color").map((c) => c.name || c.code).filter(Boolean))].sort();

  useEffect(() => {
    resetPagination();
  }, [filterStatus, resetPagination]);

  async function handleQuickAddSupplier() {
    if (!quickSupplierName.trim()) { alert(t("common.fillRequired")); return; }
    if (!userCompanyId) return;
    setAddingSupplier(true);
    try {
      const docRef = await addDoc(collection(db, "suppliers"), {
        name: quickSupplierName.trim(),
        phone: quickSupplierPhone.trim() || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await fetchSuppliers();
      setNewPurchase((p) => ({ ...p, supplierId: docRef.id }));
      setQuickSupplierName(""); setQuickSupplierPhone(""); setShowQuickSupplier(false);
    } catch (e) { console.error(e); alert(t("common.errorGeneric")); }
    setAddingSupplier(false);
  }
  async function handleQuickAddProduct() {
    if (!quickProductName.trim()) { alert(t("common.fillRequired")); return; }
    if (!userCompanyId) return;
    setAddingProduct(true);
    try {
      // المقاس واللون ملابس بس. حتى لو اتكتبوا في الـ state (مفيش حقل
      // يعرضهم للصناعات التانية، بس كده نتأكد)، مش بنحفظهم — عشان
      //Inventory والفاتورة ما يبقاش فيه "" فاضية أو مقاس تاجر.
      const size = isClothing ? quickProductSize.trim() : "";
      const color = isClothing ? quickProductColor.trim() : "";
      // ملابس: نفس الاسم + المقاس + اللون = نفس الصنف. الإضافة المكررة
      // كانت بتعمل مستند جديد برقم مختلف فالمخزون يتفتت على كذا سطر
      // لنفس المقاس (كمية كل سطر لوحده والبيع بيخصم من واحد بس).
      // الصح: نختار الموجود وننبه المستخدم بدل التكرار.
      if (isClothing) {
        const nameNorm = quickProductName.trim().toLowerCase();
        const dup = products.find((p) =>
          (p.name || "").trim().toLowerCase() === nameNorm &&
          (p.size || "") === size && (p.color || "") === color
        );
        if (dup) {
          const already = (newPurchase.items || []).some((it) => it.productId === dup.id);
          if (!already) {
            const unit = getProductUnit(dup);
            const defaultCost = parseFloat(dup.lastUnitCost) > 0 ? parseFloat(dup.lastUnitCost)
              : parseFloat(dup.avgCost) > 0 ? parseFloat(dup.avgCost) : 0;
            const newItem = {
              productId: dup.id, quantity: "1", weight: "", unit,
              unitCost: defaultCost > 0 ? String(defaultCost) : "",
              amount: calculateItemAmount(unit, defaultCost, 1, "").toString(),
            };
            const items = [...(newPurchase.items || []), newItem];
            const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
            setNewPurchase({ ...newPurchase, items, amount: total > 0 ? total.toString() : newPurchase.amount });
          }
          alert(t("pur.variantExists"));
          setQuickProductName(""); setQuickProductPrice(""); setQuickProductSize(""); setQuickProductColor(""); setQuickProductCode(""); setShowQuickProduct(false);
          setAddingProduct(false);
          return;
        }
      }
      // مطعم: الصنف الجديد خامة (raw_materials) بتكلفة الوحدة، غيره: منتج مخزون
      const docRef = isRestaurant
        ? await addDoc(collection(db, "raw_materials"), {
            name: quickProductName.trim(),
            unit: "kg",
            quantity: 0,
            minQuantity: 0,
            costPerUnit: parseFloat(quickProductPrice) || 0,
            supplier: "",
            companyId: userCompanyId,
            createdBy: currentUser?.uid,
            createdAt: new Date().toISOString(),
          })
        : await addDoc(collection(db, "inventory"), {
        name: quickProductName.trim(),
        price: parseFloat(quickProductPrice) || 0,
        quantity: 0,
        size,
        color,
        code: quickProductCode.trim() || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await fetchProducts();
      const prod = { id: docRef.id, name: quickProductName.trim(), price: parseFloat(quickProductPrice) || 0, quantity: 0, size, color, code: quickProductCode.trim() || "" };
      setProducts((prev) => [...prev, prod]);
      setQuickProductName(""); setQuickProductPrice(""); setQuickProductSize(""); setQuickProductColor(""); setQuickProductCode(""); setShowQuickProduct(false);
    } catch (e) { console.error(e); alert(t("common.errorGeneric")); }
    setAddingProduct(false);
  }

  const filteredPurchases = useMemo(() => {
    if (!searchTerm.trim()) return purchases;
    const term = searchTerm.toLowerCase();
    return purchases.filter((p) => {
      const supplierName = suppliers.find((s) => s.id === p.supplierId)?.name || "";
      const itemNames = getPurchaseItems(p)
        .map((it) => {
          const pr = products.find((x) => x.id === it.productId);
          if (!isClothing) return pr?.name || "";
          return [pr?.name, pr?.size, pr?.color].filter(Boolean).join(" ");
        })
        .join(" ");
      return (
        supplierName.toLowerCase().includes(term) ||
        itemNames.toLowerCase().includes(term) ||
        String(p.amount).includes(term) ||
        (p.description || "").toLowerCase().includes(term)
      );
    });
  }, [purchases, searchTerm, suppliers, products]);

  async function addPurchase(e) {
    e.preventDefault();
    const items = newPurchase.items || [];
    // ✅ الإجمالي مقفول: مجموع الأصناف عند وجودها، ويدوي فقط عند عدم وجود أصناف
    const effectiveAmount = hasItems
      ? items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0)
      : parseFloat(newPurchase.amount) || 0;
    if (!newPurchase.supplierId || !(effectiveAmount > 0)) return;
    setSubmitting(true);
    try {
      const amount = effectiveAmount;
      const suppName = suppliers.find((s) => s.id === newPurchase.supplierId)?.name || "";
      const totalQty = items.reduce(
        (sum, it) => sum + stockDelta(it.unit || "piece", it.quantity, it.weight),
        0,
      );

      // ═══════════════════════════════════════════════════════════════
      // ذرّي: المخزون + مستند الشراء + متوسط التكلفة في transaction واحد
      // ═══════════════════════════════════════════════════════════════
      // قبل كده: المخزون بيتزاد سطر سطر (getDoc + updateDoc) وبعدين
      // addDoc للشراء. لو الـ addDoc فشل، المخزون اتزاد من غير فاتورة شراء
      // (= مخزون وهمي + رقم مفقود من كل التقارير).
      //
      // كمان: كنا بنختم "آخر سعر شراء" بس (lastUnitCost) — مفيش متوسط
      // تكلفة خالص، فصفحة الأرباح مفيهاش أساس لحساب التكلفة.
      const purchaseRef = doc(collection(db, "purchases"));
      // الأصناف المخزنية فقط (مطعم = خامات، غيره = منتجات) — عبر محرك المخزون
      const stockItems = items.filter((it) => hasInventory && stockLineId(it));

      const purchaseDoc = {
        supplierId: newPurchase.supplierId,
        supplierName: suppName,
        // ✅ أصناف متعددة بالوزن
        items: items.map((it) => ({
          productId: it.productId,
          productName: it.productName || "",
          quantity: parseFloat(it.quantity) || 0,
          weight: it.weight || "",
          unit: it.unit || "",
          unitCost: parseFloat(it.unitCost) || 0,
          amount: parseFloat(it.amount) || 0,
        })),
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        amount,
        unitCost: 0,
        quantity: hasInventory ? totalQty : 0,
        // هدف المخزون وقت الإنشاء — الحذف/المرتجع يعكس من نفس المكان
        // (فواتير المطعم القديمة راحت inventory، الجديدة raw_materials)
        stockTarget: hasInventory ? stockTarget : null,
        date: new Date().toISOString(),
        dueDate: newPurchase.dueDate || null,
        status: newPurchase.status,
        description: newPurchase.description || "",
        createdAt: new Date().toISOString(),
      };

      const planIn = (snaps, refs) => planStockIn(
        snaps.map((snap, idx) => ({ ref: refs[idx], snap, line: stockItems[idx] })),
        {
          isTrader,
          costKey: stockCostKey,
          meta: { supplierId: newPurchase.supplierId || "", supplierName: suppName },
        }
      );

      if (isOffline()) {
        // أوفلاين: قراءة الكاش + batch تُحفظ محليًا. أصناف لم تُفتح من قبل
        // تُتخطى من حركة المخزون (تُسجل في الفاتورة فقط) مع تحذير.
        const { refs: lineRefs, snaps } = await readStockCache(
          stockTarget, stockItems.map((it) => stockLineId(it))
        );
        const missing = snaps.filter((s) => !s || !s.exists()).length;
        if (missing > 0) console.warn(`offline purchase: ${missing} items not cached, stock skipped for them`);
        const batch = writeBatch(db);
        planIn(snaps, lineRefs).forEach(({ ref, updates }) => batch.update(ref, updates));
        batch.set(purchaseRef, purchaseDoc);
        await batch.commit();
      } else
      await runTransaction(db, async (tx) => {
        // 1) كل القراءات أولاً
        const { refs: lineRefs, snaps } = await readStockTx(
          tx, stockTarget, stockItems.map((it) => stockLineId(it))
        );

        // 2) تخطيط الإدخال (كمية + متوسط تكلفة) — نفس منطق المحرك لكل الأنشطة
        const stockWrites = planIn(snaps, lineRefs);

        // 3) كل الكتابات بعد ما كل القراءات خلصت
        stockWrites.forEach(({ ref, updates }) => tx.update(ref, updates));

        tx.set(purchaseRef, purchaseDoc);
      });

      const docRef = purchaseRef;

      await logActivity({
        actionType: "CREATE",
        collectionName: "purchases",
        itemId: docRef.id,
        details: `Created purchase from supplier ${newPurchase.supplierId}, amount ${amount}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      setNewPurchase({
        supplierId: "",
        items: [],
        amount: "",
        status: "pending",
        description: "",
        dueDate: "",
      });
      await Promise.all([resetPagination(), fetchProducts()]);
    } catch (e) {
      console.error(e);
      if (e?.code === "unavailable" && isOffline()) alert(t("offline.noData"));
      else alert(t("common.errorGeneric"));
    }
    setSubmitting(false);
  }

  async function updatePurchase(e) {
    e.preventDefault();
    try {
      const amount = parseFloat(editingPurchase.amount) || 0;
      await updateDoc(doc(db, "purchases", editingPurchase.id), {
        supplierId: editingPurchase.supplierId,
        amount,
        status: editingPurchase.status,
        description: editingPurchase.description || "",
        dueDate: editingPurchase.dueDate || null,
      });

      await logActivity({
        actionType: "UPDATE",
        collectionName: "purchases",
        itemId: editingPurchase.id,
        details: `Updated purchase amount to ${amount}, status to ${editingPurchase.status}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      await resetPagination();
      setShowEditModal(false);
    } catch (e) {
      console.error(e);
    }
  }

  // حذف فاتورة شراء = عكس أثرها المخزني أولاً (ذرّيًا)، ثم حذف المستند.
  // لو البضاعة اتباعت (الرصيد أقل من الكمية المدخلة) الحذف بيتمنع برسالة —
  // حذفها كان هيسيب مخزونًا وهميًا (بضاعة محسوبة مخزنيًا من غير فاتورة).
  async function deletePurchase(purchaseOrId) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      const purchase = typeof purchaseOrId === "object"
        ? purchaseOrId
        : purchases.find((x) => x.id === purchaseOrId) || { id: purchaseOrId };
      const target = purchase.stockTarget || "inventory";
      const stockItems = getPurchaseItems(purchase).filter((it) => stockLineId(it));
      if (hasInventory && stockItems.length > 0) {
        try {
          if (isOffline()) {
            const { refs, snaps } = await readStockCache(
              target, stockItems.map((it) => stockLineId(it))
            );
            const entries = snaps.map((snap, idx) => ({
              ref: refs[idx], snap, line: stockItems[idx],
            }));
            const writes = planStockOut(entries, { isTrader });
            const batch = writeBatch(db);
            writes.forEach(({ ref, updates }) => batch.update(ref, updates));
            batch.delete(doc(db, "purchases", purchase.id));
            await batch.commit();
          } else
          await runTransaction(db, async (tx) => {
            const { refs, snaps } = await readStockTx(
              tx, target, stockItems.map((it) => stockLineId(it))
            );
            const entries = snaps.map((snap, idx) => ({
              ref: refs[idx], snap, line: stockItems[idx],
            }));
            // عكس الإدخال = إخراج بنفس الكميات؛ الناقص يمنع الحذف
            const writes = planStockOut(entries, { isTrader });
            writes.forEach(({ ref, updates }) => tx.update(ref, updates));
            tx.delete(doc(db, "purchases", purchase.id));
          });
        } catch (txErr) {
          if (txErr?.message === "INSUFFICIENT_STOCK") {
            // حذف إجباري بطلب صريح من المستخدم: يمسح المستند ويصفّر الأرصدة
            // الناقصة بدل السالب. البضاعة المباعة فعلاً مش بترجع — لازم جرد بعدها
            if (!window.confirm(t("pur.forceDeleteConfirm"))) return;
            await forceDeletePurchase(purchase, stockItems, target);
            await logActivity({
              actionType: "DELETE",
              collectionName: "purchases",
              itemId: purchase.id,
              details: `Force-deleted purchase (short stock zeroed, not negative) from ${target}`,
              user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
            });
            await resetPagination();
            alert(t("pur.forceDeleted"));
            return;
          }
          throw txErr;
        }
      } else {
        await deleteDoc(doc(db, "purchases", purchase.id));
      }

      await logActivity({
        actionType: "DELETE",
        collectionName: "purchases",
        itemId: purchase.id,
        details: `Deleted purchase (stock reversed from ${target})`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      await resetPagination();
    } catch (e) {
      console.error(e);
      if (e?.code === "unavailable" && isOffline()) alert(t("offline.noData"));
    }
  }

  // حذف إجباري: مسح المستند + تصفير الأرصدة الناقصة (مستحيل سالب)
  // نفس نمط مرتجع الشراء في returns.js: deduct = min(delta, current)
  async function forceDeletePurchase(purchase, stockItems, target) {
    const writeForce = (w, snaps) => {
      snaps.forEach((snap, idx) => {
        const line = stockItems[idx];
        if (!snap || !snap.exists() || !line) return;
        const data = snap.data();
        const current = parseFloat(data.quantity) || 0;
        const unit = isTrader ? (line.unit || "piece") : "piece";
        const delta = isTrader
          ? stockDelta(unit, line.quantity, line.weight)
          : (parseFloat(line.quantity) || 0);
        if (!(delta > 0)) return;
        const effectiveUnit = unit || getProductUnit(data);
        w.update(doc(db, target, stockLineId(line)), {
          quantity: roundQty(Math.max(0, current - delta), effectiveUnit),
        });
      });
      w.delete(doc(db, "purchases", purchase.id));
    };
    if (isOffline()) {
      const { snaps } = await readStockCache(target, stockItems.map((it) => stockLineId(it)));
      const batch = writeBatch(db);
      writeForce(batch, snaps);
      await batch.commit();
    } else {
      await runTransaction(db, async (tx) => {
        const { snaps } = await readStockTx(tx, target, stockItems.map((it) => stockLineId(it)));
        writeForce(tx, snaps);
      });
    }
  }

  // تسجيل دفعة جزئية أو كاملة للمورد
  async function recordPayment(e) {
    e.preventDefault();
    if (!payingPurchase) return;
    const amount = parseFloat(payAmount) || 0;
    const currentPaid = parseFloat(payingPurchase.paidAmount) || 0;
    const total = parseFloat(payingPurchase.amount) || 0;
    const newPaid = currentPaid + amount;

    if (amount <= 0) {
      alert(t("pur.badAmount"));
      return;
    }
    if (newPaid > total) {
      alert(t("pur.payOver", { paid: newPaid, total }));
      return;
    }

    setPaying(true);
    try {
      const isFullyPaid = newPaid >= total;
      await updateDoc(doc(db, "purchases", payingPurchase.id), {
        paidAmount: newPaid,
        status: isFullyPaid ? "paid" : payingPurchase.status,
      });

      await logActivity({
        actionType: "UPDATE",
        collectionName: "purchases",
        itemId: payingPurchase.id,
        details: `Recorded payment of ${amount}, new paid total ${newPaid}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      await resetPagination();
      setShowPayModal(false);
      setPayAmount("");
      setPayingPurchase(null);
      alert(isFullyPaid ? t("pur.payFull") : t("pur.payOk"));
    } catch (err) {
      console.error(err);
      alert(t("pur.payFail"));
    }
    setPaying(false);
  }

  // ── طباعة باركود الأصناف (ملصق 38mm × 25mm لكل وحدة) ──
  // Label (top→bottom, centered): brand / model / "{size}-of {color}" / Code128(code) / price
  async function handlePrintBarcodes(purchase) {
    // Reference to keep the jsbarcode import bundled (rendering happens in print window via CDN fallback)
    void JsBarcode;
    const escHtml = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const escAttr = (s) => escHtml(s).replace(/"/g, "&quot;");
    // Code128 needs ASCII — strip anything outside printable ASCII so Arabic names can't break encoding
    const asciiSafe = (s, fb) => {
      const v = String(s ?? "").replace(/[^\x20-\x7E]/g, "").trim();
      return v || fb || "0";
    };

    // Fetch variant_codes (kind: color/size → code) to resolve colorCode/sizeCode by name
    let variantCodes = [];
    try {
      const snap = await getDocs(
        getScopedQuery("variant_codes", userRole, userCompanyId, currentUser?.uid)
      );
      variantCodes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error("variant_codes fetch failed, using raw values", e);
    }
    const colorMap = {};
    const sizeMap = {};
    variantCodes.forEach((vc) => {
      const nameKey = String(vc.name || "").trim().toLowerCase();
      const code = String(vc.code || "").trim();
      if (!nameKey || !code) return;
      if (vc.kind === "color") colorMap[nameKey] = code;
      else if (vc.kind === "size") sizeMap[nameKey] = code;
    });

    // اسم المحل (الشركة) — أول سطر في الليبل بدل اسم ثابت
    let storeName = "";
    try {
      if (userCompanyId) {
        const cSnap = await getDoc(doc(db, "companies", userCompanyId));
        if (cSnap.exists()) storeName = (cSnap.data().name || "").toString().trim();
      }
    } catch (e) {
      console.error("company name fetch failed", e);
    }

    const items = getPurchaseItems(purchase);
    if (items.length === 0) {
      alert("لا توجد أصناف في هذه الفاتورة لطباعة الباركود");
      return;
    }

    // مفتوح بلا سقف (طلب العميل): توليد الملصقات عرض فقط ولا يكتب
    // أي حاجة في قاعدة البيانات، فمفيش ضرر على السيستم مهما كان العدد.
    // الحماية الوحيدة المتبقية: تأكيد قبل الأعداد الكبيرة، عشان غلطة
    // كتابة في الكمية (10000 بدل 100) ما تهنجش المتصفح وتهدر بكرة ورق.
    const CONFIRM_OVER = 200;
    const labels = [];
    const barcodePersist = [];
    items.forEach((it) => {
      const prod = products.find((pr) => pr.id === it.productId) || {};
      const brand = storeName || (prod.brand || "").toString().trim() || "—";
      const model = (prod.model || prod.name || "").toString().trim() || "—";

      // ⚠️ المقاس/اللون ملابس بس. قبل كند كانوا بيفتروا "0" لغير الملابس
      // فكان الباركود بيطلع "7060-0-0" وسطر فاضي فيه 0 على الملصق.
      const size = isClothing ? (prod.size ?? it.size ?? "").toString().trim() : "";
      const color = isClothing ? (prod.color ?? it.color ?? "").toString().trim() : "";
      const colorCode = size || color ? asciiSafe(colorMap[color.toLowerCase()] ?? color, "") : "";
      const sizeCode = size || color ? asciiSafe(sizeMap[size.toLowerCase()] ?? size, "") : "";
      // سطر المقاس بالكود مش بالاسم: {sizeCode}-of {color}
      const sizeColorLine =
        size && color ? `${sizeCode}-of ${color}` : sizeCode || color || "";

      // barcode value: product.barcode || item.barcode, else `{productCode}-{colorCode}-{sizeCode}`
      let barcodeValue = (prod.barcode || it.barcode || "").toString().trim();
      if (!barcodeValue) {
        const prodCode = (prod.code || it.code || "").toString().trim();
        const base = prodCode
          ? asciiSafe(prodCode, "0000")
          : asciiSafe(String(purchase.id || prod.id || "0000").slice(0, 4), "0000");
        // لاحقة المقاس/اللون ملابس بس — تاجر وصيدلية بيطبعوا الكود لوحده.
        barcodeValue = isClothing
          ? `${base}-${colorCode}-${sizeCode}`.replace(/-{2,}/g, "-")
          : base;
      }
      barcodeValue = asciiSafe(barcodeValue, String(purchase.id || "0000").slice(0, 4));
      // Persist printed barcode so POS scan finds the label later
      // (مخزون فقط — الخامات ملهاش باركود بيع)
      if (!isRestaurant && it.productId && !prod.barcode && !it.barcode) {
        barcodePersist.push(updateDoc(doc(db, "inventory", it.productId), { barcode: barcodeValue }).catch((e) => console.warn("barcode persist:", e?.message)));
      }

      const priceNum = parseFloat(prod.price) || parseFloat(it.unitCost) || 0;
      const priceLine = `${moneyShort(priceNum, 'en-US')} EGP`;

      const rawQty = Math.floor(parseFloat(it.quantity) || 1);
      const qty = Math.max(1, rawQty);
      for (let k = 0; k < qty; k++) {
        labels.push({ brand, model, sizeColorLine, barcodeValue, priceLine });
      }
    });

    if (labels.length === 0) {
      alert("لا توجد أصناف قابلة للطباعة");
      return;
    }
    if (labels.length > CONFIRM_OVER && !window.confirm(`هتطبع ${labels.length} ملصق — متأكد من العدد؟`)) {
      return;
    }
    if (barcodePersist.length > 0) {
      try {
        await Promise.all(barcodePersist);
        await fetchProducts();
      } catch (e) { console.warn("barcode persist batch:", e?.message); }
    }

    const labelDivs = labels
      .map(
        (lb, idx) => `<div class="label">
        <div class="l-brand">${escHtml(lb.brand)}</div>
        <div class="l-model">${escHtml(lb.model)}</div>
        ${lb.sizeColorLine ? `<div class="l-variant">${escHtml(lb.sizeColorLine)}</div>` : ""}
        <svg class="bc" data-idx="${idx}" data-value="${escAttr(lb.barcodeValue)}"></svg>
        <div class="l-price">${escHtml(lb.priceLine)}</div>
      </div>`
      )
      .join("");

    const printContent = `<!DOCTYPE html>
<html dir="ltr">
<head>
<meta charset="UTF-8"/>
<title>Barcode labels 38x25</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .cap-note { font-family: Arial, sans-serif; font-size: 12px; direction: rtl; text-align: center; padding: 10px; background: #fef3c7; color: #92400e; }
  .label {
    width: 38mm; height: 25mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; overflow: hidden; padding: 1mm 1mm;
    page-break-after: always; break-after: page;
  }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .l-brand  { font-size: 9px; font-weight: 900; line-height: 1.2; letter-spacing: 0.3px; }
  .l-model  { font-size: 9px; font-weight: 900; line-height: 1.2; letter-spacing: 0.3px; }
  .l-variant{ font-size: 8px;  font-weight: 700; line-height: 1.2; }
  svg.bc { width: 35mm; height: 11mm; display: block; }
  .l-price  { font-size: 10px; font-weight: 900; line-height: 1.2; font-family: Arial, Helvetica, sans-serif; direction: ltr; letter-spacing: 0.5px; }
  @page { size: 38mm 25mm; margin: 0; }
  @media print {
    .label { page-break-after: always; break-after: page; }
    .label:last-child { page-break-after: auto; break-after: auto; }
  }
</style>
</head>
<body>
${labelDivs}
<script>
  function renderAll() {
    try {
      document.querySelectorAll('svg.bc').forEach(function(svg) {
        var val = svg.getAttribute('data-value') || '';
        // الأكواد الطويلة ثابتة (نظام المحل) — كل ما القيمة تطول بنرفّع الأعمدة
        // لحد أدنى آمن (0.7) مع هامش أمان حوالينها عشان تدخل كلها من غير قص
        var len = val.length;
        var w = len > 22 ? 0.7 : len > 16 ? 0.9 : len > 12 ? 1.2 : 1.6;
        try {
          JsBarcode(svg, val, { format: 'CODE128', displayValue: true, fontSize: 9, height: 30, width: w, margin: 6 });
        } catch (e) {
          var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          t.setAttribute('x', '50%'); t.setAttribute('y', '50%');
          t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '8');
          t.textContent = val;
          svg.appendChild(t);
        }
      });
    } catch (e) { console.error(e); }
  }
  function waitJsBarcode(tries, done) {
    if (typeof JsBarcode !== 'undefined') return done();
    if (tries <= 0) return done();
    setTimeout(function() { waitJsBarcode(tries - 1, done); }, 200);
  }
  window.onload = function() {
    waitJsBarcode(15, function() {
      renderAll();
      setTimeout(function() { window.focus(); window.print(); }, 400);
    });
  };
<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=500,height=600");
    if (!win) {
      alert("السماح بالـ popups مطلوب للطباعة");
      return;
    }
    win.document.write(printContent);
    win.document.close();
    win.focus();
  }

  const userCanDelete = canDelete(userRole);

  // إجمالي المصروفات = المدفوع فعلياً بس (زي منطق الإيرادات في الفواتير)
  const totalSpent = filteredPurchases.reduce((sum, p) => {
    if (p.status === "paid") return sum + (parseFloat(p.amount) || 0);
    return sum + (parseFloat(p.paidAmount) || 0);
  }, 0);

  const paidCount = filteredPurchases.filter((p) => p.status === "paid").length;
  const pendingCount = filteredPurchases.filter((p) => p.status === "pending").length;
  const totalOwed = filteredPurchases.reduce((sum, p) => {
    if (p.status === "overdue") {
      const total = parseFloat(p.amount) || 0;
      const paid = parseFloat(p.paidAmount) || 0;
      return sum + (total - paid);
    }
    return sum;
  }, 0);

  if (loading)
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>
            {t("common.loading")}
          </div>
        </div>
      </div>
    );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-cart-arrow-down" style={{ color: "#0891b2", marginLeft: 10 }}></i>
              {t("pur.title")}
            </h1>
            <p className="subtitle">{t("pur.subtitle")}</p>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              padding: "12px 16px",
              borderRadius: 10,
              marginBottom: 16,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <i className="fas fa-exclamation-circle"></i>
            {error.message || t("common.errorGeneric")}
          </div>
        )}

        <PurchasesStatsCards
          filteredPurchases={filteredPurchases}
          isAdmin={isAdmin}
          t={t}
          locale={locale}
          moneyShort={moneyShort}
        />

        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#0891b2" }}></i>
            {t("pur.add")}
          </h3>
          <form onSubmit={addPurchase}>
                     <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("pur.supplierReq")}</label>
                <AutocompleteInput
                  items={suppliers.map((s) => ({
                    id: s.id,
                    label: s.name,
                    sublabel: s.phone ? `📞 ${s.phone}` : "",
                  }))}
                  value={newPurchase.supplierId}
                  onChange={(id) => setNewPurchase({ ...newPurchase, supplierId: id })}
                  placeholder={t("pur.chooseSupplier")}
                  required
                />
                <button type="button" onClick={() => setShowQuickSupplier(!showQuickSupplier)} style={{ marginTop: 6, background: "none", border: "none", color: "#0891b2", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
                  {showQuickSupplier ? "✕ إلغاء" : "+ مورد جديد"}
                </button>
                <PurchasesQuickSupplier
                  showQuickSupplier={showQuickSupplier}
                  setShowQuickSupplier={setShowQuickSupplier}
                  quickSupplierName={quickSupplierName}
                  setQuickSupplierName={setQuickSupplierName}
                  quickSupplierPhone={quickSupplierPhone}
                  setQuickSupplierPhone={setQuickSupplierPhone}
                  addingSupplier={addingSupplier}
                  onAddSupplier={handleQuickAddSupplier}
                  t={t}
                />
              </div>
              {hasInventory && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t("pur.productOpt")}</label>
                  <AutocompleteInput
                    key={`pur-add-${(newPurchase.items || []).length}`}
                    items={products.map((p) => {
                      const v = variantLabel(p);
                      return {
                        id: p.id,
                        label: v ? `${p.name} (${v})` : p.name,
                        sublabel: `${p.quantity || 0} ${t("in.remaining")}`,
                      };
                    })}
                    value=""
                    onChange={(productId) => {
                      if (
                        !productId ||
                        (newPurchase.items || []).some(
                          (it) => it.productId === productId,
                        )
                      )
                        return;
                      const prod = products.find((p) => p.id === productId);
                      const unit = getProductUnit(prod);
                      // 🔴 الكود القديم كان بيحطّ سعر *البيع* (inventory.price)
                      // في خانة *التكلفة*. حد بيفتتح فاتورة شراء ويختار منتج
                      // من غير ما يعدّل الرقم كان بيسجّل تكلفة = سعر البيع،
                      // فكل تقرير التكلفة/الأرباح كان غلط والهامش 0%.
                      // الافتراضي الصح: آخر سعر شراء معروف، أو متوسط التكلفة
                      // (الخامات: costPerUnit). ولو مفيش أي منهم، نسيب الحقل
                      // فاضي ونطلب رقم صريح.
                      const defaultCost =
                        prod?.lastUnitCost != null && parseFloat(prod.lastUnitCost) > 0
                          ? parseFloat(prod.lastUnitCost)
                          : parseFloat(prod?.avgCost) > 0
                            ? parseFloat(prod.avgCost)
                            : parseFloat(prod?.costPerUnit) > 0
                              ? parseFloat(prod.costPerUnit)
                              : 0;
                      const newItem = {
                        productId,
                        quantity: "1",
                        weight: "",
                        unit,
                        unitCost: defaultCost > 0 ? String(defaultCost) : "",
                        amount: calculateItemAmount(unit, defaultCost, 1, "").toString(),
                      };
                      const items = [...(newPurchase.items || []), newItem];
                      const total = items.reduce(
                        (s, it) => s + (parseFloat(it.amount) || 0),
                        0,
                      );
                      setNewPurchase({
                        ...newPurchase,
                        items,
                        amount: total > 0 ? total.toString() : newPurchase.amount,
                      });
                    }}
                    placeholder={t("pur.chooseProduct")}
                  />
                </div>
              )}
              {hasInventory && (
                <div style={{ marginTop: 6 }}>
                  <button type="button" onClick={() => setShowQuickProduct(!showQuickProduct)} style={{ background: "none", border: "none", color: "#0891b2", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
                    {showQuickProduct ? "✕ إلغاء" : "+ منتج جديد"}
                  </button>
                  <PurchasesQuickProduct
                    showQuickProduct={showQuickProduct}
                    setShowQuickProduct={setShowQuickProduct}
                    quickProductName={quickProductName}
                    setQuickProductName={setQuickProductName}
                    quickProductPrice={quickProductPrice}
                    setQuickProductPrice={setQuickProductPrice}
                    quickProductSize={quickProductSize}
                    setQuickProductSize={setQuickProductSize}
                    quickProductColor={quickProductColor}
                    setQuickProductColor={setQuickProductColor}
                    quickProductCode={quickProductCode}
                    setQuickProductCode={setQuickProductCode}
                    addingProduct={addingProduct}
                    onAddProduct={handleQuickAddProduct}
                    isClothing={isClothing}
                    quickSizeOptions={quickSizeOptions}
                    quickColorOptions={quickColorOptions}
                    t={t}
                  />
                </div>
              )}
              {hasInventory && (newPurchase.items || []).length > 0 && (
                <div
                  style={{
                    background: "#f8fafc",
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#334155" }}>
                    {t("in.selectedProducts")} ({(newPurchase.items || []).length})
                    <span style={{ marginRight: 8, background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc", borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>
                      إجمالي العدد: {formTotalQty} قطعة
                    </span>
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(newPurchase.items || []).map((item, idx) => {
                      const prod = products.find((p) => p.id === item.productId);
                      const showWeight =
                        isTrader && isKgUnit(item.unit || getProductUnit(prod));
                      const updateItem = (patch) => {
                        const items = (newPurchase.items || []).map((it, i) => {
                          if (i !== idx) return it;
                          const next = { ...it, ...patch };
                          next.amount = calculateItemAmount(
                            next.unit,
                            next.unitCost,
                            next.quantity,
                            next.weight,
                          ).toString();
                          return next;
                        });
                        const total = items.reduce(
                          (s, it) => s + (parseFloat(it.amount) || 0),
                          0,
                        );
                        setNewPurchase({
                          ...newPurchase,
                          items,
                          amount: total > 0 ? total.toString() : "",
                        });
                      };
                      return (
                        <div
                          key={idx}
                          style={{
                            background: "#fff",
                            border: "1px solid #e2e8f0",
                            borderRadius: 8,
                            padding: 10,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 8,
                            }}
                          >
                            <span style={{ fontWeight: 700, fontSize: 13 }}>
                              {prod?.name || "—"}
                              {prod?.size ? (
                                <span style={{ marginRight: 6, background: "#eff6ff", color: "#1e3a8a", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 800 }}>
                                  📏 {prod.size}
                                </span>
                              ) : null}
                              {prod?.color ? (
                                <span style={{ marginRight: 4, background: "#eff6ff", color: "#1e3a8a", border: "1px solid #bfdbfe", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 800 }}>
                                  🎨 {prod.color}
                                </span>
                              ) : null}
                              {prod?.type ? (
                                <span style={{ marginRight: 4, background: "#f1f5f9", color: "#475569", borderRadius: 10, padding: "1px 8px", fontSize: 11 }}>
                                  {prod.type}
                                </span>
                              ) : null}
                              {showWeight && item.weight ? (
                                <span style={{ color: "#b45309" }}>
                                  {" "}
                                  ({item.weight} {t("trader.unit.kg")})
                                </span>
                              ) : null}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const items = (newPurchase.items || []).filter(
                                  (_, i) => i !== idx,
                                );
                                const total = items.reduce(
                                  (s, it) => s + (parseFloat(it.amount) || 0),
                                  0,
                                );
                                setNewPurchase({
                                  ...newPurchase,
                                  items,
                                  amount: total > 0 ? total.toString() : "",
                                });
                              }}
                              className="btn-danger btn-sm"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ flex: 2, minWidth: 110 }}>
                              <label style={{ fontSize: 11, color: "#64748b" }}>
                                {t("pur.qty")}
                              </label>
                              <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateItem({ quantity: e.target.value })
                                }
                              />
                            </div>
                            {showWeight && (
                              <div style={{ flex: 1, minWidth: 90 }}>
                                <label style={{ fontSize: 11, color: "#b45309", fontWeight: 700 }}>
                                  {t("trader.weight")}
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.weight || ""}
                                  onChange={(e) =>
                                    updateItem({ weight: e.target.value })
                                  }
                                  style={{
                                    border: "1px solid #f59e0b",
                                    background: "#fffbeb",
                                  }}
                                />
                              </div>
                            )}
                            <div style={{ flex: 2, minWidth: 140 }}>
                              <label style={{ fontSize: 11, color: "#64748b" }}>
                                {t("pur.unitCost")}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitCost}
                                onChange={(e) =>
                                  updateItem({ unitCost: e.target.value })
                                }
                                style={{ fontSize: 15, fontWeight: 700 }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("pur.amountReq")}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={hasItems ? itemsTotal.toFixed(2) : newPurchase.amount}
                  onChange={(e) => setNewPurchase({ ...newPurchase, amount: e.target.value })}
                  required
                  readOnly={hasItems}
                  style={hasItems ? { background: "#f1f5f9", color: "#0f172a", fontWeight: 800 } : undefined}
                  title={hasItems ? "يُحسب تلقائياً من مجموع الأصناف (مجموع quantity × unitCost)" : ""}
                />
                {hasItems && (
                  <small style={{ color: "#64748b", fontSize: 11 }}>
                    🔒 يُحسب تلقائياً من الأصناف — احذف الأصناف للإدخال اليدوي
                  </small>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("common.status")}</label>
                <select
                  value={newPurchase.status}
                  onChange={(e) => setNewPurchase({ ...newPurchase, status: e.target.value })}
                >
                  <option value="pending">{t("in.statusWait")}</option>
                  <option value="paid">{t("in.statusPaid")}</option>
                  <option value="overdue">{t("in.statusOver")}</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("common.description")}</label>
                <input
                  type="text"
                  placeholder={t("pur.notesPh")}
                  value={newPurchase.description}
                  onChange={(e) => setNewPurchase({ ...newPurchase, description: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("pur.due")}</label>
                <input
                  type="date"
                  value={newPurchase.dueDate}
                  onChange={(e) => setNewPurchase({ ...newPurchase, dueDate: e.target.value })}
                />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> {t("common.adding")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus"></i> {t("pur.add")}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <PurchasesFilterBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          t={t}
        />

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("pur.list")}
            </h3>
            <span className="table-count">
              {filteredPurchases.length} {t("pur.purchases")}
            </span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filteredPurchases}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onRefresh={resetPagination}
              pageSize={PAGE_SIZE}
              empty={
                <div className="table-empty">
                  <i className="fas fa-cart-arrow-down"></i>
                  <p>
                    {searchTerm || filterStatus !== "all" ? t("common.noResults") : t("pur.empty")}
                  </p>
                </div>
              }
              render={(pageItems) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("pur.supplier")}</th>
                      {hasInventory && <th>{t("in.product")}</th>}
                      {hasInventory && <th>{t("common.quantity")}</th>}
                      <th>{t("common.amount")}</th>
                      <th>{t("in.paid")}</th>
                      <th>{t("in.remaining")}</th>
                      <th>{t("common.status")}</th>
                      <th>{t("common.date")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((p, i) => {
                      const supplierName =
                        suppliers.find((s) => s.id === p.supplierId)?.name ||
                        t("common.unspecified");
                      // ✅ أصناف الفاتورة (متعددة أو صنف واحد قديم)
                      const purchaseItems = getPurchaseItems(p);
                      const paid = parseFloat(p.paidAmount) || 0;
                      const remaining = (parseFloat(p.amount) || 0) - paid;
                      const totalQty = purchaseItems.reduce(
                        (s, it) =>
                          s + stockDelta(it.unit || "piece", it.quantity, it.weight),
                        0,
                      );
                      return (
                        <tr key={p.id}>
                          <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{supplierName}</td>
                          {hasInventory && (
                            <td style={{ fontSize: 12 }}>
                              {purchaseItems.length === 0
                                ? t("common.unspecified")
                                : purchaseItems.map((it, idx) => {
                                    const prod = products.find((x) => x.id === it.productId);
                                    const nm = prod?.name || "—";
                                    const w = parseFloat(it.weight) || 0;
                                    const showW =
                                      isTrader &&
                                      isKgUnit(it.unit || "piece") &&
                                      w > 0;
                                    return (
                                      <div key={idx} style={{ marginBottom: 2 }}>
                                        {nm}{" "}
                                        {prod?.size ? (
                                          <span style={{ background: "#eff6ff", color: "#1e3a8a", borderRadius: 10, padding: "0 7px", fontSize: 11, fontWeight: 800 }}>
                                            📏 {prod.size}
                                          </span>
                                        ) : null}{" "}
                                        {prod?.color ? (
                                          <span style={{ background: "#eff6ff", color: "#1e3a8a", border: "1px solid #bfdbfe", borderRadius: 10, padding: "0 7px", fontSize: 11, fontWeight: 800 }}>
                                            🎨 {prod.color}
                                          </span>
                                        ) : null}{" "}
                                        — {it.quantity}
                                        {showW
                                          ? ` × ${it.weight} ${t("trader.unit.kg")}`
                                          : ""}
                                      </div>
                                    );
                                  })}
                            </td>
                          )}
                          {hasInventory && <td>{totalQty || p.quantity || 0}</td>}
                          <td style={{ fontWeight: 700, color: "var(--gray-800)" }}>
                            {moneyShort(p.amount || 0, locale)} {t("currency")}
                          </td>
                          <td style={{ color: "#10b981", fontWeight: 600 }}>
                            {paid > 0 ? `${moneyShort(paid, locale)} ${t("currency")}` : "—"}
                          </td>
                          <td style={{ fontWeight: 700, color: remaining > 0 ? "#ef4444" : "#10b981" }}>
                            {remaining > 0 ? `${moneyShort(remaining, locale)} ${t("currency")}` : "✓"}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                p.status === "paid"
                                  ? "badge-paid"
                                  : p.status === "pending"
                                  ? "badge-pending"
                                  : "badge-overdue"
                              }`}
                            >
                              {p.status === "paid"
                                ? t("in.statusPaid")
                                : p.status === "pending"
                                ? t("in.statusWait")
                                : t("in.statusOver")}
                            </span>
                          </td>
                          <td style={{ color: "var(--gray-500)", fontSize: 13 }}>
                            {p.date ? fmtDate(p.date, locale) : "-"}
                          </td>
                          <td>
                            <div className="table-actions">
                              <button
                                onClick={() => printPurchaseThermal(p, { suppliers, products, getPurchaseItems, variantLabel, isTrader, isKgUnit })}
                                className="btn-secondary btn-sm"
                                title={t("in.print")}
                              >
                                <i className="fas fa-print"></i>
                              </button>
                              {isClothing && (
                              <button
                                onClick={() => handlePrintBarcodes(p)}
                                className="btn-secondary btn-sm"
                                title="اطبع باركود الأصناف"
                                style={{ borderColor: "#8b5cf6", color: "#7c3aed" }}
                              >
                                <i className="fas fa-barcode"></i>
                              </button>
                            )}
                              {p.status !== "paid" && (
                                <button
                                  onClick={() => {
                                    setPayingPurchase(p);
                                    setPayAmount("");
                                    setShowPayModal(true);
                                  }}
                                  className="btn-success btn-sm"
                                  title={t("pur.pay")}
                                >
                                  <i className="fas fa-money-bill-wave"></i>
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingPurchase(p);
                                  setShowEditModal(true);
                                }}
                                className="btn-secondary btn-sm"
                                title={t("common.edit")}
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                onClick={() => {
                                  setReturningPurchase(p);
                                  setReturnQtys({});
                                  setReturnReason("");
                                  setShowReturnModal(true);
                                }}
                                className="btn-secondary btn-sm"
                                title="مرتجع شراء"
                                style={{ borderColor: "#f59e0b", color: "#d97706" }}
                              >
                                <i className="fas fa-undo"></i>
                              </button>
                              {userCanDelete && (
                                <button
                                  onClick={() => deletePurchase(p)}
                                  className="btn-danger btn-sm"
                                  title={t("common.delete")}
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            />
          </div>
        </div>
      </div>

      <PurchaseEditModal
          showEditModal={showEditModal}
          setShowEditModal={setShowEditModal}
          editingPurchase={editingPurchase}
          setEditingPurchase={setEditingPurchase}
          onSubmit={updatePurchase}
          suppliers={suppliers}
          t={t}
        />

      <PurchasePayModal
          showPayModal={showPayModal}
          setShowPayModal={setShowPayModal}
          payingPurchase={payingPurchase}
          payAmount={payAmount}
          setPayAmount={setPayAmount}
          paying={paying}
          onRecordPayment={recordPayment}
          t={t}
          locale={locale}
          moneyShort={moneyShort}
        />

        <PurchaseReturnModal
          showReturnModal={showReturnModal}
          setShowReturnModal={setShowReturnModal}
          returningPurchase={returningPurchase}
          returnQtys={returnQtys}
          setReturnQtys={setReturnQtys}
          returnReason={returnReason}
          setReturnReason={setReturnReason}
          returning={returning}
          onSubmit={submitPurchaseReturn}
          t={t}
          getPurchaseItems={getPurchaseItems}
          products={products}
          variantLabel={variantLabel}
        />
      </div>
    );
  }