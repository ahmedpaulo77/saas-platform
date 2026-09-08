// src/pages/Invoices.js - مع Server-side Pagination ودعم المجالات الخدمية (عيادات/عملاء)
// + تحسينات المطعم: Order Status Flow كامل + تيك أواي/ديليفري بس (بدون صالة) + طباعة حرارية
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { exportInvoicePDF } from "../utils/pdfExport";
import { useLanguage } from "../i18n/LanguageContext";
import { getAvailableModules } from "../utils/modules";
import { logActivity } from "../utils/auditLogger";
import AutocompleteInput from "../components/common/AutocompleteInput";
import Pagination from "../components/common/PaginationV2";
import { useFirestorePagination } from "../hooks/useFirestorePagination";

const PAGE_SIZE = 25;

// ── Order Status config للمطعم ──
const ORDER_STATUSES = [
  { value: "new",       label: "🆕 جديد",          color: "#2563eb", bg: "#eff6ff" },
  { value: "preparing", label: "👨‍🍳 قيد التحضير",  color: "#d97706", bg: "#fffbeb" },
  { value: "ready",     label: "✅ جاهز",           color: "#16a34a", bg: "#f0fdf4" },
  { value: "delivered", label: "🛵 تم التسليم",     color: "#7c3aed", bg: "#f5f3ff" },
  { value: "cancelled", label: "❌ ملغي",           color: "#dc2626", bg: "#fef2f2" },
];

// أنواع الطلبات - ديليفري وتيك أواي بس
const ORDER_TYPES = [
  { value: "takeaway", label: "🥡 تيك أواي" },
  { value: "delivery", label: "🛵 توصيل" },
];

function getOrderStatusConfig(val) {
  return ORDER_STATUSES.find((s) => s.value === val) || ORDER_STATUSES[0];
}

// ── زر التقدم في الحالة ──
function OrderStatusBadge({ status, orderId, onStatusChange, isRestaurant }) {
  if (!isRestaurant) return null;
  const cfg = getOrderStatusConfig(status);
  const currentIdx = ORDER_STATUSES.findIndex((s) => s.value === status);
  const nextStatus = currentIdx < ORDER_STATUSES.length - 2 ? ORDER_STATUSES[currentIdx + 1] : null; // نتجاوز "ملغي"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <span style={{
        background: cfg.bg, color: cfg.color,
        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
        whiteSpace: "nowrap",
      }}>
        {cfg.label}
      </span>
      {nextStatus && status !== "delivered" && (
        <button
          onClick={() => onStatusChange(orderId, nextStatus.value)}
          style={{
            background: nextStatus.bg, color: nextStatus.color,
            border: `1px solid ${nextStatus.color}40`,
            borderRadius: 8, padding: "2px 8px", fontSize: 10,
            cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
          }}
        >
          ← {nextStatus.label}
        </button>
      )}
    </div>
  );
}

