// src/pages/Invoices.js - thin orchestrator after split (was 2564 lines)
import React, { useState, useMemo, useEffect } from "react";
import { collection, addDoc, deleteDoc, doc, updateDoc, getDoc, getDocs, query, where, runTransaction, writeBatch } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import Sidebar from "../components/common/Sidebar.js";
import { exportInvoicePDF } from "../utils/pdfExport.js";
import { logActivity } from "../utils/auditLogger.js";
import { getProductUnit, lineAmount, stockDelta, isKgUnit, roundQty, round2 } from "../utils/traderUnits.js";
import { createReturn } from "../utils/returns.js";
import { stockTargetFor, readStockTx, readStockCache, planStockOut, planStockIn, expandRecipeLines } from "../utils/stock.js";
import { isOffline, handleOfflineError } from "../utils/offline.js";
import { canDelete } from "../utils/companyQuery.js";
import { useInvoices } from "../hooks/useInvoices.js";
import InvoiceForm from "../components/invoices/InvoiceForm.jsx";
import InvoiceTable from "../components/invoices/InvoiceTable.jsx";
import InvoiceModals from "../components/invoices/InvoiceModals.jsx";
import { buildThermalPrintHTML, openThermalPrint } from "../utils/invoiceHelpers.js";
import { moneyShort } from "../utils/fmt.js";

/**
 * الفاتورة معتمدة (يعني مخزونها اتخصم)؟
 * نفس منطق useInvoices.isInvoiceValidated: المستندات القديمة اللي مفيش
 * فيها approval يعتبر معتمدة (backward compatible).
 */
function isInvoiceValidatedDoc(inv) {
  if (!inv) return false;
  return !inv.approval || inv.approval === "validated";
}

