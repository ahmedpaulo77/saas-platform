// src/pages/Invoices.js - thin orchestrator after split (was 2564 lines)
import React, { useState, useMemo } from "react";
import { collection, addDoc, deleteDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import Sidebar from "../components/common/Sidebar";
import { exportInvoicePDF } from "../utils/pdfExport";
import { logActivity } from "../utils/auditLogger";
import { getProductUnit, lineAmount, stockDelta, isKgUnit } from "../utils/traderUnits";
import { createReturn } from "../utils/returns";
import { canDelete } from "../utils/companyQuery";
import { useInvoices } from "../hooks/useInvoices";
import InvoiceForm from "../components/invoices/InvoiceForm";
import InvoiceTable from "../components/invoices/InvoiceTable";
import InvoiceModals from "../components/invoices/InvoiceModals";
import { buildThermalPrintHTML, openThermalPrint } from "../utils/invoiceHelpers";

export default function Invoices() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const isRestaurant = (userIndustry === "restaurant" || userIndustry === "cafe");
  const isTrader = userIndustry === "trader";

  const {
    filteredInvoices, loading, loadingMore, hasMore, error, loadMore, resetPagination,
    clients, products, fetchClients, fetchProducts,
    searchTerm, setSearchTerm, filterStatus, setFilterStatus,
    stats, handleOrderStatusChange, hasInventory, isAdmin, isClinic, PAGE_SIZE,
  } = useInvoices();

  const [submitting, setSubmitting] = useState(false);
  const emptyInvoice = {
    clientId: "", products: [], status: isRestaurant ? "new" : "pending",
    orderStatus: isRestaurant ? "new" : "", description: "", dueDate: "",
    orderType: "takeaway", orderSource: "direct", deliveryAddress: "", deliveryPhone: "", deliveryFee: "", customerNote: "", tableNumber: "",
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
      if (hasInventory && newInvoice.products.length > 0) {
        for (const item of newInvoice.products) {
          const ref = doc(db, "inventory", item.productId);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const cur = snap.data().quantity || 0;
            const delta = isTrader ? stockDelta(item.unit || getProductUnit(snap.data()), item.quantity, item.weight) : parseFloat(item.quantity) || 0;
            if (delta > 0 && cur - delta < 0) { alert(t("in.qtyOver")); setSubmitting(false); return; }
            if (delta > 0) await updateDoc(ref, { quantity: cur - delta });
          }
        }
      }
      const totalAmount = getTotalAmount;
      const invoiceData = {
        clientId: newInvoice.clientId,
        products: newInvoice.products.map((item) => ({ productId: item.productId, quantity: item.quantity, amount: item.amount, paidAmount: item.paidAmount || 0, weight: item.weight || "", unit: item.unit || "" })),
        status: isRestaurant ? "pending" : newInvoice.status,
        orderStatus: isRestaurant ? newInvoice.orderStatus || "new" : "",
        description: newInvoice.description || "", dueDate: newInvoice.dueDate || null,
        orderType: isRestaurant ? newInvoice.orderType : "", orderSource: isRestaurant ? (newInvoice.orderSource || "direct") : "", source: isRestaurant ? (newInvoice.orderSource || "direct") : "",
        deliveryAddress: isRestaurant && newInvoice.orderType === "delivery" ? newInvoice.deliveryAddress || "" : "",
        deliveryPhone: isRestaurant ? newInvoice.deliveryPhone || "" : "",
        deliveryFee: isRestaurant && newInvoice.orderType === "delivery" ? parseFloat(newInvoice.deliveryFee) || 0 : 0,
        tableNumber: isRestaurant && newInvoice.orderType === "dine_in" ? newInvoice.tableNumber || "" : "",
        customerNote: isRestaurant ? newInvoice.customerNote || "" : "",
        companyId: userCompanyId, createdBy: currentUser?.uid, amount: totalAmount,
        quantity: hasInventory ? newInvoice.products.reduce((s, it) => s + (isTrader ? stockDelta(it.unit || "piece", it.quantity, it.weight) : parseFloat(it.quantity || 0)), 0) : 0,
        date: new Date().toISOString(), createdAt: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, "invoices"), invoiceData);
      await logActivity({ actionType: "CREATE", collectionName: "invoices", itemId: docRef.id, details: `Created ${isRestaurant ? "order" : "invoice"} for client ${newInvoice.clientId}, total ${totalAmount}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      setNewInvoice({ ...emptyInvoice });
      await Promise.all([resetPagination(), fetchProducts()]);
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
    setSubmitting(false);
  }

  async function updateInvoice(e) {
    e.preventDefault();
    try {
      const totalAmount = editingInvoice.products?.length > 0 ? getEditTotalAmount : parseFloat(editingInvoice.amount) || 0;
      await updateDoc(doc(db, "invoices", editingInvoice.id), {
        clientId: editingInvoice.clientId, amount: totalAmount, status: editingInvoice.status, orderStatus: editingInvoice.orderStatus || "", description: editingInvoice.description || "", dueDate: editingInvoice.dueDate || null,
        orderType: editingInvoice.orderType || "", deliveryAddress: editingInvoice.orderType === "delivery" ? editingInvoice.deliveryAddress || "" : "", deliveryPhone: editingInvoice.deliveryPhone || "" , deliveryFee: editingInvoice.orderType === "delivery" ? parseFloat(editingInvoice.deliveryFee) || 0 : 0,
        tableNumber: editingInvoice.orderType === "dine_in" ? editingInvoice.tableNumber || "" : "",
        customerNote: editingInvoice.customerNote || "",
        products: editingInvoice.products.map((it) => ({ productId: it.productId, quantity: it.quantity, amount: it.amount, paidAmount: it.paidAmount || 0, weight: it.weight || "", unit: it.unit || "" })),
      });
      await logActivity({ actionType: "UPDATE", collectionName: "invoices", itemId: editingInvoice.id, details: `Updated invoice, status: ${editingInvoice.status}, orderStatus: ${editingInvoice.orderStatus}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await resetPagination(); setShowEditModal(false);
    } catch (err) { console.error(err); }
  }

  async function deleteInvoice(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "invoices", id));
      await logActivity({ actionType: "DELETE", collectionName: "invoices", itemId: id, details: "Deleted invoice", user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await resetPagination();
    } catch (err) { console.error(err); }
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
    const lines = (returningInvoice.products || []).map((p) => {
      const rq = parseFloat(returnQtys[returningInvoice.products.indexOf(p)]) || 0; // idx based
      // fix index mapping - use entries
      return { productId: p.productId, quantity: rq, weight: p.weight || "", unit: p.unit || "", amount: (parseFloat(p.amount) || 0) * (rq / (parseFloat(p.quantity) || 1)) };
    });
    // correct lines with proper idx
    const correctLines = (returningInvoice.products || []).map((p, idx) => {
      const rq = parseFloat(returnQtys[idx]) || 0; const oq = parseFloat(p.quantity) || 0; const ratio = oq > 0 ? Math.min(rq, oq) / oq : 0;
      return { productId: p.productId, quantity: Math.min(rq, oq), weight: p.weight || "", unit: p.unit || "", amount: (parseFloat(p.amount) || 0) * ratio };
    }).filter((l) => l.quantity > 0);
    if (correctLines.length === 0) { alert("حدد كمية مرتجع أكبر من صفر"); return; }
    setReturning(true);
    try {
      const clientName = clients.find((c) => c.id === returningInvoice.clientId)?.name || "";
      await createReturn({ kind: "sale", refId: returningInvoice.id, entityId: returningInvoice.clientId, entityName: clientName, lines: correctLines, reason: returnReason, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId }, isTrader });
      setShowReturnModal(false); setReturningInvoice(null); setReturnQtys({}); setReturnReason("");
      await Promise.all([resetPagination(), fetchProducts()]); alert("تم تسجيل المرتجع ورد المخزون");
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
    setReturning(false);
  }

  function handleThermalPrint(invoice) {
    const clientName = clients.find((c) => c.id === invoice.clientId)?.name || "زبون";
    const html = buildThermalPrintHTML({ invoice, clientName, products, isTrader, getProductUnit, isKgUnit, t });
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
        <div className="header"><div><h1><i className="fas fa-file-invoice" style={{ color: "#f59e0b", marginLeft: 10 }}></i>{isRestaurant ? "🧾 الطلبات" : t("in.title")}</h1><p className="subtitle">{isRestaurant ? "تسجيل ومتابعة طلبات المطعم" : t("in.subtitle")}</p></div></div>
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

        <InvoiceTable
          filteredInvoices={filteredInvoices} clients={clients} products={products}
          loading={loading} loadingMore={loadingMore} hasMore={hasMore} loadMore={loadMore} resetPagination={resetPagination}
          searchTerm={searchTerm} setSearchTerm={setSearchTerm} filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          onOrderStatusChange={handleOrderStatusChange}
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