export default function Invoices() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const hasInventory = getAvailableModules(userIndustry, userRole).has("inventory");
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const isClinic = userIndustry === "clinic";
  const isRestaurant = userIndustry === "restaurant";

  const entityCollection = isClinic ? "patients" : "clients";
  const entityLabel = isClinic ? (t("in.patient") || "المريض") : "العميل";
  const entityLabelReq = isClinic ? (t("in.patientReq") || `${entityLabel} *`) : (t("in.clientReq") || `${entityLabel} *`);
  const chooseEntityPlaceholder = isClinic ? (t("in.choosePatient") || "اختر المريض") : (t("in.chooseClient") || "اختر العميل");
  const entityColumnLabel = isClinic ? (t("in.patientColumn") || entityLabel) : (t("in.client") || entityLabel);
  const productLabel = isClinic ? (t("in.medicine") || "الدواء") : (t("in.productOpt") || "منتج (اختياري)");
  const chooseProductPlaceholder = isClinic ? (t("in.chooseMedicine") || "اختر الدواء") : (t("in.chooseProduct") || "اختر المنتج");

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  const emptyInvoice = {
    clientId: "",
    products: [],
    status: isRestaurant ? "new" : "pending",
    orderStatus: isRestaurant ? "new" : "",
    description: "",
    dueDate: "",
    orderType: "takeaway",
    deliveryAddress: "",
    deliveryPhone: "",
    deliveryFee: "",
    customerNote: "",
  };

  const [newInvoice, setNewInvoice] = useState(emptyInvoice);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // الدفعات الجزئية
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);

  // إضافة عميل جديد سريع
  const [showQuickAddClient, setShowQuickAddClient] = useState(false);
  const [quickClientName, setQuickClientName] = useState("");
  const [quickClientPhone, setQuickClientPhone] = useState("");
  const [quickClientEmail, setQuickClientEmail] = useState("");
  const [quickClientGov, setQuickClientGov] = useState("");
  const [addingClient, setAddingClient] = useState(false);

  const calculateProductAmount = (productId, quantity) => {
    const product = products.find((p) => p.id === productId);
    if (product && quantity > 0) return (parseFloat(product.price) || 0) * quantity;
    return 0;
  };

  const getTotalAmount = useMemo(() =>
    newInvoice.products.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    [newInvoice.products]
  );

  const getEditTotalAmount = useMemo(() => {
    if (!editingInvoice?.products) return 0;
    return editingInvoice.products.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }, [editingInvoice]);

  const filters = useMemo(() => {
    const f = [];
    if (filterStatus !== "all") f.push(["status", "==", filterStatus]);
    return f;
  }, [filterStatus]);

  const { data: invoices, loading, loadingMore, hasMore, error, loadMore, reset: resetPagination } =
    useFirestorePagination("invoices", userRole, userCompanyId, currentUser?.uid, {
      pageSize: PAGE_SIZE,
      orderByField: "createdAt",
      orderDirection: "desc",
      filters,
      enabled: !!userCompanyId,
    });

  const fetchClients = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(getScopedQuery(entityCollection, userRole, userCompanyId, currentUser?.uid));
      setClients(snap.docs.map((d) => ({ id: d.id, name: d.data().name, phone: d.data().phone || "" })));
    } catch (e) { console.error(e); }
  }, [userRole, userCompanyId, currentUser?.uid, entityCollection]);

  const fetchProducts = useCallback(async () => {
    if (!userCompanyId || !hasInventory) return;
    try {
      const snap = await getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  }, [userRole, userCompanyId, currentUser?.uid, hasInventory]);

  async function handleQuickAddClient() {
    if (!quickClientName.trim()) { alert(t("common.fillRequired")); return; }
    setAddingClient(true);
    try {
      const docRef = await addDoc(collection(db, entityCollection), {
        name: quickClientName.trim(), phone: quickClientPhone.trim() || "",
        email: quickClientEmail.trim() || "", governorate: quickClientGov || "",
        companyId: userCompanyId, createdBy: currentUser?.uid, createdAt: new Date().toISOString(),
      });
      await fetchClients();
      setNewInvoice((prev) => ({ ...prev, clientId: docRef.id }));
      setQuickClientName(""); setQuickClientPhone(""); setQuickClientEmail(""); setQuickClientGov("");
      setShowQuickAddClient(false);
    } catch (e) { console.error(e); alert(t("common.errorGeneric")); }
    setAddingClient(false);
  }

  useEffect(() => { fetchClients(); fetchProducts(); }, [fetchClients, fetchProducts]);
  useEffect(() => { resetPagination(); }, [filterStatus, resetPagination]);

  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter((inv) => {
      const clientName = clients.find((c) => c.id === inv.clientId)?.name || "";
      const productNames = inv.products?.map((p) => products.find((pr) => pr.id === p.productId)?.name || "") || [];
      return (
        clientName.toLowerCase().includes(term) ||
        productNames.some((name) => name.toLowerCase().includes(term)) ||
        String(inv.amount).includes(term) ||
        (inv.description || "").toLowerCase().includes(term) ||
        (inv.deliveryAddress || "").toLowerCase().includes(term)
      );
    });
  }, [invoices, searchTerm, clients, products]);

  // ── تغيير حالة الأوردر مباشرة من الجدول ──
  async function handleOrderStatusChange(invoiceId, newOrderStatus) {
    try {
      const updateData = { orderStatus: newOrderStatus };
      // لو تم التسليم أو تيك أواي جاهز → نعتبره مدفوع
      if (newOrderStatus === "delivered") {
        updateData.status = "paid";
      }
      await updateDoc(doc(db, "invoices", invoiceId), updateData);
      await logActivity({
        actionType: "UPDATE", collectionName: "invoices", itemId: invoiceId,
        details: `Order status changed to ${newOrderStatus}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await resetPagination();
    } catch (e) { console.error(e); }
  }

  async function addInvoice(e) {
    e.preventDefault();
    if (!newInvoice.clientId || newInvoice.products.length === 0) return;
    setSubmitting(true);
    try {
      if (hasInventory && newInvoice.products.length > 0) {
        for (const item of newInvoice.products) {
          const productRef = doc(db, "inventory", item.productId);
          const productDoc = await getDoc(productRef);
          if (productDoc.exists()) {
            const currentQty = productDoc.data().quantity || 0;
            const qty = parseFloat(item.quantity) || 0;
            if (qty > 0 && currentQty - qty < 0) { alert(t("in.qtyOver")); setSubmitting(false); return; }
            if (qty > 0) await updateDoc(productRef, { quantity: currentQty - qty });
          }
        }
      }
      const totalAmount = getTotalAmount;
      const invoiceData = {
        clientId: newInvoice.clientId,
        products: newInvoice.products.map((item) => ({
          productId: item.productId, quantity: item.quantity,
          amount: item.amount, paidAmount: item.paidAmount || 0,
        })),
        status: isRestaurant ? "pending" : newInvoice.status,
        orderStatus: isRestaurant ? (newInvoice.orderStatus || "new") : "",
        description: newInvoice.description || "",
        dueDate: newInvoice.dueDate || null,
        // حقول المطعم
        orderType: isRestaurant ? newInvoice.orderType : "",
        deliveryAddress: isRestaurant && newInvoice.orderType === "delivery" ? (newInvoice.deliveryAddress || "") : "",
        deliveryPhone: isRestaurant && newInvoice.orderType === "delivery" ? (newInvoice.deliveryPhone || "") : "",
        deliveryFee: isRestaurant && newInvoice.orderType === "delivery" ? (parseFloat(newInvoice.deliveryFee) || 0) : 0,
        customerNote: isRestaurant ? (newInvoice.customerNote || "") : "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        amount: totalAmount,
        quantity: hasInventory ? newInvoice.products.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0) : 0,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, "invoices"), invoiceData);
      await logActivity({
        actionType: "CREATE", collectionName: "invoices", itemId: docRef.id,
        details: `Created ${isRestaurant ? "order" : "invoice"} for client ${newInvoice.clientId}, total ${totalAmount}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewInvoice({ ...emptyInvoice });
      await Promise.all([resetPagination(), fetchProducts()]);
    } catch (e) { console.error(e); alert(t("common.errorGeneric")); }
    setSubmitting(false);
  }

  async function updateInvoice(e) {
    e.preventDefault();
    try {
      const totalAmount = editingInvoice.products?.length > 0
        ? getEditTotalAmount : parseFloat(editingInvoice.amount) || 0;
      await updateDoc(doc(db, "invoices", editingInvoice.id), {
        clientId: editingInvoice.clientId,
        amount: totalAmount,
        status: editingInvoice.status,
        orderStatus: editingInvoice.orderStatus || "",
        description: editingInvoice.description || "",
        dueDate: editingInvoice.dueDate || null,
        orderType: editingInvoice.orderType || "",
        deliveryAddress: editingInvoice.orderType === "delivery" ? (editingInvoice.deliveryAddress || "") : "",
        deliveryPhone: editingInvoice.orderType === "delivery" ? (editingInvoice.deliveryPhone || "") : "",
        deliveryFee: editingInvoice.orderType === "delivery" ? (parseFloat(editingInvoice.deliveryFee) || 0) : 0,
        customerNote: editingInvoice.customerNote || "",
        products: editingInvoice.products.map((item) => ({
          productId: item.productId, quantity: item.quantity,
          amount: item.amount, paidAmount: item.paidAmount || 0,
        })),
      });
      await logActivity({
        actionType: "UPDATE", collectionName: "invoices", itemId: editingInvoice.id,
        details: `Updated invoice, status: ${editingInvoice.status}, orderStatus: ${editingInvoice.orderStatus}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await resetPagination();
      setShowEditModal(false);
    } catch (e) { console.error(e); }
  }

  async function deleteInvoice(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "invoices", id));
      await logActivity({
        actionType: "DELETE", collectionName: "invoices", itemId: id,
        details: "Deleted invoice",
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await resetPagination();
    } catch (e) { console.error(e); }
  }

  async function recordPayment(e) {
    e.preventDefault();
    if (!payingInvoice) return;
    const amount = parseFloat(payAmount) || 0;
    const currentPaid = parseFloat(payingInvoice.paidAmount) || 0;
    const total = parseFloat(payingInvoice.amount) || 0;
    const newPaid = currentPaid + amount;
    if (amount <= 0) { alert(t("in.badAmount")); return; }
    if (newPaid > total) { alert(t("in.payOver", { paid: newPaid, total })); return; }
    setPaying(true);
    try {
      const isFullyPaid = newPaid >= total;
      await updateDoc(doc(db, "invoices", payingInvoice.id), {
        paidAmount: newPaid,
        status: isFullyPaid ? "paid" : payingInvoice.status,
      });
      await logActivity({
        actionType: "UPDATE", collectionName: "invoices", itemId: payingInvoice.id,
        details: `Recorded payment of ${amount}, new total paid ${newPaid}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await resetPagination();
      setShowPayModal(false); setPayAmount(""); setPayingInvoice(null);
      alert(isFullyPaid ? t("in.payFull") : t("in.payOk"));
    } catch (err) { console.error(err); alert(t("in.payFail")); }
    setPaying(false);
  }

  // ── طباعة فاتورة حرارية ──
  function handleThermalPrint(invoice) {
    const clientName = clients.find((c) => c.id === invoice.clientId)?.name || "زبون";
    const orderTypeCfg = ORDER_TYPES.find((o) => o.value === invoice.orderType);
    const orderTypeLabel = orderTypeCfg ? orderTypeCfg.label : invoice.orderType || "";
    const itemsRows = (invoice.products || []).map((p) => {
      const product = products.find((pr) => pr.id === p.productId);
      const name = product ? product.name : "صنف";
      const price = parseFloat(p.amount) || 0;
      const qty = parseFloat(p.quantity) || 1;
      const unit = (price / qty).toFixed(2);
      return `<tr>
        <td style="padding:3px 6px;border-bottom:1px dashed #ccc;">${name}</td>
        <td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;">${qty}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;">${unit}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;font-weight:bold;">${price.toFixed(2)}</td>
      </tr>`;
    }).join("");

    const deliveryInfo = invoice.orderType === "delivery" ? `
      <div style="margin:6px 0;font-size:12px;">
        <strong>📍 العنوان:</strong> ${invoice.deliveryAddress || "—"}<br/>
        ${invoice.deliveryPhone ? `<strong>📞 هاتف:</strong> ${invoice.deliveryPhone}` : ""}
        ${invoice.deliveryFee > 0 ? `<br/><strong>🛵 رسوم التوصيل:</strong> ${invoice.deliveryFee} ج.م` : ""}
      </div>` : "";

    const totalWithFee = (parseFloat(invoice.amount) || 0) + (parseFloat(invoice.deliveryFee) || 0);

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
  .total-row { font-weight: bold; font-size: 14px; }
  @media print {
    body { width: 80mm; }
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>
<h2>🍗 فاتورة المطعم</h2>
<div class="center" style="font-size:11px;color:#666;">${new Date().toLocaleString("ar-EG")}</div>
<div class="divider"></div>
<div style="font-size:12px;margin-bottom:4px;">
  <strong>الزبون:</strong> ${clientName}<br/>
  <strong>نوع الطلب:</strong> ${orderTypeLabel}
</div>
${deliveryInfo}
${invoice.customerNote ? `<div style="font-size:11px;color:#555;margin:4px 0;"><strong>ملاحظة:</strong> ${invoice.customerNote}</div>` : ""}
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
  <div>المجموع: ${(parseFloat(invoice.amount) || 0).toFixed(2)} ج.م</div>
  ${invoice.deliveryFee > 0 ? `<div>رسوم التوصيل: ${invoice.deliveryFee} ج.م</div>` : ""}
  <div class="total-row" style="margin-top:4px;font-size:15px;border-top:2px solid #000;padding-top:4px;">
    الإجمالي: ${totalWithFee.toFixed(2)} ج.م
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

  function handleExportPDF(invoice) {
    const clientName = clients.find((c) => c.id === invoice.clientId)?.name || t("common.unspecified");
    const productNames = invoice.products?.map((p) => products.find((pr) => pr.id === p.productId)?.name || t("common.unspecified")) || [];
    exportInvoicePDF(invoice, clientName, productNames.join(", "));
  }

  const userCanDelete = canDelete(userRole);

  // ── Stats ──
  const totalRevenue = filteredInvoices.reduce((sum, inv) => {
    if (inv.status === "paid") return sum + (parseFloat(inv.amount) || 0);
    return sum + (parseFloat(inv.paidAmount) || 0);
  }, 0);
  const paidCount = filteredInvoices.filter((i) => i.status === "paid").length;
  const pendingCount = filteredInvoices.filter((i) => i.status === "pending").length;
  const newOrdersCount = isRestaurant ? filteredInvoices.filter((i) => i.orderStatus === "new").length : 0;
  const preparingCount = isRestaurant ? filteredInvoices.filter((i) => i.orderStatus === "preparing").length : 0;
  const totalOverdue = filteredInvoices.reduce((sum, inv) => {
    if (inv.status === "overdue") {
      return sum + ((parseFloat(inv.amount) || 0) - (parseFloat(inv.paidAmount) || 0));
    }
    return sum;
  }, 0);

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="loading"><div className="spinner"></div>{t("common.loading")}</div>
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
              <i className="fas fa-file-invoice" style={{ color: isRestaurant ? "#f59e0b" : "#f59e0b", marginLeft: 10 }}></i>
              {isRestaurant ? "🧾 الطلبات" : t("in.title")}
            </h1>
            <p className="subtitle">{isRestaurant ? "تسجيل ومتابعة طلبات المطعم" : t("in.subtitle")}</p>
          </div>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
            <i className="fas fa-exclamation-circle"></i> {error.message || t("common.errorGeneric")}
          </div>
        )}

        {/* Stats */}
        {isAdmin ? (
          <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
            <div className="stat-card amber">
              <div className="stat-icon"><i className="fas fa-file-invoice"></i></div>
              <div className="stat-value">{filteredInvoices.length}</div>
              <div className="stat-label">{isRestaurant ? "إجمالي الطلبات" : t("in.statTotal")}</div>
            </div>
            {isRestaurant ? (
              <>
                <div className="stat-card indigo">
                  <div className="stat-icon"><i className="fas fa-bell"></i></div>
                  <div className="stat-value">{newOrdersCount}</div>
                  <div className="stat-label">طلبات جديدة</div>
                </div>
                <div className="stat-card amber">
                  <div className="stat-icon"><i className="fas fa-fire"></i></div>
                  <div className="stat-value">{preparingCount}</div>
                  <div className="stat-label">قيد التحضير</div>
                </div>
              </>
            ) : (
              <>
                <div className="stat-card green">
                  <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
                  <div className="stat-value">{paidCount}</div>
                  <div className="stat-label">{t("in.statPaid")}</div>
                </div>
                <div className="stat-card indigo">
                  <div className="stat-icon"><i className="fas fa-clock"></i></div>
                  <div className="stat-value">{pendingCount}</div>
                  <div className="stat-label">{t("in.statPending")}</div>
                </div>
              </>
            )}
            <div className="stat-card cyan">
              <div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div>
              <div className="stat-value" style={{ fontSize: 18 }}>{totalRevenue.toLocaleString()}</div>
              <div className="stat-label">{t("in.statRevenue")}</div>
            </div>
            {!isRestaurant && (
              <div className="stat-card red">
                <div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div>
                <div className="stat-value" style={{ fontSize: 18 }}>{totalOverdue.toLocaleString()}</div>
                <div className="stat-label">{t("in.statOverdueAmount")}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "24px 20px", marginBottom: 24 }}>
            <i className="fas fa-lock" style={{ fontSize: 24, color: "#94a3b8", marginBottom: 8 }}></i>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>{t("in.statsAdminOnly")}</p>
          </div>
        )}

        {/* ── Add Form ── */}
        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#6366f1" }}></i>
            {isRestaurant ? "🛒 طلب جديد" : t("in.add")}
          </h3>
          <form onSubmit={addInvoice}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* العميل */}
              <div className="form-group">
                <label>{isRestaurant ? "الزبون *" : entityLabelReq}</label>
                <AutocompleteInput
                  items={clients.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone ? `📞 ${c.phone}` : "" }))}
                  value={newInvoice.clientId}
                  onChange={(id) => setNewInvoice({ ...newInvoice, clientId: id })}
                  placeholder={isRestaurant ? "اختر الزبون أو أضف جديد" : chooseEntityPlaceholder}
                  required
                />
                <button type="button" onClick={() => setShowQuickAddClient(!showQuickAddClient)}
                  style={{ marginTop: 6, background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
                  {showQuickAddClient ? "✕ إلغاء" : `+ إضافة ${isRestaurant ? "زبون" : entityLabel} جديد`}
                </button>
                {showQuickAddClient && (
                  <div style={{ marginTop: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <input type="text" placeholder={`الاسم *`} value={quickClientName} onChange={(e) => setQuickClientName(e.target.value)} />
                    <input type="text" placeholder="الهاتف (اختياري)" value={quickClientPhone} onChange={(e) => setQuickClientPhone(e.target.value)} />
                    <input type="email" placeholder="البريد الإلكتروني (اختياري)" value={quickClientEmail} onChange={(e) => setQuickClientEmail(e.target.value)} />
                    {!isRestaurant && (
                      <select value={quickClientGov} onChange={(e) => setQuickClientGov(e.target.value)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                        <option value="">-- اختر المحافظة --</option>
                        {["القاهرة","الإسكندرية","الجيزة","الشرقية","الدقهلية","البحيرة","الفيوم","الغربية","المنوفية"].map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    )}
                    <button type="button" className="btn-primary btn-sm" onClick={handleQuickAddClient} disabled={addingClient}>
                      {addingClient ? "جاري الحفظ..." : `حفظ ${isRestaurant ? "الزبون" : entityLabel}`}
                    </button>
                  </div>
                )}
              </div>

              {/* المنتجات */}
              {hasInventory && (
                <div className="form-group">
                  <label>{isRestaurant ? "🍽️ أصناف الطلب *" : productLabel}</label>
                  <AutocompleteInput
                    items={products.map((p) => ({
                      id: p.id, label: p.name,
                      sublabel: `${t("currency")} ${p.price || 0} — متاح: ${p.quantity || 0}`,
                    }))}
                    value={newInvoice.products.length > 0 ? newInvoice.products[newInvoice.products.length - 1].productId : ""}
                    onChange={(productId) => {
                      if (newInvoice.products.some((p) => p.productId === productId)) return;
                      setNewInvoice({ ...newInvoice, products: [...newInvoice.products, { productId, quantity: "1", amount: calculateProductAmount(productId, 1).toString() }] });
                    }}
                    placeholder={isRestaurant ? "ابحث واختر صنف من المنيو..." : chooseProductPlaceholder}
                  />
                </div>
              )}

              {/* قائمة المنتجات المختارة */}
              {newInvoice.products.length > 0 && (
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#334155" }}>
                    {isRestaurant ? "أصناف الطلب" : t("in.selectedProducts")} ({newInvoice.products.length})
                  </h4>
                  <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                    {newInvoice.products.map((item, idx) => {
                      const product = products.find((p) => p.id === item.productId);
                      const productName = product ? product.name : "—";
                      return (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" }}>
                          <span style={{ flex: 1, fontSize: 13, color: "#475569" }}>{productName}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="number" min="0.001" step="0.001" value={item.quantity}
                              onChange={(e) => {
                                const qty = e.target.value;
                                const numQty = parseFloat(qty);
                                const amount = !isNaN(numQty) && numQty > 0 ? calculateProductAmount(item.productId, numQty).toString() : "";
                                setNewInvoice({ ...newInvoice, products: newInvoice.products.map((p, i) => i === idx ? { ...p, quantity: qty, amount } : p) });
                              }}
                              style={{ width: 60, padding: "4px 6px", fontSize: 12, borderRadius: 6, border: "1px solid #cbd5e1", textAlign: "center" }}
                            />
                            <span style={{ fontSize: 12, color: "#6366f1", minWidth: 60 }}>
                              {(parseFloat(item.amount) || 0).toLocaleString()} {t("currency")}
                            </span>
                            <button type="button" onClick={() => setNewInvoice({ ...newInvoice, products: newInvoice.products.filter((_, i) => i !== idx) })}
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontWeight: 700, color: "#1e293b" }}>
                    <span>الإجمالي:</span>
                    <span>{getTotalAmount.toLocaleString()} {t("currency")}</span>
                  </div>
                </div>
              )}

              {/* المبلغ */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("in.amountReq")}</label>
                <input type="number" step="0.01" placeholder="0.00"
                  value={getTotalAmount || ""}
                  readOnly={newInvoice.products.length > 0}
                  onChange={(e) => { if (newInvoice.products.length === 0) setNewInvoice({ ...newInvoice, amount: e.target.value }); }}
                  required
                />
              </div>

              {/* ── حقول المطعم ── */}
              {isRestaurant && (
                <>
                  {/* نوع الطلب */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>نوع الطلب</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      {ORDER_TYPES.map((ot) => (
                        <button
                          key={ot.value} type="button"
                          onClick={() => setNewInvoice({ ...newInvoice, orderType: ot.value })}
                          style={{
                            flex: 1, padding: "10px 16px", fontSize: 14, fontWeight: 700,
                            border: `2px solid ${newInvoice.orderType === ot.value ? "#f59e0b" : "#e2e8f0"}`,
                            borderRadius: 10, background: newInvoice.orderType === ot.value ? "#fffbeb" : "white",
                            color: newInvoice.orderType === ot.value ? "#d97706" : "#64748b",
                            cursor: "pointer", transition: "all 0.2s",
                          }}
                        >
                          {ot.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* حقول الديليفري */}
                  {newInvoice.orderType === "delivery" && (
                    <>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>📍 عنوان التوصيل *</label>
                        <input type="text" placeholder="اكتب العنوان بالتفصيل"
                          value={newInvoice.deliveryAddress}
                          onChange={(e) => setNewInvoice({ ...newInvoice, deliveryAddress: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>📞 رقم هاتف التوصيل</label>
                        <input type="tel" placeholder="رقم الهاتف"
                          value={newInvoice.deliveryPhone}
                          onChange={(e) => setNewInvoice({ ...newInvoice, deliveryPhone: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>🛵 رسوم التوصيل ({t("currency")})</label>
                        <input type="number" step="0.5" min="0" placeholder="0"
                          value={newInvoice.deliveryFee}
                          onChange={(e) => setNewInvoice({ ...newInvoice, deliveryFee: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  {/* ملاحظة الزبون */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>📝 ملاحظة الزبون (اختياري)</label>
                    <input type="text" placeholder="مثال: بدون بصل، صوص على الجانب..."
                      value={newInvoice.customerNote}
                      onChange={(e) => setNewInvoice({ ...newInvoice, customerNote: e.target.value })}
                    />
                  </div>

                  {/* حالة الأوردر */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>حالة الطلب</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {ORDER_STATUSES.filter((s) => s.value !== "cancelled").map((s) => (
                        <button key={s.value} type="button"
                          onClick={() => setNewInvoice({ ...newInvoice, orderStatus: s.value })}
                          style={{
                            padding: "6px 12px", fontSize: 12, fontWeight: 700, borderRadius: 20,
                            border: `2px solid ${(newInvoice.orderStatus || "new") === s.value ? s.color : "#e2e8f0"}`,
                            background: (newInvoice.orderStatus || "new") === s.value ? s.bg : "white",
                            color: (newInvoice.orderStatus || "new") === s.value ? s.color : "#94a3b8",
                            cursor: "pointer",
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* الحالة للفواتير العادية */}
              {!isRestaurant && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t("common.status")}</label>
                  <select value={newInvoice.status} onChange={(e) => setNewInvoice({ ...newInvoice, status: e.target.value })}>
                    <option value="pending">{t("in.statusWait")}</option>
                    <option value="paid">{t("in.statusPaid")}</option>
                    <option value="overdue">{t("in.statusOver")}</option>
                  </select>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("common.description")}</label>
                <input type="text" placeholder={t("in.notesPh")} value={newInvoice.description}
                  onChange={(e) => setNewInvoice({ ...newInvoice, description: e.target.value })} />
              </div>

              {!isRestaurant && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t("in.due")}</label>
                  <input type="date" value={newInvoice.dueDate}
                    onChange={(e) => setNewInvoice({ ...newInvoice, dueDate: e.target.value })} />
                </div>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? <><i className="fas fa-spinner fa-spin"></i> {t("common.adding")}</> : <><i className="fas fa-plus"></i> {isRestaurant ? "تسجيل الطلب" : t("in.add")}</>}
              </button>
            </div>
          </form>
        </div>

        {/* ── Filter Bar ── */}
        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input type="text" placeholder={isRestaurant ? "ابحث عن طلب..." : t("in.search")}
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {isRestaurant ? (
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">كل الحالات</option>
              {ORDER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              <option value="paid">✅ مدفوع</option>
            </select>
          ) : (
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">{t("in.allStatus")}</option>
              <option value="paid">{t("in.statusPaid")}</option>
              <option value="pending">{t("in.statusWait")}</option>
              <option value="overdue">{t("in.statusOver")}</option>
            </select>
          )}
        </div>

        {/* ── Table ── */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {isRestaurant ? "قائمة الطلبات" : t("in.list")}</h3>
            <span className="table-count">{filteredInvoices.length} {isRestaurant ? "طلب" : t("in.invoices")}</span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filteredInvoices} loading={loading} loadingMore={loadingMore}
              hasMore={hasMore} onLoadMore={loadMore} onRefresh={resetPagination} pageSize={PAGE_SIZE}
              empty={
                <div className="table-empty">
                  <i className="fas fa-file-invoice"></i>
                  <p>{searchTerm || filterStatus !== "all" ? t("common.noResults") : isRestaurant ? "لا توجد طلبات بعد" : t("in.empty")}</p>
                </div>
              }
              render={(pageItems) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{isRestaurant ? "الزبون" : entityColumnLabel}</th>
                      {isRestaurant && <th>نوع الطلب</th>}
                      {isRestaurant && <th>حالة الطلب</th>}
                      {hasInventory && <th>{isClinic ? t("in.medicineColumn") || "الدواء" : isRestaurant ? "الأصناف" : t("in.product") || "المنتج"}</th>}
                      {hasInventory && <th>{t("common.quantity")}</th>}
                      <th>{t("common.amount")}</th>
                      {isRestaurant && <th>الإجمالي مع التوصيل</th>}
                      {!isRestaurant && <th>{t("in.paid")}</th>}
                      {!isRestaurant && <th>{t("in.remaining")}</th>}
                      {!isRestaurant && <th>{t("common.status")}</th>}
                      <th>{t("common.date")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((inv, i) => {
                      const clientName = clients.find((c) => c.id === inv.clientId)?.name || t("common.unspecified");
                      const productDetails = inv.products?.map((p) => {
                        const pr = products.find((item) => item.id === p.productId);
                        return `${pr ? pr.name : t("common.unspecified")} (${p.quantity || 1})`;
                      }) || [];
                      const productStr = productDetails.length > 0 ? productDetails.join(" ، ") : "-";
                      const paid = parseFloat(inv.paidAmount) || 0;
                      const remaining = (parseFloat(inv.amount) || 0) - paid;
                      const totalQty = inv.products ? inv.products.reduce((sum, p) => sum + parseFloat(p.quantity || 0), 0) : 0;
                      const totalWithFee = (parseFloat(inv.amount) || 0) + (parseFloat(inv.deliveryFee) || 0);
                      const orderTypeCfg = ORDER_TYPES.find((o) => o.value === inv.orderType);

                      return (
                        <tr key={inv.id}>
                          <td style={{ color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>
                            {clientName}
                            {isRestaurant && inv.customerNote && (
                              <div style={{ fontSize: 11, color: "#94a3b8" }} title={inv.customerNote}>
                                📝 {inv.customerNote.slice(0, 25)}{inv.customerNote.length > 25 ? "..." : ""}
                              </div>
                            )}
                          </td>
                          {isRestaurant && (
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontWeight: 600 }}>{orderTypeCfg?.label || inv.orderType || "—"}</span>
                                {inv.orderType === "delivery" && inv.deliveryAddress && (
                                  <span style={{ fontSize: 11, color: "#64748b" }} title={inv.deliveryAddress}>
                                    📍 {inv.deliveryAddress.slice(0, 20)}{inv.deliveryAddress.length > 20 ? "..." : ""}
                                  </span>
                                )}
                                {inv.orderType === "delivery" && inv.deliveryPhone && (
                                  <span style={{ fontSize: 11, color: "#64748b" }}>📞 {inv.deliveryPhone}</span>
                                )}
                              </div>
                            </td>
                          )}
                          {isRestaurant && (
                            <td>
                              <OrderStatusBadge
                                status={inv.orderStatus || "new"}
                                orderId={inv.id}
                                onStatusChange={handleOrderStatusChange}
                                isRestaurant={isRestaurant}
                              />
                            </td>
                          )}
                          {hasInventory && <td style={{ fontSize: 13 }}>{productStr}</td>}
                          {hasInventory && <td>{totalQty}</td>}
                          <td style={{ fontWeight: 700 }}>{(inv.amount || 0).toLocaleString()} {t("currency")}</td>
                          {isRestaurant && (
                            <td style={{ fontWeight: 700, color: "#059669" }}>
                              {totalWithFee.toFixed(2)} {t("currency")}
                              {inv.deliveryFee > 0 && <div style={{ fontSize: 10, color: "#94a3b8" }}>+{inv.deliveryFee} توصيل</div>}
                            </td>
                          )}
                          {!isRestaurant && (
                            <>
                              <td style={{ color: "#10b981", fontWeight: 600 }}>{paid > 0 ? `${paid.toLocaleString()} ${t("currency")}` : "—"}</td>
                              <td style={{ fontWeight: 700, color: remaining > 0 ? "#ef4444" : "#10b981" }}>
                                {remaining > 0 ? `${remaining.toLocaleString()} ${t("currency")}` : "✓"}
                              </td>
                              <td>
                                <span className={`badge ${inv.status === "paid" ? "badge-paid" : inv.status === "pending" ? "badge-pending" : "badge-overdue"}`}>
                                  {inv.status === "paid" ? t("in.statusPaid") : inv.status === "pending" ? t("in.statusWait") : t("in.statusOver")}
                                </span>
                              </td>
                            </>
                          )}
                          <td style={{ color: "#64748b", fontSize: 13 }}>{inv.date ? new Date(inv.date).toLocaleDateString("ar-EG") : "-"}</td>
                          <td>
                            <div className="table-actions">
                              {/* طباعة حرارية للمطعم */}
                              {isRestaurant && (
                                <button onClick={() => handleThermalPrint(inv)} className="btn-primary btn-sm" title="طباعة فاتورة">
                                  <i className="fas fa-print"></i>
                                </button>
                              )}
                              {!isRestaurant && (
                                <button onClick={() => handleExportPDF(inv)} className="btn-primary btn-sm" title={t("in.pdf")}>
                                  <i className="fas fa-file-pdf"></i> PDF
                                </button>
                              )}
                              {inv.status !== "paid" && !isRestaurant && (
                                <button onClick={() => { setPayingInvoice(inv); setPayAmount(""); setShowPayModal(true); }}
                                  className="btn-success btn-sm" title={t("in.pay")}>
                                  <i className="fas fa-money-bill-wave"></i>
                                </button>
                              )}
                              <button onClick={() => { setEditingInvoice({ ...inv }); setShowEditModal(true); }}
                                className="btn-secondary btn-sm" title={t("common.edit")}>
                                <i className="fas fa-edit"></i>
                              </button>
                              {userCanDelete && (
                                <button onClick={() => deleteInvoice(inv.id)} className="btn-danger btn-sm" title={t("common.delete")}>
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

        {/* ── Edit Modal ── */}
        {showEditModal && editingInvoice && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-edit" style={{ color: "#6366f1" }}></i> {isRestaurant ? "تعديل الطلب" : t("common.edit")}</h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
              </div>
              <form onSubmit={updateInvoice}>
                <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>

                  <div className="form-group">
                    <label>{isRestaurant ? "الزبون" : entityColumnLabel}</label>
                    <AutocompleteInput
                      items={clients.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone ? `📞 ${c.phone}` : "" }))}
                      value={editingInvoice.clientId}
                      onChange={(id) => setEditingInvoice({ ...editingInvoice, clientId: id })}
                      placeholder={isRestaurant ? "اختر الزبون" : chooseEntityPlaceholder}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>{t("common.amount")}</label>
                    <input type="number" step="0.01"
                      value={editingInvoice.products?.length > 0 ? getEditTotalAmount : editingInvoice.amount}
                      onChange={(e) => setEditingInvoice({ ...editingInvoice, amount: e.target.value })}
                      readOnly={editingInvoice.products?.length > 0} required
                    />
                  </div>

                  {/* حالة الأوردر للمطعم */}
                  {isRestaurant && (
                    <>
                      <div className="form-group">
                        <label>حالة الطلب</label>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {ORDER_STATUSES.map((s) => (
                            <button key={s.value} type="button"
                              onClick={() => setEditingInvoice({ ...editingInvoice, orderStatus: s.value })}
                              style={{
                                padding: "6px 12px", fontSize: 12, fontWeight: 700, borderRadius: 20,
                                border: `2px solid ${(editingInvoice.orderStatus || "new") === s.value ? s.color : "#e2e8f0"}`,
                                background: (editingInvoice.orderStatus || "new") === s.value ? s.bg : "white",
                                color: (editingInvoice.orderStatus || "new") === s.value ? s.color : "#94a3b8",
                                cursor: "pointer",
                              }}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="form-group">
                        <label>نوع الطلب</label>
                        <div style={{ display: "flex", gap: 10 }}>
                          {ORDER_TYPES.map((ot) => (
                            <button key={ot.value} type="button"
                              onClick={() => setEditingInvoice({ ...editingInvoice, orderType: ot.value })}
                              style={{
                                flex: 1, padding: "8px", fontSize: 13, fontWeight: 700,
                                border: `2px solid ${(editingInvoice.orderType || "takeaway") === ot.value ? "#f59e0b" : "#e2e8f0"}`,
                                borderRadius: 10, background: (editingInvoice.orderType || "takeaway") === ot.value ? "#fffbeb" : "white",
                                color: (editingInvoice.orderType || "takeaway") === ot.value ? "#d97706" : "#64748b",
                                cursor: "pointer",
                              }}
                            >
                              {ot.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {(editingInvoice.orderType || "takeaway") === "delivery" && (
                        <>
                          <div className="form-group">
                            <label>📍 عنوان التوصيل</label>
                            <input type="text" value={editingInvoice.deliveryAddress || ""}
                              onChange={(e) => setEditingInvoice({ ...editingInvoice, deliveryAddress: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label>📞 هاتف التوصيل</label>
                            <input type="tel" value={editingInvoice.deliveryPhone || ""}
                              onChange={(e) => setEditingInvoice({ ...editingInvoice, deliveryPhone: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label>🛵 رسوم التوصيل</label>
                            <input type="number" step="0.5" min="0" value={editingInvoice.deliveryFee || ""}
                              onChange={(e) => setEditingInvoice({ ...editingInvoice, deliveryFee: e.target.value })} />
                          </div>
                        </>
                      )}
                      <div className="form-group">
                        <label>📝 ملاحظة الزبون</label>
                        <input type="text" value={editingInvoice.customerNote || ""}
                          onChange={(e) => setEditingInvoice({ ...editingInvoice, customerNote: e.target.value })} />
                      </div>
                    </>
                  )}

                  {!isRestaurant && (
                    <div className="form-group">
                      <label>{t("common.status")}</label>
                      <select value={editingInvoice.status} onChange={(e) => setEditingInvoice({ ...editingInvoice, status: e.target.value })}>
                        <option value="pending">{t("in.statusWait")}</option>
                        <option value="paid">{t("in.statusPaid")}</option>
                        <option value="overdue">{t("in.statusOver")}</option>
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label>{t("common.description")}</label>
                    <input type="text" value={editingInvoice.description || ""}
                      onChange={(e) => setEditingInvoice({ ...editingInvoice, description: e.target.value })} />
                  </div>
                  {!isRestaurant && (
                    <div className="form-group">
                      <label>{t("in.due")}</label>
                      <input type="date" value={editingInvoice.dueDate || ""}
                        onChange={(e) => setEditingInvoice({ ...editingInvoice, dueDate: e.target.value })} />
                    </div>
                  )}

                  {/* منتجات في التعديل */}
                  {hasInventory && editingInvoice.products && (
                    <div style={{ marginTop: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "#1e293b", fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                        <span>{isRestaurant ? "أصناف الطلب" : (t("in.currentProducts") || "المنتجات الحالية")}</span>
                        <span style={{ color: "#6366f1" }}>({editingInvoice.products.length})</span>
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                        {editingInvoice.products.map((item, idx) => {
                          const product = products.find((p) => p.id === item.productId);
                          const productName = product ? product.name : "منتج غير محدد";
                          return (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", gap: 8 }}>
                              <span style={{ fontSize: 13, color: "#334155", fontWeight: 600, flex: 1 }}>{productName}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 12, color: "#64748b" }}>الكمية:</span>
                                <input type="number" min="1" value={item.quantity}
                                  onChange={(e) => {
                                    const newQty = parseFloat(e.target.value) || 1;
                                    const unitPrice = product ? parseFloat(product.price) || 0 : 0;
                                    setEditingInvoice({ ...editingInvoice, products: editingInvoice.products.map((p, i) => i === idx ? { ...p, quantity: newQty, amount: (unitPrice * newQty).toString() } : p) });
                                  }}
                                  style={{ width: "60px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1", textAlign: "center" }}
                                />
                              </div>
                              <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700, minWidth: "70px", textAlign: "left" }}>
                                {(parseFloat(item.amount) || 0).toLocaleString()} {t("currency")}
                              </span>
                              <button type="button" onClick={() => setEditingInvoice({ ...editingInvoice, products: editingInvoice.products.filter((_, i) => i !== idx) })}
                                style={{ background: "#fee2e2", border: "none", color: "#ef4444", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>✕</button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>
                          + {isRestaurant ? "إضافة صنف" : (t("in.addProduct") || "إضافة منتج جديد")}
                        </label>
                        <AutocompleteInput
                          items={products.map((p) => ({ id: p.id, label: p.name, sublabel: `${t("currency")} ${p.price || 0}` }))}
                          value=""
                          onChange={(productId) => {
                            if (!productId || editingInvoice.products?.some((p) => p.productId === productId)) return;
                            setEditingInvoice({ ...editingInvoice, products: [...(editingInvoice.products || []), { productId, quantity: 1, amount: calculateProductAmount(productId, 1).toString() }] });
                          }}
                          placeholder={isRestaurant ? "اختر صنف من المنيو..." : (t("in.chooseProduct") || "اختر المنتج...")}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>{t("common.cancel")}</button>
                  <button type="submit" className="btn-primary"><i className="fas fa-save"></i> {t("common.save")}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Pay Modal ── */}
        {showPayModal && payingInvoice && (
          <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-money-bill-wave" style={{ color: "#10b981" }}></i> {t("in.pay")}</h3>
                <button className="modal-close" onClick={() => setShowPayModal(false)}>×</button>
              </div>
              <form onSubmit={recordPayment}>
                <div className="modal-body">
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: "#64748b", fontSize: 13 }}>{t("in.invoiceVal")}</span>
                      <span style={{ fontWeight: 800 }}>{(payingInvoice.amount || 0).toLocaleString()} {t("currency")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: "#64748b", fontSize: 13 }}>{t("in.prevPaid")}</span>
                      <span style={{ fontWeight: 700, color: "#10b981" }}>{(parseFloat(payingInvoice.paidAmount) || 0).toLocaleString()} {t("currency")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b", fontSize: 13 }}>{t("in.remaining")}</span>
                      <span style={{ fontWeight: 900, color: "#ef4444" }}>
                        {((parseFloat(payingInvoice.amount) || 0) - (parseFloat(payingInvoice.paidAmount) || 0)).toLocaleString()} {t("currency")}
                      </span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t("in.payAmount")}</label>
                    <input type="number" step="0.01" min="0.01" placeholder="0.00"
                      value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required autoFocus />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowPayModal(false)}>{t("common.cancel")}</button>
                  <button type="submit" className="btn-primary" disabled={paying}>
                    {paying ? <><i className="fas fa-spinner fa-spin"></i> {t("in.recording")}</> : <><i className="fas fa-check"></i> {t("in.confirmPay")}</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