export default function Invoices() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const isCafe = userIndustry === "cafe";
  const isRestaurantOnly = userIndustry === "restaurant";
  const isRestaurant = (isRestaurantOnly || isCafe);
  const isFood = isRestaurant;
  const isTrader = userIndustry === "trader";
  const foodLabel = isCafe ? "الكافيه" : "المطعم";
  // مخزنيًا: المطعم يستهلك خامات عبر الوصفات — الكافيه يبيع من المخزون كالمعتاد
  const isRestaurantStock = userIndustry === "restaurant";

  /**
   * استهلاك خامات طلب مطعم عبر وصفات الأطباق (ذرّي).
   * الأطباق بلا وصفة تُتخطى (تحذير فقط) حتى لا تتعطل المطاعم القديمة.
   * @returns كائن فيه skipped (أسماء الأطباق بلا وصفة) و blocked عند نقص الخامات
   */
  async function consumeRestaurantStock(dishLines) {
    const dishIds = [...new Set((dishLines || []).map((l) => l.productId).filter(Boolean))];
    if (dishIds.length === 0) return { skipped: [] };
    const menuSnaps = await Promise.all(dishIds.map((id) => getDoc(doc(db, "inventory", id))));
    const dishById = new Map(dishIds.map((id, i) => [id, menuSnaps[i]]));
    const { materialLines, skipped } = expandRecipeLines(
      dishLines.map((l) => ({ productId: l.productId, quantity: l.quantity })), dishById
    );
    if (skipped.length > 0) {
      console.warn("restaurant dishes without recipe (stock not consumed):", skipped);
    }
    if (materialLines.length === 0) return { skipped };
    // أوفلاين: batch على الكاش (ليس ذرّيًا عبر الأجهزة — مقبول في الانقطاع)
    const applyOut = (snaps, refs) => {
      const entries = snaps.map((snap, idx) => ({ ref: refs[idx], snap, line: materialLines[idx] }));
      return planStockOut(entries, { isTrader: false });
    };
    try {
      if (isOffline()) {
        const { refs, snaps } = await readStockCache("raw_materials", materialLines.map((l) => l.productId));
        const batch = writeBatch(db);
        applyOut(snaps, refs).forEach(({ ref, updates }) => batch.update(ref, updates));
        await batch.commit();
      } else
      await runTransaction(db, async (tx) => {
        const { refs, snaps } = await readStockTx(tx, "raw_materials", materialLines.map((l) => l.productId));
        applyOut(snaps, refs).forEach(({ ref, updates }) => tx.update(ref, updates));
      });
    } catch (txErr) {
      if (txErr?.message === "INSUFFICIENT_STOCK") { alert(t("in.qtyOver")); return { skipped, blocked: true }; }
      throw txErr;
    }
    return { skipped };
  }

  const {
    invoices, filteredInvoices, loading, loadingMore, hasMore, error, loadMore, resetPagination,
    clients, products, returnsByInvoice, fetchClients, fetchProducts, fetchReturnsMap,
    searchTerm, setSearchTerm, filterStatus, setFilterStatus,
    filterApproval, setFilterApproval,
    stats, handleOrderStatusChange, hasInventory, isAdmin, isClinic, PAGE_SIZE,
  } = useInvoices();
  const [barcodeScan, setBarcodeScan] = useState("");
  const [scanning, setScanning] = useState(false);
  // مرتجع بمسح باركود القطعة: قطعة → صنف → فواتير البيع اللي فيها الصنف
  const [pieceScan, setPieceScan] = useState("");
  const [pieceScanning, setPieceScanning] = useState(false);
  const [pieceMatches, setPieceMatches] = useState(null);

  function invoiceLinesOf(inv) {
    return inv.products || inv.items || [];
  }

  async function handlePieceReturn(e) {
    e.preventDefault();
    const term = pieceScan.trim().toLowerCase();
    if (!term) return;
    setPieceScanning(true);
    try {
      // 1) الباركود → الصنف
      const product = (products || []).find((p) => (p.barcode || "").trim().toLowerCase() === term);
      if (!product) { alert(t("in.pieceNoProduct")); return; }
      // 2) الصنف → فواتير البيع اللي اتباع فيها (الأحدث أولاً)
      const matches = (invoices || [])
        .filter((inv) => invoiceLinesOf(inv).some((l) => l.productId === product.id))
        .slice()
        .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
      if (matches.length === 0) { alert(t("in.pieceNoInvoice")); setPieceMatches([]); return; }
      // فاتورة واحدة → افتح المرتجع على طول. أكتر من واحدة → اختار من القايمة
      if (matches.length === 1) {
        setPieceMatches(null);
        setPieceScan("");
        // التعديل 3: المرتجع للأدمن فقط
        if (!isAdmin) { alert(t("in.returnAdminOnly")); return; }
        setReturningInvoice(matches[0]); setReturnQtys({}); setReturnReason(""); setShowReturnModal(true);
        return;
      }
      setPieceMatches(matches);
    } finally {
      setPieceScanning(false);
    }
  }

  function openPieceMatch(inv) {
    setPieceMatches(null);
    setPieceScan("");
    // التعديل 3: المرتجع للأدمن فقط
    if (!isAdmin) { alert(t("in.returnAdminOnly")); return; }
    setReturningInvoice(inv); setReturnQtys({}); setReturnReason(""); setShowReturnModal(true);
  }

  function pieceClientName(inv) {
    return (clients || []).find((c) => c.id === inv.clientId)?.name || "—";
  }

  // امسح باركود الفاتورة بالسكانر → تتفتح شاشة المرتجع على طول
  async function handleBarcodeReturn(e) {
    e.preventDefault();
    const code = barcodeScan.trim().replace(/[^A-Za-z0-9]/g, "");
    if (!code) return;
    setScanning(true);
    try {
      let found = (invoices || []).find((inv) => String(inv.id || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase() === code.toLowerCase());
      if (!found) {
        const snap = await getDoc(doc(db, "invoices", barcodeScan.trim()));
        if (snap.exists()) found = { id: snap.id, ...snap.data() };
      }
      if (!found) { alert("لا توجد فاتورة بهذا الرقم"); return; }
      // التعديل 3: المرتجع للأدمن فقط — الموظف العادي يرى رسالة واضحة
      if (!isAdmin) {
        alert(t("in.returnAdminOnly"));
        setBarcodeScan("");
        return;
      }
      setReturningInvoice(found); setReturnQtys({}); setReturnReason(""); setShowReturnModal(true);
      setBarcodeScan("");
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
    setScanning(false);
  }

  // تسليم من نقطة البيع: مسح باركود فاتورة هناك → نفتح شاشة المرتجع هنا مباشرة
  // (من غير منطق فلوس/مخزون جديد — نفس المودال ونفس submitSaleReturn المجرب)
  useEffect(() => {
    let handoff = null;
    try { handoff = sessionStorage.getItem("aamalypro-return-invoice"); } catch { /* ignore */ }
    if (!handoff) return;
    (async () => {
      let inv = (invoices || []).find((x) => x.id === handoff);
      if (!inv) {
        try {
          const snap = await getDoc(doc(db, "invoices", handoff));
          if (snap.exists() && snap.data().companyId === userCompanyId) {
            inv = { id: snap.id, ...snap.data() };
          }
        } catch { /* ignore — المستخدم يقدر يدور يدوياً */ }
      }
      if (!inv) return;
      try { sessionStorage.removeItem("aamalypro-return-invoice"); } catch { /* ignore */ }
      // التعديل 3: المرتجع للأدمن فقط — لو موظف، امسح الـ handoff وأوقف
      if (!isAdmin) { alert(t("in.returnAdminOnly")); return; }
      setReturningInvoice(inv); setReturnQtys({}); setReturnReason(""); setShowReturnModal(true);
    })();
  }, [invoices]);

  const [submitting, setSubmitting] = useState(false);
  const emptyInvoice = {
    clientId: "", products: [], status: isRestaurant ? "new" : "pending",
    orderStatus: isRestaurant ? "new" : "", description: "", dueDate: "",
    orderType: "takeaway", orderSource: "direct", deliveryAddress: "", deliveryPhone: "", deliveryFee: "", customerNote: "", tableNumber: "", paymentMethod: "cash",
  };
  const [newInvoice, setNewInvoice] = useState(emptyInvoice);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [returningInvoice, setReturningInvoice] = useState(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnQtys, setReturnQtys] = useState({});
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);

  // نسبة ضريبة الشركة (من شركتي) — 0 تعني بدون ضريبة
  const [taxRate, setTaxRate] = useState(0);
  useEffect(() => {
    if (!userCompanyId) return;
    getDoc(doc(db, "companies", userCompanyId))
      .then((s) => { if (s.exists()) setTaxRate(parseFloat(s.data().taxRate) || 0); })
      .catch((e) => console.warn("company tax:", e?.message));
  }, [userCompanyId]);

  const calculateProductAmount = (productId, quantity, weight = "") => {
    const product = products.find((p) => p.id === productId);
    if (!product) return 0;
    if (isTrader) return lineAmount(getProductUnit(product), product.price, quantity, weight);
    const qty = parseFloat(quantity);
    if (qty > 0) return (parseFloat(product.price) || 0) * qty;
    return 0;
  };
  const getTotalAmount = useMemo(() => newInvoice.products.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0), [newInvoice.products]);
  const getEditTotalAmount = useMemo(() => !editingInvoice?.products ? 0 : editingInvoice.products.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0), [editingInvoice]);

  // 🆘 وضع المبلغ الحر: العيادة تكتب فاتورة بأصناف حرّة (كشف).
  // الكود القديم كان بيعمل `return` صامت — المستخدم بيدوس "حفظ" ومفيش
  // حاجة بتحصل ومفيش رسالة. دلوقتي: رسالة واضحة + مسموح فعليًا.
  // لو عايز كمان الصيدلية، ضيف "pharmacy" هنا وفي InvoiceForm.jsx برضه.
  const MANUAL_AMOUNT_INDUSTRIES = new Set(["clinic"]);

  // 🆕 مرتجع بالباركود: بس في المهن اللي الفاتورة نفسها مطبوع عليها
  // باركود (الملابس والصيدلية). في غير كده الباركود بيكون على الصنف
  // مش على الفاتورة، فالمسح بيفتح فاتورة غلط.
  const BARCODE_RETURN_INDUSTRIES = new Set(["clothing", "pharmacy"]);

  async function addInvoice(e) {
    e.preventDefault();
    const manualAmountMode = MANUAL_AMOUNT_INDUSTRIES.has(userIndustry) && newInvoice.products.length === 0;
    const manualAmount = parseFloat(newInvoice.amount) || 0;

    if (!newInvoice.clientId) { alert(t("in.clientRequired")); return; }
    if (!manualAmountMode && newInvoice.products.length === 0) { alert(t("in.needProducts")); return; }
    if (manualAmountMode && !(manualAmount > 0)) { alert(t("in.manualAmountRequired")); return; }
    setSubmitting(true);
    try {
      // NOTE: stock is NOT deducted here — deduction happens on confirmation (validateInvoice).
      const subtotalAmount = manualAmountMode ? manualAmount : getTotalAmount;
      // الضريبة على البضاعة (بدون التوصيل) — تُختم على المستند للتقارير والـ PDF
      const taxAmount = taxRate > 0 ? round2(subtotalAmount * taxRate / 100) : 0;
      const totalAmount = round2(subtotalAmount + taxAmount);
      const invoiceData = {
        clientId: newInvoice.clientId,
        products: newInvoice.products.map((item) => ({ productId: item.productId, quantity: item.quantity, amount: item.amount, paidAmount: item.paidAmount || 0, weight: item.weight || "", unit: item.unit || "" })),
        // 🆕 في وضع المبلغ الحر مفيش بنود — بنسجل سطر واحد افتراضي
        // عشان التقارير والطباعة والـ PDF تتعامل معاه زي أي فاتورة.
        // من غير كده الصفحات اللي بتقرا `products` كانت هتعرض الفاتورة فاضية.
        ...(manualAmountMode ? {
          manualAmount: true,
          products: [{
            productId: "",
            productName: newInvoice.description || t("in.manualLine"),
            quantity: 1,
            amount: subtotalAmount,
            paidAmount: 0,
            isManual: true,
          }],
        } : {}),
        status: isRestaurant ? "pending" : newInvoice.status,
        approval: "new",
        orderStatus: isRestaurant ? newInvoice.orderStatus || "new" : "",
        description: newInvoice.description || "", dueDate: newInvoice.dueDate || null,
        orderType: isRestaurant ? newInvoice.orderType : "", orderSource: isRestaurant ? (newInvoice.orderSource || "direct") : "", source: isRestaurant ? (newInvoice.orderSource || "direct") : "",
        deliveryAddress: isRestaurant && newInvoice.orderType === "delivery" ? newInvoice.deliveryAddress || "" : "",
        deliveryPhone: isRestaurant ? newInvoice.deliveryPhone || "" : "",
        deliveryFee: isRestaurant && newInvoice.orderType === "delivery" ? parseFloat(newInvoice.deliveryFee) || 0 : 0,
        tableNumber: isRestaurant && newInvoice.orderType === "dine_in" ? newInvoice.tableNumber || "" : "",
        customerNote: isRestaurant ? newInvoice.customerNote || "" : "",
        paymentMethod: newInvoice.paymentMethod || "cash",
        companyId: userCompanyId, createdBy: currentUser?.uid, amount: subtotalAmount,
        // الضريبة مختومة للتقارير والـ PDF — amount يبقى قيمة البضاعة فقط
        taxRate: taxRate > 0 ? taxRate : 0,
        taxAmount,
        // ⚠️ total = المبلغ المحصّل فعلاً (بضاعة + ضريبة + رسوم التوصيل).
        // من غيره الـ InvoiceTable والـ revenue.js بيرجعوا للـ amount.
        total: isRestaurant && newInvoice.orderType === "delivery"
          ? round2(subtotalAmount + taxAmount + (parseFloat(newInvoice.deliveryFee) || 0))
          : round2(subtotalAmount + taxAmount),
        // ⚠️ paidAmount: 0 — الطلب بيتسجل كـ "pending" ويتحقق بعد الاعتماد.
        paidAmount: 0,
        // ⚠️ type: "pos" — بدونه الطلب **مش بيوصل شاشة الكليحة خالص**:
        // Kitchen.js:159 بيطلب `data.type === "pos"`. الطلبات المتسجلة من
        // صفحة الفواتير كانت بتختفي من الكليحة.
        type: isRestaurant ? "pos" : "invoice",
        quantity: hasInventory ? newInvoice.products.reduce((s, it) => s + (isTrader ? stockDelta(it.unit || "piece", it.quantity, it.weight) : parseFloat(it.quantity || 0)), 0) : 0,
        date: new Date().toISOString(), createdAt: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, "invoices"), invoiceData);
      await logActivity({ actionType: "CREATE", collectionName: "invoices", itemId: docRef.id, details: `Created ${isRestaurant ? "order" : "invoice"} for client ${newInvoice.clientId}, total ${totalAmount}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      setNewInvoice({ ...emptyInvoice });
      await Promise.all([resetPagination(), fetchProducts()]);
      alert(t("in.createdPending"));
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
    setSubmitting(false);
  }

  async function sendToReview(invoice) {
    const cur = invoice.approval || "validated";
    if (cur === "validated") { alert(t("in.alreadyValidated")); return; }
    if (cur === "waiting") return;
    if (!window.confirm(t("in.sendToReview") + "؟")) return;
    try {
      await updateDoc(doc(db, "invoices", invoice.id), { approval: "waiting" });
      await logActivity({ actionType: "UPDATE", collectionName: "invoices", itemId: invoice.id, details: `Invoice sent to review (new→waiting)`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await resetPagination();
      alert(t("in.sentToReview"));
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
  }

  async function validateInvoice(invoice) {
    const cur = invoice.approval || "validated";
    if (cur === "validated") { alert(t("in.alreadyValidated")); return; }
    if (!window.confirm(t("in.confirmAsk"))) return;
    try {
      // Deduct stock now (transaction — aborts all on insufficient stock).
      // مطعم: استهلاك الخامات عبر الوصفات — غيره: خصم المخزون كالمعتاد.
      const invLines = invoice.products || invoice.items || [];
      if (isRestaurantStock && invLines.length > 0) {
        const { skipped, blocked } = await consumeRestaurantStock(invLines);
        if (blocked) return;
        var recipeSkippedNames = skipped;
      } else if (hasInventory && invLines.length > 0) {
        // نفس الفحص والخصم — tx أونلاين (ذرّي)، batch أوفلاين (queued).
        // w.update متطابقة التواقيع في الاثنين.
        const deductLines = invLines.filter((item) => item.productId);
        const applyDeduct = (w, snaps, refs) => {
          snaps.forEach((snap, i) => {
            if (!snap.exists()) return;
            const item = deductLines[i];
            const delta = isTrader
              ? stockDelta(item.unit || getProductUnit(snap.data()), item.quantity, item.weight)
              : parseFloat(item.quantity) || 0;
            const curQty = parseFloat(snap.data().quantity) || 0;
            if (!(delta > 0)) return;
            if (curQty - delta < 0) throw new Error("INSUFFICIENT_STOCK");
            w.update(refs[i], { quantity: curQty - delta });
          });
        };
        try {
          if (isOffline()) {
            const { refs, snaps } = await readStockCache("inventory", deductLines.map((l) => l.productId));
            if (snaps.some((s) => !s || !s.exists())) throw new Error(t("offline.noData"));
            const batch = writeBatch(db);
            applyDeduct(batch, snaps, refs);
            await batch.commit();
          } else
          await runTransaction(db, async (tx) => {
            const { refs, snaps } = await readStockTx(tx, "inventory", deductLines.map((l) => l.productId));
            applyDeduct(tx, snaps, refs);
          });
        } catch (txErr) {
          if (txErr?.message === "INSUFFICIENT_STOCK") { alert(t("in.qtyOver")); return; }
          throw txErr;
        }
      }
      // ⚠️ الاعتماد لازم كمان يسجّل المبالغ المحصّلة وإلا الطلب هيبقى
      // "معتمد" بس بـ paidAmount = 0 → صفر في كل التقارير. طلبات المطعم
      // بتتسجل بـ status: "pending" و paidAmount: 0، فلازم نحدّدهم هنا.
      const patch = {
        approval: "validated",
        validatedBy: currentUser?.uid || null,
        validatedAt: new Date().toISOString(),
      };
      const curPaid = parseFloat(invoice.paidAmount) || 0;
      const curTotal = parseFloat(invoice.total) > 0
        ? parseFloat(invoice.total)
        : (parseFloat(invoice.amount) || 0) + (parseFloat(invoice.deliveryFee) || 0) + (parseFloat(invoice.taxAmount) || 0);
      if (curPaid <= 0 && curTotal > 0) {
        patch.paidAmount = round2(curTotal);
        patch.status = "paid";
      }
      await updateDoc(doc(db, "invoices", invoice.id), patch);
      await logActivity({ actionType: "UPDATE", collectionName: "invoices", itemId: invoice.id, details: `Invoice validated (${cur}→validated), stock deducted`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await Promise.all([resetPagination(), fetchProducts()]);
      alert(t("in.validatedOk") + (typeof recipeSkippedNames !== "undefined" && recipeSkippedNames.length > 0 ? "\n" + t("in.recipeSkipped", { names: recipeSkippedNames.join("، ") }) : ""));
    } catch (err) {
      console.error(err);
      if (!handleOfflineError(err, t, (m) => alert(m))) alert(t("common.errorGeneric"));
    }
  }

  async function updateInvoice(e) {
    e.preventDefault();
    const invoiceRef = doc(db, "invoices", editingInvoice.id);
    const wasValidated = isInvoiceValidatedDoc(editingInvoice);
    const newLines = editingInvoice.products || [];
    // ⚠️ لو الفاتورة معتمدة، مخزونها اتخصم فعلاً عند الاعتماد
    // (validateInvoice). تعديل الكميات من غير ما نرجّع الفرق = المخزون
    // بيفضل غلط. قبل كده مفيش أي معالجة لله delta.
    const oldLines = (editingInvoice.products || editingInvoice.items || []).map((l) => ({
      productId: l.productId,
      quantity: isTrader
        ? stockDelta(l.unit || "piece", l.quantity, l.weight)
        : parseFloat(l.quantity) || 0,
    }));
    const newQtyByProduct = {};
    newLines.forEach((l) => {
      const q = isTrader
        ? stockDelta(l.unit || "piece", l.quantity, l.weight)
        : parseFloat(l.quantity) || 0;
      newQtyByProduct[l.productId] = (newQtyByProduct[l.productId] || 0) + q;
    });
    const deltas = [];
    oldLines.forEach((l) => {
      if (!l.productId) return;
      deltas.push({ productId: l.productId, delta: (newQtyByProduct[l.productId] || 0) - l.quantity });
    });
    Object.keys(newQtyByProduct).forEach((pid) => {
      if (!oldLines.some((l) => l.productId === pid)) {
        deltas.push({ productId: pid, delta: newQtyByProduct[pid] });
      }
    });
    const stockDeltas = deltas.filter((d) => Math.abs(d.delta) > 0.0001);

    try {
      if (wasValidated && isRestaurantStock) {
        // مطعم: فرق استهلاك الخامات (جديد − قديم) عبر الوصفات — ذرّيًا
        const mixLines = [...oldLines.map((l) => ({ productId: l.productId, quantity: l.quantity })), ...newLines.map((l) => ({ productId: l.productId, quantity: l.quantity }))];
        const dishIds = [...new Set(mixLines.map((l) => l.productId).filter(Boolean))];
        const menuSnaps = await Promise.all(dishIds.map((id) => getDoc(doc(db, "inventory", id))));
        const dishById = new Map(dishIds.map((id, i) => [id, menuSnaps[i]]));
        const sumBy = (arr) => { const m = new Map(); (arr || []).forEach((l) => m.set(l.productId, (m.get(l.productId) || 0) + (parseFloat(l.quantity) || 0))); return m; };
        const oM = sumBy(expandRecipeLines(oldLines, dishById).materialLines);
        const nM = sumBy(expandRecipeLines(newLines, dishById).materialLines);
        const allIds = [...new Set([...oM.keys(), ...nM.keys()])];
        const netOut = [], netIn = [];
        allIds.forEach((id) => {
          const d = (nM.get(id) || 0) - (oM.get(id) || 0);
          if (d > 0.0001) netOut.push({ productId: id, quantity: d });
          else if (d < -0.0001) netIn.push({ productId: id, quantity: -d });
        });
        if (netOut.length > 0 || netIn.length > 0) {
          const applyNet = (w, refs, snaps) => {
            const at = (l) => { const i = refs.findIndex((r) => r.id === l.productId); return { ref: refs[i], snap: snaps[i], line: l }; };
            planStockOut(netOut.map(at), { isTrader: false }).forEach(({ ref, updates }) => w.update(ref, updates));
            planStockIn(netIn.map(at), { isTrader: false }).forEach(({ ref, updates }) => w.update(ref, updates));
          };
          try {
            if (isOffline()) {
              const { refs, snaps } = await readStockCache("raw_materials", allIds);
              const batch = writeBatch(db);
              applyNet(batch, refs, snaps);
              await batch.commit();
            } else
            await runTransaction(db, async (tx) => {
              const { refs, snaps } = await readStockTx(tx, "raw_materials", allIds);
              applyNet(tx, refs, snaps);
            });
          } catch (txErr) {
            if (txErr?.message === "INSUFFICIENT_STOCK") { alert(t("in.qtyOver")); return; }
            throw txErr;
          }
        }
      } else if (wasValidated && hasInventory && stockDeltas.length > 0) {
        // نرجّع القديم ونخصم الجديد — tx أونلاين، batch أوفلاين
        const applyDiff = (w, snaps, refs) => {
          snaps.forEach((snap, i) => {
            if (!snap.exists()) return;
            const cur = parseFloat(snap.data().quantity) || 0;
            const next = cur - stockDeltas[i].delta; // delta موجب = زيادة ⇒ نخصم
            if (next < 0) {
              throw new Error(t("in.qtyOver"));
            }
            w.update(refs[i], { quantity: roundQty(next, getProductUnit(snap.data())) });
          });
        };
        const refs = stockDeltas.map((d) => doc(db, "inventory", d.productId));
        if (isOffline()) {
          const { snaps } = await readStockCache("inventory", stockDeltas.map((d) => d.productId));
          const batch = writeBatch(db);
          applyDiff(batch, snaps, refs);
          await batch.commit();
        } else
        await runTransaction(db, async (tx) => {
          const snaps = [];
          for (const r of refs) snaps.push(await tx.get(r));
          applyDiff(tx, snaps, refs);
        });
      }

      const totalAmount = editingInvoice.products?.length > 0 ? getEditTotalAmount : parseFloat(editingInvoice.amount) || 0;
      await updateDoc(invoiceRef, {
        clientId: editingInvoice.clientId, amount: totalAmount, status: editingInvoice.status, orderStatus: editingInvoice.orderStatus || "", description: editingInvoice.description || "", dueDate: editingInvoice.dueDate || null,
        orderType: editingInvoice.orderType || "", deliveryAddress: editingInvoice.orderType === "delivery" ? editingInvoice.deliveryAddress || "" : "", deliveryPhone: editingInvoice.deliveryPhone || "" , deliveryFee: editingInvoice.orderType === "delivery" ? parseFloat(editingInvoice.deliveryFee) || 0 : 0,
        tableNumber: editingInvoice.orderType === "dine_in" ? editingInvoice.tableNumber || "" : "",
        customerNote: editingInvoice.customerNote || "",
        paymentMethod: editingInvoice.paymentMethod || "cash",
        products: newLines.map((it) => ({ productId: it.productId, productName: it.productName || "", quantity: it.quantity, amount: it.amount, paidAmount: it.paidAmount || 0, weight: it.weight || "", unit: it.unit || "" })),
      });
      await logActivity({ actionType: "UPDATE", collectionName: "invoices", itemId: editingInvoice.id, details: `Updated invoice, status: ${editingInvoice.status}, orderStatus: ${editingInvoice.orderStatus}${wasValidated ? ", stock adjusted" : ""}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await Promise.all([resetPagination(), fetchProducts()]); setShowEditModal(false);
    } catch (err) {
      console.error(err);
      if (!handleOfflineError(err, t, (m) => alert(m))) alert(err?.message || t("common.errorGeneric"));
    }
  }

  async function deleteInvoice(id, invoice) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    // ⚠️ فاتورة معتمدة = مخزونها اتخصم. حذفها من غير رجوع = مخزون مفقود
    // نهائياً. قبل كده مفيش أي رجوع.
    const wasValidated = invoice ? isInvoiceValidatedDoc(invoice) : false;
    const lines = invoice ? (invoice.products || invoice.items || []) : [];
    try {
      if (wasValidated && isRestaurantStock && lines.length > 0) {
        // مطعم: رد الخامات المستهلكة عبر الوصفات
        const dishIds = [...new Set(lines.map((l) => l.productId).filter(Boolean))];
        const menuSnaps = await Promise.all(dishIds.map((id) => getDoc(doc(db, "inventory", id))));
        const dishById = new Map(dishIds.map((id, i) => [id, menuSnaps[i]]));
        const { materialLines } = expandRecipeLines(lines, dishById);
        if (materialLines.length > 0) {
          if (isOffline()) {
            const { refs, snaps } = await readStockCache("raw_materials", materialLines.map((l) => l.productId));
            const entries = snaps.map((snap, i) => ({ ref: refs[i], snap, line: materialLines[i] }));
            const batch = writeBatch(db);
            planStockIn(entries, { isTrader: false }).forEach(({ ref, updates }) => batch.update(ref, updates));
            await batch.commit();
          } else
          await runTransaction(db, async (tx) => {
            const { refs, snaps } = await readStockTx(tx, "raw_materials", materialLines.map((l) => l.productId));
            const entries = snaps.map((snap, i) => ({ ref: refs[i], snap, line: materialLines[i] }));
            planStockIn(entries, { isTrader: false }).forEach(({ ref, updates }) => tx.update(ref, updates));
          });
        }
      } else if (wasValidated && hasInventory && lines.length > 0) {
        const refs = lines.filter((l) => l.productId).map((l) => doc(db, "inventory", l.productId));
        const flines = lines.filter((x) => x.productId);
        const applyBack = (w, snaps) => {
          snaps.forEach((snap, i) => {
            if (!snap.exists()) return;
            const cur = parseFloat(snap.data().quantity) || 0;
            const l = flines[i];
            const back = isTrader
              ? stockDelta(l.unit || "piece", l.quantity, l.weight)
              : parseFloat(l.quantity) || 0;
            if (back > 0) {
              w.update(refs[i], { quantity: roundQty(cur + back, getProductUnit(snap.data())) });
            }
          });
        };
        if (refs.length) {
          if (isOffline()) {
            const { snaps } = await readStockCache("inventory", flines.map((l) => l.productId));
            const batch = writeBatch(db);
            applyBack(batch, snaps);
            await batch.commit();
          } else
          await runTransaction(db, async (tx) => {
            const snaps = [];
            for (const r of refs) snaps.push(await tx.get(r));
            applyBack(tx, snaps);
          });
        }
      }
      await deleteDoc(doc(db, "invoices", id));
      await logActivity({ actionType: "DELETE", collectionName: "invoices", itemId: id, details: `Deleted invoice${wasValidated ? ", stock restored" : ""}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await Promise.all([resetPagination(), fetchProducts()]);
    } catch (err) {
      console.error(err);
      if (!handleOfflineError(err, t, (m) => alert(m))) alert(err?.message || t("common.errorGeneric"));
    }
  }

  async function recordPayment(e) {
    e.preventDefault(); if (!payingInvoice) return;
    const amount = parseFloat(payAmount) || 0; const cur = parseFloat(payingInvoice.paidAmount) || 0; const total = parseFloat(payingInvoice.amount) || 0; const newPaid = cur + amount;
    if (amount <= 0) { alert(t("in.badAmount")); return; }
    if (newPaid > total) { alert(t("in.payOver", { paid: newPaid, total })); return; }
    setPaying(true);
    try {
      const isFullyPaid = newPaid >= total;
      await updateDoc(doc(db, "invoices", payingInvoice.id), { paidAmount: newPaid, status: isFullyPaid ? "paid" : payingInvoice.status });
      await logActivity({ actionType: "UPDATE", collectionName: "invoices", itemId: payingInvoice.id, details: `Recorded payment of ${amount}, new total paid ${newPaid}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await resetPagination(); setShowPayModal(false); setPayAmount(""); setPayingInvoice(null); alert(isFullyPaid ? t("in.payFull") : t("in.payOk"));
    } catch (err) { console.error(err); alert(t("in.payFail")); }
    setPaying(false);
  }

  async function submitSaleReturn(e) {
    e.preventDefault(); if (!returningInvoice) return;
    // Prevent double returns: sum prior returned qty per productId for this invoice
    let priorMap = {};
    try {
      const rq = query(collection(db, "returns"), where("refId", "==", returningInvoice.id), where("companyId", "==", userCompanyId));
      const priorSnap = await getDocs(rq);
      priorSnap.docs.forEach((d) => {
        const rd = d.data();
        (rd.items || rd.lines || []).forEach((l) => {
          if (!l.productId) return;
          priorMap[l.productId] = (priorMap[l.productId] || 0) + (parseFloat(l.quantity) || 0);
        });
      });
    } catch (err) { console.warn("prior returns fetch:", err?.message); }
    // correct lines with proper idx, clamped so prior+new <= original
    // ⚠️ POS/المطعم بيكتبوا السطور في `items` مش `products` (POS.js).
    // الكود كان بيقرا `products` بس، فكان correctLines فاضي على طول والialog
    // "حدد كمية مرتجع أكبر من صفر" بيظهر للمستخدم على أي مرتجع من POS.
    const sourceLines = returningInvoice.products || returningInvoice.items || [];

    // ── نسبة الخصم (StorePOS فقط) ───────────────────────────────────
    // StorePOS يسجّل amount السطر قبل الخصم (price × qty).
    // لو المرتجع يستخدم هذا الـ amount مباشرةً، العميل يسترد أكتر
    // مما دفعه فعلاً. الحل: نضرب مبلغ كل سطر في نسبة (بعد الخصم / قبله).
    // POS.js دايماً discount=0 → ratio=1 (مفيش تغيير).
    // Invoices.js مفيش خصم على مستوى الفاتورة → ratio=1 كمان.
    const invSubtotal = parseFloat(returningInvoice.subtotal) || 0;
    const invDiscount = parseFloat(returningInvoice.discount) || 0;
    const discountRatio = (invSubtotal > 0 && invDiscount > 0)
      ? (invSubtotal - invDiscount) / invSubtotal
      : 1;

    const correctLines = sourceLines.map((p, idx) => {
      const rq = parseFloat(returnQtys[idx]) || 0; const oq = parseFloat(p.quantity) || 0;
      const already = priorMap[p.productId] || 0;
      const remaining = Math.max(0, oq - already);
      const allowed = Math.min(rq, remaining);
      const ratio = oq > 0 ? allowed / oq : 0;
      return {
        productId: p.productId,
        productName: p.productName || p.name || "",
        quantity: allowed,
        weight: p.weight || "",
        unit: p.unit || "",
        // مبلغ الرد = سعر السطر × نسبة الكمية × نسبة الخصم
        amount: round2((parseFloat(p.amount) || 0) * ratio * discountRatio),
      };
    }).filter((l) => l.quantity > 0);
    if (correctLines.length === 0) { alert("حدد كمية مرتجع أكبر من صفر"); return; }
    setReturning(true);
    try {
      const clientName = clients.find((c) => c.id === returningInvoice.clientId)?.name || "";
      // مطعم: التوثيق بالأطباق (لمنع التكرار)، وحركة المخزون بالخامات الموسّعة
      let stockLines = null, stockTarget = stockTargetFor(userIndustry);
      if (isRestaurantStock) {
        const dishIds = [...new Set(correctLines.map((l) => l.productId).filter(Boolean))];
        const menuSnaps = await Promise.all(dishIds.map((id) => getDoc(doc(db, "inventory", id))));
        const dishById = new Map(dishIds.map((id, i) => [id, menuSnaps[i]]));
        stockLines = expandRecipeLines(correctLines, dishById).materialLines;
        stockTarget = "raw_materials";
      }
      await createReturn({ kind: "sale", refId: returningInvoice.id, entityId: returningInvoice.clientId, entityName: clientName, lines: correctLines, stockLines, target: stockTarget, reason: returnReason, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId }, isTrader });
      setShowReturnModal(false); setReturningInvoice(null); setReturnQtys({}); setReturnReason("");
      await Promise.all([resetPagination(), fetchProducts(), fetchReturnsMap()]); alert("تم تسجيل المرتجع ورد المخزون");
    } catch (err) { console.error(err); alert(err?.message || t("common.errorGeneric")); }
    setReturning(false);
  }

  function handleThermalPrint(invoice) {
    const clientName = clients.find((c) => c.id === invoice.clientId)?.name || "زبون";
    const html = buildThermalPrintHTML({ invoice, clientName, products, isTrader, getProductUnit, isKgUnit, t, isCafe });
    openThermalPrint(html);
  }
  function handleExportPDF(invoice) {
    const clientName = clients.find((c) => c.id === invoice.clientId)?.name || t("common.unspecified");
    const productNames = invoice.products?.map((p) => products.find((pr) => pr.id === p.productId)?.name || t("common.unspecified")) || [];
    // مرّرنا المنتجات و locale: الـ PDF بيعرض بنود الفاتورة واحد واحد،
    // و moneyShort كان بيرجع 0 من غير locale. كمان لو المتصفح رفض الـ popup
    // الكود بيرجع false — قبل كند كان بيرمي exception والصفحة بتقع.
    const ok = exportInvoicePDF(
      { ...invoice, __products: products },
      clientName,
      productNames.join(", "),
      "invoice",
      locale
    );
    if (!ok) alert(t("common.allowPopups"));
  }

  if (loading) return (<div style={{ display: "flex", minHeight: "100vh" }}><Sidebar /><div className="main-content"><div className="loading"><div className="spinner"></div>{t("common.loading")}</div></div></div>);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header"><div><h1><i className="fas fa-file-invoice" style={{ color: "#f59e0b", marginLeft: 10 }}></i>{isRestaurant ? `🧾 طلبات ${foodLabel}` : t("in.title")}</h1><p className="subtitle">{isRestaurant ? `تسجيل ومتابعة طلبات ${foodLabel}` : t("in.subtitle")}</p></div></div>
        {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13 }}><i className="fas fa-exclamation-circle"></i> {error.message || t("common.errorGeneric")}</div>}

        {isAdmin ? (
          <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
            <div className="stat-card amber"><div className="stat-icon"><i className="fas fa-file-invoice"></i></div><div className="stat-value">{filteredInvoices.length}</div><div className="stat-label">{isRestaurant ? "إجمالي الطلبات" : t("in.statTotal")}</div></div>
            {isRestaurant ? (<><div className="stat-card indigo"><div className="stat-icon"><i className="fas fa-bell"></i></div><div className="stat-value">{stats.newOrdersCount}</div><div className="stat-label">طلبات جديدة</div></div><div className="stat-card amber"><div className="stat-icon"><i className="fas fa-fire"></i></div><div className="stat-value">{stats.preparingCount}</div><div className="stat-label">قيد التحضير</div></div></>) : (<><div className="stat-card green"><div className="stat-icon"><i className="fas fa-check-circle"></i></div><div className="stat-value">{stats.paidCount}</div><div className="stat-label">{t("in.statPaid")}</div></div><div className="stat-card indigo"><div className="stat-icon"><i className="fas fa-clock"></i></div><div className="stat-value">{stats.pendingCount}</div><div className="stat-label">{t("in.statPending")}</div></div></>)}
            <div className="stat-card cyan"><div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div><div className="stat-value" style={{ fontSize: 18 }}>{moneyShort(stats.totalRevenue, locale)}</div><div className="stat-label">{t("in.statRevenue")}</div></div>
            {!isRestaurant && <div className="stat-card red"><div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div><div className="stat-value" style={{ fontSize: 18 }}>{moneyShort(stats.totalOverdue, locale)}</div><div className="stat-label">{t("in.statOverdueAmount")}</div></div>}
          </div>
        ) : (<div className="card" style={{ textAlign: "center", padding: "24px 20px", marginBottom: 24 }}><i className="fas fa-lock" style={{ fontSize: 24, color: "#94a3b8", marginBottom: 8 }}></i><p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>{t("in.statsAdminOnly")}</p></div>)}

        <InvoiceForm clients={clients} products={products} newInvoice={newInvoice} setNewInvoice={setNewInvoice} onSubmit={addInvoice} submitting={submitting} fetchClients={fetchClients} taxRate={taxRate} />

       {/* مرتجع بالباركود: اسكان باركود الفاتورة يفتح المرتجع مباشرة

           ⚠️ كان ظاهر لـ super_market كمان. الباركود في السوبر ماركت
           بيكون على **القطعة** (بيتجيب فاتورة من رقم الصنف)، لا على الفاتورة —
           يعني المسح بيفتح فاتورة غلط أو مفيش حاجة. سيبناها في
           المهن اللي الفاتورة نفسها ليها باركود مطبوع (الملابس والصيدلية).
           لو عايز تضيفها لمهنة تانية، ضيف هنا سطر واحد. */}
{BARCODE_RETURN_INDUSTRIES.has(userIndustry) && (
  <form onSubmit={handleBarcodeReturn} className="form-card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
    <div style={{ fontWeight: 800, fontSize: 14 }}><i className="fas fa-barcode" style={{ color: "#1e3a8a", marginLeft: 6 }}></i>{t("in.returnByBarcode")}</div>
    <input
      type="text"
      placeholder={t("in.scanInvoicePh")}
      value={barcodeScan}
      onChange={(e) => setBarcodeScan(e.target.value)}
      autoFocus={false}
      style={{ flex: 1, minWidth: 220, padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "monospace", direction: "ltr", textAlign: "left" }}
    />
    <button type="submit" className="btn-primary btn-sm" disabled={scanning || !barcodeScan.trim()}>{scanning ? "..." : t("in.openReturn")}</button>
  </form>
)}

