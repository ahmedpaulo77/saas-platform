// src/pages/Invoices.js - thin orchestrator after split (was 2564 lines)
import React, { useState, useMemo } from "react";
import { collection, addDoc, deleteDoc, doc, updateDoc, getDoc, getDocs, query, where, runTransaction } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import Sidebar from "../components/common/Sidebar";
import { exportInvoicePDF } from "../utils/pdfExport";
import { logActivity } from "../utils/auditLogger";
import { getProductUnit, lineAmount, stockDelta, isKgUnit, roundQty, round2 } from "../utils/traderUnits";
import { createReturn } from "../utils/returns";
import { canDelete } from "../utils/companyQuery";
import { useInvoices } from "../hooks/useInvoices";
import InvoiceForm from "../components/invoices/InvoiceForm";
import InvoiceTable from "../components/invoices/InvoiceTable";
import InvoiceModals from "../components/invoices/InvoiceModals";
import { buildThermalPrintHTML, openThermalPrint } from "../utils/invoiceHelpers";

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
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const isCafe = userIndustry === "cafe";
  const isRestaurantOnly = userIndustry === "restaurant";
  const isRestaurant = (isRestaurantOnly || isCafe);
  const isFood = isRestaurant;
  const isTrader = userIndustry === "trader";
  const foodLabel = isCafe ? "الكافيه" : "المطعم";

  const {
    invoices, filteredInvoices, loading, loadingMore, hasMore, error, loadMore, resetPagination,
    clients, products, returnsByInvoice, fetchClients, fetchProducts, fetchReturnsMap,
    searchTerm, setSearchTerm, filterStatus, setFilterStatus,
    filterApproval, setFilterApproval,
    stats, handleOrderStatusChange, hasInventory, isAdmin, isClinic, PAGE_SIZE,
  } = useInvoices();
  const [barcodeScan, setBarcodeScan] = useState("");
  const [scanning, setScanning] = useState(false);

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
      setReturningInvoice(found); setReturnQtys({}); setReturnReason(""); setShowReturnModal(true);
      setBarcodeScan("");
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
    setScanning(false);
  }

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

  async function addInvoice(e) {
    e.preventDefault();
    if (!newInvoice.clientId || newInvoice.products.length === 0) return;
    setSubmitting(true);
    try {
      // NOTE: stock is NOT deducted here — deduction happens on confirmation (validateInvoice).
      const totalAmount = getTotalAmount;
      const invoiceData = {
        clientId: newInvoice.clientId,
        products: newInvoice.products.map((item) => ({ productId: item.productId, quantity: item.quantity, amount: item.amount, paidAmount: item.paidAmount || 0, weight: item.weight || "", unit: item.unit || "" })),
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
        companyId: userCompanyId, createdBy: currentUser?.uid, amount: totalAmount,
        // ⚠️ total = المبلغ المحصّل فعلاً (شامل رسوم التوصيل).
        // من غيره الـ InvoiceTable والـ revenue.js بيرجعوا للـ amount.
        total: isRestaurant && newInvoice.orderType === "delivery"
          ? round2(totalAmount + (parseFloat(newInvoice.deliveryFee) || 0))
          : totalAmount,
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
      const invLines = invoice.products || invoice.items || [];
      if (hasInventory && invLines.length > 0) {
        try {
          await runTransaction(db, async (tx) => {
            const reads = [];
            for (const item of invLines) {
              const ref = doc(db, "inventory", item.productId);
              const snap = await tx.get(ref);
              reads.push({ item, ref, snap });
            }
            for (const { item, snap } of reads) {
              if (!snap.exists()) continue;
              const curQty = snap.data().quantity || 0;
              const delta = isTrader ? stockDelta(item.unit || getProductUnit(snap.data()), item.quantity, item.weight) : parseFloat(item.quantity) || 0;
              if (delta > 0 && curQty - delta < 0) throw new Error("INSUFFICIENT_STOCK");
            }
            for (const { item, ref, snap } of reads) {
              if (!snap.exists()) continue;
              const curQty = snap.data().quantity || 0;
              const delta = isTrader ? stockDelta(item.unit || getProductUnit(snap.data()), item.quantity, item.weight) : parseFloat(item.quantity) || 0;
              if (delta > 0) tx.update(ref, { quantity: curQty - delta });
            }
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
        : (parseFloat(invoice.amount) || 0) + (parseFloat(invoice.deliveryFee) || 0);
      if (curPaid <= 0 && curTotal > 0) {
        patch.paidAmount = round2(curTotal);
        patch.status = "paid";
      }
      await updateDoc(doc(db, "invoices", invoice.id), patch);
      await logActivity({ actionType: "UPDATE", collectionName: "invoices", itemId: invoice.id, details: `Invoice validated (${cur}→validated), stock deducted`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await Promise.all([resetPagination(), fetchProducts()]);
      alert(t("in.validatedOk"));
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
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
      if (wasValidated && hasInventory && stockDeltas.length > 0) {
        // نرجّع القديم ونخصم الجديد ذرّيًا
        const refs = stockDeltas.map((d) => doc(db, "inventory", d.productId));
        await runTransaction(db, async (tx) => {
          const snaps = [];
          for (const r of refs) snaps.push(await tx.get(r));
          snaps.forEach((snap, i) => {
            if (!snap.exists()) return;
            const cur = parseFloat(snap.data().quantity) || 0;
            const next = cur - stockDeltas[i].delta; // delta موجب = زيادة ⇒ نخصم
            if (next < 0) {
              throw new Error(t("in.qtyOver"));
            }
            tx.update(refs[i], { quantity: roundQty(next, getProductUnit(snap.data())) });
          });
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
    } catch (err) { console.error(err); alert(err?.message || t("common.errorGeneric")); }
  }

  async function deleteInvoice(id, invoice) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    // ⚠️ فاتورة معتمدة = مخزونها اتخصم. حذفها من غير رجوع = مخزون مفقود
    // نهائياً. قبل كده مفيش أي رجوع.
    const wasValidated = invoice ? isInvoiceValidatedDoc(invoice) : false;
    const lines = invoice ? (invoice.products || invoice.items || []) : [];
    try {
      if (wasValidated && hasInventory && lines.length > 0) {
        const refs = lines.filter((l) => l.productId).map((l) => doc(db, "inventory", l.productId));
        if (refs.length) {
          await runTransaction(db, async (tx) => {
            const snaps = [];
            for (const r of refs) snaps.push(await tx.get(r));
            snaps.forEach((snap, i) => {
              if (!snap.exists()) return;
              const cur = parseFloat(snap.data().quantity) || 0;
              const l = lines.filter((x) => x.productId)[i];
              const back = isTrader
                ? stockDelta(l.unit || "piece", l.quantity, l.weight)
                : parseFloat(l.quantity) || 0;
              if (back > 0) {
                tx.update(refs[i], { quantity: roundQty(cur + back, getProductUnit(snap.data())) });
              }
            });
          });
        }
      }
      await deleteDoc(doc(db, "invoices", id));
      await logActivity({ actionType: "DELETE", collectionName: "invoices", itemId: id, details: `Deleted invoice${wasValidated ? ", stock restored" : ""}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await Promise.all([resetPagination(), fetchProducts()]);
    } catch (err) { console.error(err); alert(err?.message || t("common.errorGeneric")); }
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
        amount: (parseFloat(p.amount) || 0) * ratio,
      };
    }).filter((l) => l.quantity > 0);
    if (correctLines.length === 0) { alert("حدد كمية مرتجع أكبر من صفر"); return; }
    setReturning(true);
    try {
      const clientName = clients.find((c) => c.id === returningInvoice.clientId)?.name || "";
      await createReturn({ kind: "sale", refId: returningInvoice.id, entityId: returningInvoice.clientId, entityName: clientName, lines: correctLines, reason: returnReason, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId }, isTrader });
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
    exportInvoicePDF(invoice, clientName, productNames.join(", "));
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
            <div className="stat-card cyan"><div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div><div className="stat-value" style={{ fontSize: 18 }}>{stats.totalRevenue.toLocaleString()}</div><div className="stat-label">{t("in.statRevenue")}</div></div>
            {!isRestaurant && <div className="stat-card red"><div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div><div className="stat-value" style={{ fontSize: 18 }}>{stats.totalOverdue.toLocaleString()}</div><div className="stat-label">{t("in.statOverdueAmount")}</div></div>}
          </div>
        ) : (<div className="card" style={{ textAlign: "center", padding: "24px 20px", marginBottom: 24 }}><i className="fas fa-lock" style={{ fontSize: 24, color: "#94a3b8", marginBottom: 8 }}></i><p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>{t("in.statsAdminOnly")}</p></div>)}

        <InvoiceForm clients={clients} products={products} newInvoice={newInvoice} setNewInvoice={setNewInvoice} onSubmit={addInvoice} submitting={submitting} fetchClients={fetchClients} />

        {/* مرتجع بالباركود: اسكان باركود الفاتورة يفتح المرتجع مباشرة */}
        <form onSubmit={handleBarcodeReturn} className="form-card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}><i className="fas fa-barcode" style={{ color: "#1e3a8a", marginLeft: 6 }}></i>مرتجع بالباركود</div>
          <input
            type="text"
            placeholder="امسح باركود الفاتورة هنا..."
            value={barcodeScan}
            onChange={(e) => setBarcodeScan(e.target.value)}
            autoFocus={false}
            style={{ flex: 1, minWidth: 220, padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "monospace", direction: "ltr", textAlign: "left" }}
          />
          <button type="submit" className="btn-primary btn-sm" disabled={scanning || !barcodeScan.trim()}>{scanning ? "..." : "فتح المرتجع"}</button>
        </form>

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
          onReturn={(inv) => { setReturningInvoice(inv); setReturnQtys({}); setReturnReason(""); setShowReturnModal(true); }}
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
