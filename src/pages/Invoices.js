// src/pages/Invoices.js - مع Server-side Pagination ودعم المجالات الخدمية (عيادات/عملاء)
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

export default function Invoices() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const hasInventory = getAvailableModules(userIndustry, userRole).has(
    "inventory",
  );
  const isAdmin = userRole === "admin" || userRole === "super_admin";

    const isClinic = userIndustry === 'clinic';
  const isRestaurant = userIndustry === 'restaurant';

  // ✅ أنواع الطلبات للمطاعم
  const orderTypes = [
    { value: 'dinein', label: '🍽️ صالة' },
    { value: 'takeaway', label: '🥡 تيك أواي' },
    { value: 'delivery', label: '🛵 توصيل' },
  ];
  const entityCollection = isClinic ? "patients" : "clients";
  const entityLabel = isClinic
    ? t("in.patient") || "المريض"
    : "العميل";
      const entityLabelReq = isClinic
    ? t("in.patientReq") || `${entityLabel} *`
    : t("in.clientReq") || `${entityLabel} *`;
  const chooseEntityPlaceholder = isClinic
    ? t("in.choosePatient") || "اختر المريض"
    : t("in.chooseClient") || "اختر العميل";
  const entityColumnLabel = isClinic
    ? t("in.patientColumn") || entityLabel
    : t("in.client") || entityLabel;

  const productLabel = isClinic
    ? t("in.medicine") || "الدواء"
    : t("in.productOpt") || "منتج (اختياري)";
  const chooseProductPlaceholder = isClinic
    ? t("in.chooseMedicine") || "اختر الدواء"
    : t("in.chooseProduct") || "اختر المنتج";

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [submitting, setSubmitting] = useState(false);

    const [newInvoice, setNewInvoice] = useState({
    clientId: "",
    products: [], // Array of { productId, quantity, amount }
    status: "pending",
    description: "",
    dueDate: "",
    orderType: "dinein",
    deliveryAddress: "",
  });

  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // الدفعات الجزئية
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);

  // إضافة عميل/مريض جديد
  const [showQuickAddClient, setShowQuickAddClient] = useState(false);
  const [quickClientName, setQuickClientName] = useState("");
  const [quickClientPhone, setQuickClientPhone] = useState("");
  const [quickClientEmail, setQuickClientEmail] = useState("");
  const [quickClientGov, setQuickClientGov] = useState("");
  const [addingClient, setAddingClient] = useState(false);

  const calculateProductAmount = (productId, quantity) => {
    const product = products.find((p) => p.id === productId);
    if (product && quantity > 0) {
      const price = parseFloat(product.price) || 0;
      return price * quantity;
    }
    return 0;
  };

  const getTotalAmount = useMemo(() => {
    return newInvoice.products.reduce(
      (sum, item) => sum + (parseFloat(item.amount) || 0),
      0,
    );
  }, [newInvoice.products]);

  const getEditTotalAmount = useMemo(() => {
    if (!editingInvoice || !editingInvoice.products) return 0;
    return editingInvoice.products.reduce(
      (sum, item) => sum + (parseFloat(item.amount) || 0),
      0,
    );
  }, [editingInvoice]);

  const filters = useMemo(() => {
    const f = [];
    if (filterStatus !== "all") {
      f.push(["status", "==", filterStatus]);
    }
    return f;
  }, [filterStatus]);

  const {
    data: invoices,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset: resetPagination,
  } = useFirestorePagination(
    "invoices",
    userRole,
    userCompanyId,
    currentUser?.uid,
    {
      pageSize: PAGE_SIZE,
      orderByField: "createdAt",
      orderDirection: "desc",
      filters,
      enabled: !!userCompanyId,
    },
  );

  const fetchClients = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        getScopedQuery(
          entityCollection,
          userRole,
          userCompanyId,
          currentUser?.uid,
        ),
      );
      setClients(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          phone: d.data().phone || "",
        })),
      );
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid, entityCollection]);

  const fetchProducts = useCallback(async () => {
    if (!userCompanyId || !hasInventory) return;
    try {
      const snap = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid),
      );
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid, hasInventory]);

  async function handleQuickAddClient() {
    if (!quickClientName.trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    setAddingClient(true);
    try {
      const docRef = await addDoc(collection(db, entityCollection), {
        name: quickClientName.trim(),
        phone: quickClientPhone.trim() || "",
        email: quickClientEmail.trim() || "",
        governorate: quickClientGov || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await fetchClients();
      setNewInvoice((prev) => ({ ...prev, clientId: docRef.id }));
      setQuickClientName("");
      setQuickClientPhone("");
      setQuickClientEmail("");
      setQuickClientGov("");
      setShowQuickAddClient(false);
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
    setAddingClient(false);
  }

  useEffect(() => {
    fetchClients();
    fetchProducts();
  }, [fetchClients, fetchProducts]);

  useEffect(() => {
    resetPagination();
  }, [filterStatus, resetPagination]);

  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter((inv) => {
      const clientName = clients.find((c) => c.id === inv.clientId)?.name || "";
      const productNames =
        inv.products?.map(
          (p) => products.find((pr) => pr.id === p.productId)?.name || "",
        ) || [];
      return (
        clientName.toLowerCase().includes(term) ||
        productNames.some((name) => name.toLowerCase().includes(term)) ||
        String(inv.amount).includes(term) ||
        (inv.description || "").toLowerCase().includes(term)
      );
    });
  }, [invoices, searchTerm, clients, products]);

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
            if (qty > 0 && currentQty - qty < 0) {
              alert(t("in.qtyOver"));
              setSubmitting(false);
              return;
            }
            if (qty > 0) {
              await updateDoc(productRef, { quantity: currentQty - qty });
            }
          }
        }
      }

      const totalAmount = getTotalAmount;
      const invoiceData = {
        ...newInvoice,
        orderType: isRestaurant ? newInvoice.orderType : "",
        deliveryAddress: isRestaurant && newInvoice.orderType === 'delivery' ? newInvoice.deliveryAddress : "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        amount: totalAmount,
        quantity: hasInventory
          ? newInvoice.products.reduce(
              (sum, item) => sum + parseFloat(item.quantity || 0),
              0,
            )
          : 0,
        date: new Date().toISOString(),
        dueDate: newInvoice.dueDate || null,
        createdAt: new Date().toISOString(),
        products: newInvoice.products.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          amount: item.amount,
          paidAmount: item.paidAmount || 0,
        })),
      };

      const docRef = await addDoc(collection(db, "invoices"), invoiceData);

      await logActivity({
        actionType: "CREATE",
        collectionName: "invoices",
        itemId: docRef.id,
        details: `Created invoice for client ${newInvoice.clientId} with ${newInvoice.products.length} product(s), total amount ${totalAmount}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      setNewInvoice({
        clientId: "",
        products: [],
        status: "pending",
        description: "",
        dueDate: "",
        orderType: "dinein",
        deliveryAddress: "",
      });
      await Promise.all([resetPagination(), fetchProducts()]);
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
    setSubmitting(false);
  }

  async function updateInvoice(e) {
    e.preventDefault();
    try {
      const totalAmount =
        editingInvoice.products && editingInvoice.products.length > 0
          ? getEditTotalAmount
          : parseFloat(editingInvoice.amount) || 0;
      await updateDoc(doc(db, "invoices", editingInvoice.id), {
        clientId: editingInvoice.clientId,
        amount: totalAmount,
        status: editingInvoice.status,
        description: editingInvoice.description || "",
        dueDate: editingInvoice.dueDate || null,
        products: editingInvoice.products.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          amount: item.amount,
          paidAmount: item.paidAmount || 0,
        })),
      });

      await logActivity({
        actionType: "UPDATE",
        collectionName: "invoices",
        itemId: editingInvoice.id,
        details: `Updated invoice amount to ${totalAmount}, status to ${editingInvoice.status}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      await resetPagination();
      setShowEditModal(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteInvoice(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "invoices", id));

      await logActivity({
        actionType: "DELETE",
        collectionName: "invoices",
        itemId: id,
        details: `Deleted invoice`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      await resetPagination();
    } catch (e) {
      console.error(e);
    }
  }

  async function recordPayment(e) {
    e.preventDefault();
    if (!payingInvoice) return;
    const amount = parseFloat(payAmount) || 0;
    const currentPaid = parseFloat(payingInvoice.paidAmount) || 0;
    const total = parseFloat(payingInvoice.amount) || 0;
    const newPaid = currentPaid + amount;

    if (amount <= 0) {
      alert(t("in.badAmount"));
      return;
    }
    if (newPaid > total) {
      alert(t("in.payOver", { paid: newPaid, total: total }));
      return;
    }

    setPaying(true);
    try {
      const isFullyPaid = newPaid >= total;
      await updateDoc(doc(db, "invoices", payingInvoice.id), {
        paidAmount: newPaid,
        status: isFullyPaid ? "paid" : payingInvoice.status,
      });

      await logActivity({
        actionType: "UPDATE",
        collectionName: "invoices",
        itemId: payingInvoice.id,
        details: `Recorded payment of ${amount}, new paid total ${newPaid}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      await resetPagination();
      setShowPayModal(false);
      setPayAmount("");
      setPayingInvoice(null);
      alert(isFullyPaid ? t("in.payFull") : t("in.payOk"));
    } catch (err) {
      console.error(err);
      alert(t("in.payFail"));
    }
    setPaying(false);
  }

  function handleExportPDF(invoice) {
    const clientName =
      clients.find((c) => c.id === invoice.clientId)?.name ||
      t("common.unspecified");
    const productNames =
      invoice.products?.map(
        (p) =>
          products.find((pr) => pr.id === p.productId)?.name ||
          t("common.unspecified"),
      ) || [];
    const productNameStr = productNames.join(", ");
    exportInvoicePDF(invoice, clientName, productNameStr);
  }

  const userCanDelete = canDelete(userRole);

  const totalRevenue = filteredInvoices.reduce((sum, inv) => {
    if (inv.status === "paid") {
      return sum + (parseFloat(inv.amount) || 0);
    }
    return sum + (parseFloat(inv.paidAmount) || 0);
  }, 0);

  const paidCount = filteredInvoices.filter((i) => i.status === "paid").length;
  const pendingCount = filteredInvoices.filter(
    (i) => i.status === "pending",
  ).length;
  const totalOverdue = filteredInvoices.reduce((sum, inv) => {
    if (inv.status === "overdue") {
      const total = parseFloat(inv.amount) || 0;
      const paid = parseFloat(inv.paidAmount) || 0;
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
              <i
                className="fas fa-file-invoice"
                style={{ color: "#f59e0b", marginLeft: 10 }}
              ></i>
              {t("in.title")}
            </h1>
            <p className="subtitle">{t("in.subtitle")}</p>
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

        {isAdmin ? (
          <div
            className="stats-row"
            style={{
              gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))",
            }}
          >
            <div className="stat-card amber">
              <div className="stat-icon">
                <i className="fas fa-file-invoice"></i>
              </div>
              <div className="stat-value">{filteredInvoices.length}</div>
              <div className="stat-label">{t("in.statTotal")}</div>
            </div>
            <div className="stat-card green">
              <div className="stat-icon">
                <i className="fas fa-check-circle"></i>
              </div>
              <div className="stat-value">{paidCount}</div>
              <div className="stat-label">{t("in.statPaid")}</div>
            </div>
            <div className="stat-card indigo">
              <div className="stat-icon">
                <i className="fas fa-clock"></i>
              </div>
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">{t("in.statPending")}</div>
            </div>
            <div className="stat-card cyan">
              <div className="stat-icon">
                <i className="fas fa-money-bill-wave"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {totalRevenue.toLocaleString()}
              </div>
              <div className="stat-label">{t("in.statRevenue")}</div>
            </div>
            <div className="stat-card red">
              <div className="stat-icon">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {totalOverdue.toLocaleString()}
              </div>
              <div className="stat-label">{t("in.statOverdueAmount")}</div>
            </div>
          </div>
        ) : (
          <div
            className="card"
            style={{
              textAlign: "center",
              padding: "24px 20px",
              marginBottom: 24,
            }}
          >
            <i
              className="fas fa-lock"
              style={{ fontSize: 24, color: "#94a3b8", marginBottom: 8 }}
            ></i>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
              {t("in.statsAdminOnly")}
            </p>
          </div>
        )}

        {/* Add Form */}
        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#6366f1" }}></i>
            {t("in.add")}
          </h3>
          <form onSubmit={addInvoice}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div className="form-group">
                <label>{entityLabelReq}</label>
                <AutocompleteInput
                  items={clients.map((c) => ({
                    id: c.id,
                    label: c.name,
                    sublabel: c.phone ? `📞 ${c.phone}` : "",
                  }))}
                  value={newInvoice.clientId}
                  onChange={(id) =>
                    setNewInvoice({ ...newInvoice, clientId: id })
                  }
                  placeholder={chooseEntityPlaceholder}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowQuickAddClient(!showQuickAddClient)}
                  style={{
                    marginTop: 6,
                    background: "none",
                    border: "none",
                    color: "#6366f1",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  {showQuickAddClient
                    ? "✕ إلغاء"
                    : `+ إضافة ${entityLabel} جديد`}
                </button>

                {showQuickAddClient && (
                  <div
                    style={{
                      marginTop: 8,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <input
                      type="text"
                      placeholder={`اسم ${entityLabel} *`}
                      value={quickClientName}
                      onChange={(e) => setQuickClientName(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="الهاتف (اختياري)"
                      value={quickClientPhone}
                      onChange={(e) => setQuickClientPhone(e.target.value)}
                    />
                    <input
                      type="email"
                      placeholder={`${t("common.email") || "البريد الإلكتروني"} (اختياري)`}
                      value={quickClientEmail}
                      onChange={(e) => setQuickClientEmail(e.target.value)}
                    />
                    <select
                      value={quickClientGov}
                      onChange={(e) => setQuickClientGov(e.target.value)}
                      style={{
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <option value="">
                        {t("common.selectGovernorate") || "-- اختر المحافظة --"}
                      </option>
                      <option value="القاهرة">القاهرة</option>
                      <option value="الإسكندرية">الإسكندرية</option>
                      <option value="الجيزة">الجيزة</option>
                      <option value="الشرقية">الشرقية</option>
                      <option value="الدقهلية">الدقهلية</option>
                      <option value="البحيرة">البحيرة</option>
                      <option value="الفيوم">الفيوم</option>
                      <option value="الغربية">الغربية</option>
                      <option value="المنوفية">المنوفية</option>
                    </select>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={handleQuickAddClient}
                      disabled={addingClient}
                    >
                      {addingClient
                        ? "جاري الحفظ..."
                        : `${t("common.save") || "حفظ"} ${entityLabel}`}
                    </button>
                  </div>
                )}
              </div>
              {hasInventory && (
                <div className="form-group">
                  <label>{productLabel}</label>
                  <AutocompleteInput
                    items={products.map((p) => ({
                      id: p.id,
                      label: p.name,
                      sublabel: `${t("currency")} ${p.price || 0} — ${p.quantity || 0} ${t("in.remaining")}`,
                    }))}
                    value={
                      newInvoice.products.length > 0
                        ? newInvoice.products[newInvoice.products.length - 1]
                            .productId
                        : ""
                    }
                    onChange={(productId) => {
                      const alreadySelected = newInvoice.products.some(
                        (p) => p.productId === productId,
                      );
                      if (alreadySelected) return;
                      const newProduct = {
                        productId,
                        quantity: "1",
                        amount: calculateProductAmount(productId, 1).toString(),
                      };
                      setNewInvoice({
                        ...newInvoice,
                        products: [...newInvoice.products, newProduct],
                      });
                    }}
                    placeholder={chooseProductPlaceholder}
                  />
                </div>
              )}
              {newInvoice.products.length > 0 && (
                <div
                  style={{
                    marginBottom: 12,
                    background: "#f8fafc",
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 8px",
                      fontSize: 13,
                      color: "#334155",
                    }}
                  >
                    {t("in.selectedProducts")} ({newInvoice.products.length})
                  </h4>
                  <div style={{ maxHeight: "120px", overflowY: "auto" }}>
                    {newInvoice.products.map((item, idx) => {
                      const product = products.find(
                        (p) => p.id === item.productId,
                      );
                      const productName = product ? product.name : "Unknown";
                      const total = parseFloat(item.amount) || 0;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 6,
                            paddingBottom: 6,
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          <span
                            style={{ flex: 1, fontSize: 13, color: "#475569" }}
                          >
                            {productName}
                            {item.quantity !== "1" && ` × ${item.quantity}`}
                          </span>
                          <span style={{ fontSize: 13, color: "#6366f1" }}>
                            {total.toLocaleString()} {t("currency")}
                            <button
                              onClick={() => {
                                const newProducts = newInvoice.products.filter(
                                  (_, i) => i !== idx,
                                );
                                setNewInvoice({
                                  ...newInvoice,
                                  products: newProducts,
                                });
                              }}
                              style={{
                                marginLeft: "8px",
                                background: "none",
                                border: "none",
                                color: "#ef4444",
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        </div>
                      );
                    })}
                    {newInvoice.products.length > 0 && (
                      <button
                        onClick={() =>
                          setNewInvoice({ ...newInvoice, products: [] })
                        }
                        style={{
                          marginTop: 4,
                          background: "none",
                          border: "none",
                          color: "#64748b",
                          cursor: "pointer",
                          fontSize: 12,
                          padding: 0,
                        }}
                      >
                        {t("common.clearAll")}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {newInvoice.products.length > 0 && hasInventory && (
                <div
                  className="form-group"
                  style={{ marginBottom: 0, marginTop: 8 }}
                >
                  <label>{t("in.qtyReq")}</label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={
                      newInvoice.products[newInvoice.products.length - 1]
                        ?.quantity || ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const quantity = raw === "" ? "" : raw;
                      const numQty = parseFloat(raw);
                      const productId =
                        newInvoice.products[newInvoice.products.length - 1]
                          .productId;
                      const amount =
                        !isNaN(numQty) && numQty > 0
                          ? calculateProductAmount(productId, numQty).toString()
                          : "";
                      setNewInvoice({
                        ...newInvoice,
                        products: newInvoice.products.map((item, i) =>
                          i === newInvoice.products.length - 1
                            ? { ...item, quantity: quantity, amount: amount }
                            : item,
                        ),
                      });
                    }}
                    style={{ MozAppearance: "textfield" }}
                  />
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("in.amountReq")}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={getTotalAmount.toString() || "0.00"}
                  onChange={(e) => {
                    setNewInvoice({
                      ...newInvoice,
                      ...(newInvoice.products.length > 0
                        ? {}
                        : { amount: e.target.value }),
                    });
                  }}
                  required
                />
              </div>
                           {isRestaurant && (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>نوع الطلب</label>
                    <select
                      value={newInvoice.orderType}
                      onChange={(e) =>
                        setNewInvoice({ ...newInvoice, orderType: e.target.value })
                      }
                    >
                      {orderTypes.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {newInvoice.orderType === 'delivery' && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>عنوان التوصيل</label>
                      <input
                        type="text"
                        placeholder="اكتب العنوان بالتفصيل"
                        value={newInvoice.deliveryAddress}
                        onChange={(e) =>
                          setNewInvoice({ ...newInvoice, deliveryAddress: e.target.value })
                        }
                      />
                    </div>
                  )}
                </>
              )}
                        {isRestaurant && (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>نوع الطلب</label>
                    <select
                      value={newInvoice.orderType}
                      onChange={(e) =>
                        setNewInvoice({ ...newInvoice, orderType: e.target.value })
                      }
                    >
                      {orderTypes.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {newInvoice.orderType === 'delivery' && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>عنوان التوصيل</label>
                      <input
                        type="text"
                        placeholder="اكتب العنوان بالتفصيل"
                        value={newInvoice.deliveryAddress}
                        onChange={(e) =>
                          setNewInvoice({ ...newInvoice, deliveryAddress: e.target.value })
                        }
                      />
                    </div>
                  )}
                </>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("common.status")}</label>
                <select
                  value={newInvoice.status}
                  onChange={(e) =>
                    setNewInvoice({ ...newInvoice, status: e.target.value })
                  }
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
                  placeholder={t("in.notesPh")}
                  value={newInvoice.description}
                  onChange={(e) =>
                    setNewInvoice({
                      ...newInvoice,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("in.due")}</label>
                <input
                  type="date"
                  value={newInvoice.dueDate}
                  onChange={(e) =>
                    setNewInvoice({ ...newInvoice, dueDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>{" "}
                    {t("common.adding")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus"></i> {t("in.add")}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("in.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">{t("in.allStatus")}</option>
            <option value="paid">{t("in.statusPaid")}</option>
            <option value="pending">{t("in.statusWait")}</option>
            <option value="overdue">{t("in.statusOver")}</option>
          </select>
        </div>

        {/* Table + Pagination */}
        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("in.list")}
            </h3>
            <span className="table-count">
              {filteredInvoices.length} {t("in.invoices")}
            </span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filteredInvoices}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onRefresh={resetPagination}
              pageSize={PAGE_SIZE}
              empty={
                <div className="table-empty">
                  <i className="fas fa-file-invoice"></i>
                  <p>
                    {searchTerm || filterStatus !== "all"
                      ? t("common.noResults")
                      : t("in.empty")}
                  </p>
                </div>
              }
              render={(pageItems) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{entityColumnLabel}</th>
                      {isRestaurant && <th>نوع الطلب</th>}
                      {hasInventory && (
                        <th>
                          {isClinic
                            ? t("in.medicineColumn") || "الدواء"
                            : t("in.product") || "المنتج"}
                        </th>
                      )}
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
                    {pageItems.map((inv, i) => {
                      const clientName =
                        clients.find((c) => c.id === inv.clientId)?.name ||
                        t("common.unspecified");
                      
                      // فصل أسماء المنتجات وإظهار كمية كل منتج بشكل واضح
                      const productDetails = inv.products?.map((p) => {
                        const pr = products.find((item) => item.id === p.productId);
                        const name = pr ? pr.name : t("common.unspecified");
                        const qty = p.quantity || 1;
                        return `${name} (${qty})`;
                      }) || [];

                      const productStr = productDetails.length > 0 ? productDetails.join(" ، ") : "-";
                      const paid = parseFloat(inv.paidAmount) || 0;
                      const remaining = (parseFloat(inv.amount) || 0) - paid;
                      const totalQuantity = inv.products
                        ? inv.products.reduce(
                            (sum, item) => sum + parseFloat(item.quantity || 0),
                            0,
                          )
                        : 0;

                      return (
                        <tr key={inv.id}>
                          <td
                            style={{
                              color: "var(--gray-400)",
                              fontWeight: 600,
                            }}
                          >
                            {i + 1}
                          </td>
                                                   <td style={{ fontWeight: 600 }}>{clientName}</td>
                          {isRestaurant && (
                            <td>
                              {orderTypes.find((o) => o.value === inv.orderType)?.label || "-"}
                            </td>
                          )}
                          {hasInventory && <td>{productStr}</td>}
                          {hasInventory && <td>{totalQuantity}</td>}
                          <td
                            style={{
                              fontWeight: 700,
                              color: "var(--gray-800)",
                            }}
                          >
                            {(inv.amount || 0).toLocaleString()} {t("currency")}
                          </td>
                          <td style={{ color: "#10b981", fontWeight: 600 }}>
                            {paid > 0
                              ? `${paid.toLocaleString()} ${t("currency")}`
                              : "—"}
                          </td>
                          <td
                            style={{
                              fontWeight: 700,
                              color: remaining > 0 ? "#ef4444" : "#10b981",
                            }}
                          >
                            {remaining > 0
                              ? `${remaining.toLocaleString()} ${t("currency")}`
                              : "✓"}
                          </td>
                          <td>
                            <span
                              className={`badge ${inv.status === "paid" ? "badge-paid" : inv.status === "pending" ? "badge-pending" : "badge-overdue"}`}
                            >
                              {inv.status === "paid"
                                ? t("in.statusPaid")
                                : inv.status === "pending"
                                  ? t("in.statusWait")
                                  : t("in.statusOver")}
                            </span>
                          </td>
                          <td
                            style={{ color: "var(--gray-500)", fontSize: 13 }}
                          >
                            {inv.date
                              ? new Date(inv.date).toLocaleDateString()
                              : "-"}
                          </td>
                          <td>
                            <div className="table-actions">
                              <button
                                onClick={() => handleExportPDF(inv)}
                                className="btn-primary btn-sm"
                                title={t("in.pdf")}
                              >
                                <i className="fas fa-file-pdf"></i> PDF
                              </button>
                              {inv.status !== "paid" && (
                                <button
                                  onClick={() => {
                                    setPayingInvoice(inv);
                                    setPayAmount("");
                                    setShowPayModal(true);
                                  }}
                                  className="btn-success btn-sm"
                                  title={t("in.pay")}
                                >
                                  <i className="fas fa-money-bill-wave"></i>
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingInvoice(inv);
                                  setShowEditModal(true);
                                }}
                                className="btn-secondary btn-sm"
                                title={t("common.edit")}
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              {userCanDelete && (
                                <button
                                  onClick={() => deleteInvoice(inv.id)}
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

        {/* Edit Modal */}
        {showEditModal && editingInvoice && (
          <>
            <div
              className="modal-overlay"
              onClick={() => setShowEditModal(false)}
            >
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>
                    <i className="fas fa-edit" style={{ color: "#6366f1" }}></i>{" "}
                    {t("common.edit")}
                  </h3>
                  <button
                    className="modal-close"
                    onClick={() => setShowEditModal(false)}
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={updateInvoice}>
                  <div
                    className="modal-body"
                    style={{ maxHeight: "70vh", overflowY: "auto" }}
                  >
                    <div className="form-group">
                      <label>{entityColumnLabel}</label>
                      <AutocompleteInput
                        items={clients.map((c) => ({
                          id: c.id,
                          label: c.name,
                          sublabel: c.phone ? `📞 ${c.phone}` : "",
                        }))}
                        value={editingInvoice.clientId}
                        onChange={(id) =>
                          setEditingInvoice({ ...editingInvoice, clientId: id })
                        }
                        placeholder={chooseEntityPlaceholder}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("common.amount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={
                          editingInvoice.products &&
                          editingInvoice.products.length > 0
                            ? getEditTotalAmount
                            : editingInvoice.amount
                        }
                        onChange={(e) =>
                          setEditingInvoice({
                            ...editingInvoice,
                            amount: e.target.value,
                          })
                        }
                        readOnly={
                          editingInvoice.products &&
                          editingInvoice.products.length > 0
                        }
                        required
                      />
                      {editingInvoice.products &&
                        editingInvoice.products.length > 0 && (
                          <small
                            style={{
                              color: "#64748b",
                              fontSize: 12,
                              marginTop: 4,
                              display: "block",
                            }}
                          >
                            المبلغ يحسب تلقائيًا من المنتجات المختارة بالأسفل
                          </small>
                        )}
                    </div>
                    <div className="form-group">
                      <label>{t("common.status")}</label>
                      <select
                        value={editingInvoice.status}
                        onChange={(e) =>
                          setEditingInvoice({
                            ...editingInvoice,
                            status: e.target.value,
                          })
                        }
                      >
                        <option value="pending">{t("in.statusWait")}</option>
                        <option value="paid">{t("in.statusPaid")}</option>
                        <option value="overdue">{t("in.statusOver")}</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>{t("common.description")}</label>
                      <input
                        type="text"
                        value={editingInvoice.description || ""}
                        onChange={(e) =>
                          setEditingInvoice({
                            ...editingInvoice,
                            description: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("in.due")}</label>
                      <input
                        type="date"
                        value={editingInvoice.dueDate || ""}
                        onChange={(e) =>
                          setEditingInvoice({
                            ...editingInvoice,
                            dueDate: e.target.value,
                          })
                        }
                      />
                    </div>

                    {/* قسم المنتجات بتعديل الكميات المباشر */}
                    {hasInventory && (
                      <div
                        style={{
                          marginTop: 16,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: 14,
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 10px",
                            fontSize: 14,
                            color: "#1e293b",
                            fontWeight: 700,
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>
                            {t("in.currentProducts") || "المنتجات الحالية"}
                          </span>
                          <span style={{ color: "#6366f1" }}>
                            ({editingInvoice.products?.length || 0})
                          </span>
                        </h4>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            marginBottom: 12,
                          }}
                        >
                          {editingInvoice.products &&
                            editingInvoice.products.map((item, idx) => {
                              const product = products.find(
                                (p) => p.id === item.productId,
                              );
                              const productName = product
                                ? product.name
                                : "منتج غير محدد";
                              const total = parseFloat(item.amount) || 0;

                              return (
                                <div
                                  key={idx}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    background: "#ffffff",
                                    padding: "8px 12px",
                                    borderRadius: 6,
                                    border: "1px solid #cbd5e1",
                                    gap: 8,
                                  }}
                                >
                                  <span style={{ fontSize: 13, color: "#334155", fontWeight: 600, flex: 1 }}>
                                    {productName}
                                  </span>

                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 12, color: "#64748b" }}>الكمية:</span>
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => {
                                        const newQty = parseFloat(e.target.value) || 1;
                                        const unitPrice = product ? parseFloat(product.price) || 0 : 0;
                                        const updatedProducts = [...editingInvoice.products];
                                        updatedProducts[idx] = {
                                          ...item,
                                          quantity: newQty,
                                          amount: (unitPrice * newQty).toString(),
                                        };
                                        setEditingInvoice({
                                          ...editingInvoice,
                                          products: updatedProducts,
                                        });
                                      }}
                                      style={{
                                        width: "60px",
                                        padding: "4px 6px",
                                        fontSize: "12px",
                                        borderRadius: "4px",
                                        border: "1px solid #cbd5e1",
                                        textAlign: "center",
                                      }}
                                    />
                                  </div>

                                  <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700, minWidth: "70px", textAlign: "left" }}>
                                    {total.toLocaleString()} {t("currency")}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newProducts = editingInvoice.products.filter(
                                        (_, i) => i !== idx,
                                      );
                                      setEditingInvoice({
                                        ...editingInvoice,
                                        products: newProducts,
                                      });
                                    }}
                                    style={{
                                      background: "#fee2e2",
                                      border: "none",
                                      color: "#ef4444",
                                      borderRadius: 4,
                                      padding: "4px 8px",
                                      cursor: "pointer",
                                      fontSize: 12,
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label
                            style={{
                              fontSize: 12,
                              color: "#475569",
                              fontWeight: 600,
                            }}
                          >
                            + {t("in.addProduct") || "إضافة منتج جديد"}
                          </label>
                          <AutocompleteInput
                            items={products.map((p) => ({
                              id: p.id,
                              label: p.name,
                              sublabel: `${t("currency")} ${p.price || 0}`,
                            }))}
                            value=""
                            onChange={(productId) => {
                              if (!productId) return;
                              const alreadySelected =
                                editingInvoice.products?.some(
                                  (p) => p.productId === productId,
                                );
                              if (alreadySelected) return;

                              const newProduct = {
                                productId,
                                quantity: 1,
                                amount: calculateProductAmount(
                                  productId,
                                  1,
                                ).toString(),
                              };
                              setEditingInvoice({
                                ...editingInvoice,
                                products: [
                                  ...(editingInvoice.products || []),
                                  newProduct,
                                ],
                              });
                            }}
                            placeholder={
                              t("in.chooseProduct") || "اختر المنتج لإضافته..."
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowEditModal(false)}
                    >
                      {t("common.cancel")}
                    </button>
                    <button type="submit" className="btn-primary">
                      <i className="fas fa-save"></i> {t("common.save")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Pay Modal */}
        {showPayModal && payingInvoice && (
          <>
            <div
              className="modal-overlay"
              onClick={() => setShowPayModal(false)}
            >
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>
                    <i
                      className="fas fa-money-bill-wave"
                      style={{ color: "#10b981" }}
                    ></i>{" "}
                    {t("in.pay")}
                  </h3>
                  <button
                    className="modal-close"
                    onClick={() => setShowPayModal(false)}
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={recordPayment}>
                  <div className="modal-body">
                    <div
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #86efac",
                        borderRadius: 10,
                        padding: "12px 16px",
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{ color: "var(--gray-500)", fontSize: 13 }}
                        >
                          {t("in.invoiceVal")}
                        </span>
                        <span style={{ fontWeight: 800 }}>
                          {(payingInvoice.amount || 0).toLocaleString()}{" "}
                          {t("currency")}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{ color: "var(--gray-500)", fontSize: 13 }}
                        >
                          {t("in.prevPaid")}
                        </span>
                        <span style={{ fontWeight: 700, color: "#10b981" }}>
                          {(
                            parseFloat(payingInvoice.paidAmount) || 0
                          ).toLocaleString()}{" "}
                          {t("currency")}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{ color: "var(--gray-500)", fontSize: 13 }}
                        >
                          {t("in.remaining")}
                        </span>
                        <span style={{ fontWeight: 900, color: "#ef4444" }}>
                          {(
                            (parseFloat(payingInvoice.amount) || 0) -
                            (parseFloat(payingInvoice.paidAmount) || 0)
                          ).toLocaleString()}{" "}
                          {t("currency")}
                        </span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>{t("in.payAmount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowPayModal(false)}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={paying}
                    >
                      {paying ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>{" "}
                          {t("in.recording")}
                        </>
                      ) : (
                        <>
                          <i className="fas fa-check"></i> {t("in.confirmPay")}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}