{/* مرتجع بمسح باركود القطعة: العميل راجع بقطعة (من غير فاتورة) → نلاقي فاتورة بيعها */}
{BARCODE_RETURN_INDUSTRIES.has(userIndustry) && (
  <div className="form-card" style={{ marginTop: 12 }}>
    <form onSubmit={handlePieceReturn} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}><i className="fas fa-barcode" style={{ color: "#1e3a8a", marginLeft: 6 }}></i>{t("in.pieceReturnTitle")}</div>
      <input
        type="text"
        placeholder={t("in.scanPiecePh")}
        value={pieceScan}
        onChange={(e) => { setPieceScan(e.target.value); if (pieceMatches && pieceMatches.length) setPieceMatches(null); }}
        style={{ flex: 1, minWidth: 220, padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "monospace", direction: "ltr", textAlign: "left" }}
      />
      <button type="submit" className="btn-primary btn-sm" disabled={pieceScanning || !pieceScan.trim()}>{pieceScanning ? "..." : t("in.findInvoices")}</button>
    </form>
    {pieceMatches && pieceMatches.length > 0 && (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
          {t("in.pieceSoldIn", { n: pieceMatches.length })}
        </div>
        {pieceMatches.map((inv) => (
          <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 6, fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>{pieceClientName(inv)}</span>
            <span style={{ color: "#64748b" }}>{String(inv.date || inv.createdAt || "").slice(0, 10)}</span>
            <span style={{ fontWeight: 800, color: "#1e3a8a" }}>{moneyShort(inv.amount || 0, locale)} {t("currency")}</span>
            <button type="button" className="btn-primary btn-sm" onClick={() => openPieceMatch(inv)} style={{ marginInlineStart: "auto" }}>
              {t("in.openPieceReturn")}
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
)}

        <InvoiceTable
          filteredInvoices={filteredInvoices} clients={clients} products={products} returnsByInvoice={returnsByInvoice}
          loading={loading} loadingMore={loadingMore} hasMore={hasMore} loadMore={loadMore} resetPagination={resetPagination}
          searchTerm={searchTerm} setSearchTerm={setSearchTerm} filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterApproval={filterApproval} setFilterApproval={setFilterApproval}
          onOrderStatusChange={handleOrderStatusChange}
          onSendToReview={isAdmin ? sendToReview : null}
          onValidate={isAdmin ? validateInvoice : null}
          onEdit={(inv) => { setEditingInvoice({ ...inv }); setShowEditModal(true); }}
          onPay={(inv) => { setPayingInvoice(inv); setPayAmount(""); setShowPayModal(true); }}
          onReturn={isAdmin ? (inv) => { setReturningInvoice(inv); setReturnQtys({}); setReturnReason(""); setShowReturnModal(true); } : null}
          onDelete={deleteInvoice}
          onThermalPrint={handleThermalPrint}
          onExportPDF={handleExportPDF}
          PAGE_SIZE={PAGE_SIZE}
        />

        <InvoiceModals
          editingInvoice={editingInvoice} setEditingInvoice={setEditingInvoice} showEditModal={showEditModal} setShowEditModal={setShowEditModal} onUpdateInvoice={updateInvoice}
          payingInvoice={payingInvoice} showPayModal={showPayModal} setShowPayModal={setShowPayModal} payAmount={payAmount} setPayAmount={setPayAmount} onRecordPayment={recordPayment} paying={paying}
          returningInvoice={returningInvoice} showReturnModal={showReturnModal} setShowReturnModal={setShowReturnModal} returnQtys={returnQtys} setReturnQtys={setReturnQtys} returnReason={returnReason} setReturnReason={setReturnReason} onSubmitReturn={submitSaleReturn} returning={returning}
          clients={clients} products={products}
        />
      </div>
    </div>
  );
}
