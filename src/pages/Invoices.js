// src/pages/Invoices.js - مع حساب تلقائي للسعر ودعم createdBy
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { exportInvoicePDF } from "../utils/pdfExport";
import { useLanguage } from "../i18n/LanguageContext";

export default function Invoices() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [newInvoice, setNewInvoice] = useState({
    clientId: "",
    productId: "",
    quantity: 1,
    amount: "",
    status: "pending",
    description: "",
    dueDate: "",
  });

  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // الدفعات الجزئية
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);

  // ✅ دالة لحساب المبلغ تلقائياً
  const calculateAmount = (productId, quantity) => {
    const product = products.find((p) => p.id === productId);
    if (product && quantity > 0) {
      const price = parseFloat(product.price) || 0;
      return price * quantity;
    }
    return 0;
  };

  const fetchInvoices = useCallback(async () => {
    // ✅ تأكد من وجود userCompanyId قبل جلب البيانات
    if (!userCompanyId) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    try {
      const snap = await getDocs(
        getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid)
      );
      const invoicesData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setInvoices(invoicesData);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchClients = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid)
      );
      setClients(snap.docs.map((d) => ({ id: d.id, name: d.data().name })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchProducts = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid)
      );
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    Promise.all([fetchInvoices(), fetchClients(), fetchProducts()]);
  }, [fetchInvoices, fetchClients, fetchProducts]);

  async function addInvoice(e) {
    e.preventDefault();
    if (!newInvoice.clientId || !newInvoice.amount || !newInvoice.productId)
      return;
    setSubmitting(true);
    try {
      const productRef = doc(db, "inventory", newInvoice.productId);
      const productDoc = await getDoc(productRef);
      if (productDoc.exists()) {
        const currentQty = productDoc.data().quantity || 0;
        const qty = parseInt(newInvoice.quantity) || 1;
        if (currentQty - qty < 0) {
          alert(t("in.qtyOver"));
          setSubmitting(false);
          return;
        }
        await updateDoc(productRef, { quantity: currentQty - qty });
      }

      const amount = parseFloat(newInvoice.amount) || 0;

      await addDoc(collection(db, "invoices"), {
        ...newInvoice,
        companyId: userCompanyId,
        createdBy: currentUser?.uid, // ✅ إضافة createdBy
        amount: amount,
        quantity: parseInt(newInvoice.quantity) || 1,
        date: new Date().toISOString(),
        dueDate: newInvoice.dueDate || null,
        createdAt: new Date().toISOString(),
      });

      setNewInvoice({
        clientId: "",
        productId: "",
        quantity: 1,
        amount: "",
        status: "pending",
        description: "",
        dueDate: "",
      });
      await Promise.all([fetchInvoices(), fetchProducts()]);
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
    setSubmitting(false);
  }

  async function updateInvoice(e) {
    e.preventDefault();
    try {
      const amount = parseFloat(editingInvoice.amount) || 0;
      await updateDoc(doc(db, "invoices", editingInvoice.id), {
        clientId: editingInvoice.clientId,
        amount: amount,
        status: editingInvoice.status,
        description: editingInvoice.description || "",
        dueDate: editingInvoice.dueDate || null,
      });
      await fetchInvoices();
      setShowEditModal(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteInvoice(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await deleteDoc(doc(db, "invoices", id));
    await fetchInvoices();
  }

  // تسجيل دفعة جزئية أو كاملة
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
      await fetchInvoices();
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
      clients.find((c) => c.id === invoice.clientId)?.name || t("common.unspecified");
    const productName =
      products.find((p) => p.id === invoice.productId)?.name || t("common.unspecified");
    exportInvoicePDF(invoice, clientName, productName);
  }

  // ✅ التحقق من صلاحية الحذف
  const userCanDelete = canDelete(userRole);

  // الإيراد الحقيقي = المبالغ المدفوعة فقط
  const totalRevenue = invoices.reduce((sum, inv) => {
    if (inv.status === "paid") {
      return sum + (parseFloat(inv.amount) || 0);
    }
    return sum + (parseFloat(inv.paidAmount) || 0);
  }, 0);

  const paidCount = invoices.filter((i) => i.status === "paid").length;
  const pendingCount = invoices.filter((i) => i.status === "pending").length;
    // إجمالي المبالغ المتأخرة (المتبقي من الفواتير Overdue بس)
  const totalOverdue = invoices.reduce((sum, inv) => {
    if (inv.status === "overdue") {
      const total = parseFloat(inv.amount) || 0;
      const paid = parseFloat(inv.paidAmount) || 0;
      return sum + (total - paid);
    }
    return sum;
  }, 0);

  const filtered = invoices.filter((inv) => {
    const clientName = clients.find((c) => c.id === inv.clientId)?.name || "";
    const matchSearch =
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(inv.amount).includes(searchTerm) ||
      (inv.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === "all" || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

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
        {/* Header */}
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

        {/* Stats */}
        <div
          className="stats-row"
          style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))" }}
        >
          <div className="stat-card amber">
            <div className="stat-icon">
              <i className="fas fa-file-invoice"></i>
            </div>
            <div className="stat-value">{invoices.length}</div>
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

        {/* Add Form */}
        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#6366f1" }}></i>
            {t("in.add")}
          </h3>
          <form onSubmit={addInvoice}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                gap: 14,
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("in.clientReq")}</label>
                <select
                  value={newInvoice.clientId}
                  onChange={(e) =>
                    setNewInvoice({ ...newInvoice, clientId: e.target.value })
                  }
                  required
                >
                  <option value="">{t("in.chooseClient")}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("in.productReq")}</label>
                <select
                  value={newInvoice.productId}
                  onChange={(e) => {
                    const productId = e.target.value;
                    const quantity = parseInt(newInvoice.quantity) || 1;
                    const amount = calculateAmount(productId, quantity);
                    setNewInvoice({
                      ...newInvoice,
                      productId: productId,
                      amount: amount > 0 ? amount.toString() : "",
                    });
                  }}
                  required
                >
                  <option value="">{t("in.chooseProduct")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.quantity} {t("in.remaining")})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("in.qtyReq")}</label>
                <input
                  type="number"
                  min="1"
                  value={newInvoice.quantity}
                  onChange={(e) => {
                    const quantity = parseInt(e.target.value) || 1;
                    const amount = calculateAmount(
                      newInvoice.productId,
                      quantity
                    );
                    setNewInvoice({
                      ...newInvoice,
                      quantity: quantity,
                      amount: amount > 0 ? amount.toString() : "",
                    });
                  }}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("in.amountReq")}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newInvoice.amount}
                  onChange={(e) =>
                    setNewInvoice({ ...newInvoice, amount: e.target.value })
                  }
                  required
                />
              </div>
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
                    setNewInvoice({ ...newInvoice, description: e.target.value })
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
                    <i className="fas fa-spinner fa-spin"></i> {t("common.adding")}
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

        {/* Table */}
        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("in.list")}
            </h3>
            <span className="table-count">{filtered.length} {t("in.invoices")}</span>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-file-invoice"></i>
                <p>
                  {searchTerm || filterStatus !== "all"
                    ? t("common.noResults")
                    : t("in.empty")}
                </p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("in.client")}</th>
                    <th>{t("in.product")}</th>
                    <th>{t("common.quantity")}</th>
                    <th>{t("common.amount")}</th>
                    <th>{t("in.paid")}</th>
                    <th>{t("in.remaining")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("common.date")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv, i) => {
                    const clientName =
                      clients.find((c) => c.id === inv.clientId)?.name ||
                      t("common.unspecified");
                    const productName =
                      products.find((p) => p.id === inv.productId)?.name ||
                      t("common.unspecified");
                    const paid = parseFloat(inv.paidAmount) || 0;
                    const remaining = (parseFloat(inv.amount) || 0) - paid;
                    return (
                      <tr key={inv.id}>
                        <td
                          style={{ color: "var(--gray-400)", fontWeight: 600 }}
                        >
                          {i + 1}
                        </td>
                        <td style={{ fontWeight: 600 }}>{clientName}</td>
                        <td>{productName}</td>
                        <td>{inv.quantity || 1}</td>
                        <td
                          style={{ fontWeight: 700, color: "var(--gray-800)" }}
                        >
                          {(inv.amount || 0).toLocaleString()} {t("currency")}
                        </td>
                        <td style={{ color: "#10b981", fontWeight: 600 }}>
                          {paid > 0 ? `${paid.toLocaleString()} ${t("currency")}` : "—"}
                        </td>
                        <td style={{ fontWeight: 700, color: remaining > 0 ? "#ef4444" : "#10b981" }}>
                          {remaining > 0 ? `${remaining.toLocaleString()} ${t("currency")}` : "✓"}
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
                        <td style={{ color: "var(--gray-500)", fontSize: 13 }}>
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
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && editingInvoice && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
              <div className="modal-body">
                <div className="form-group">
                  <label>{t("in.client")}</label>
                  <select
                    value={editingInvoice.clientId}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        clientId: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">{t("in.chooseClient")}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t("common.amount")}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingInvoice.amount}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        amount: e.target.value,
                      })
                    }
                    required
                  />
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
      )}

      {/* Pay Modal */}
      {showPayModal && payingInvoice && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-money-bill-wave" style={{ color: "#10b981" }}></i>{" "}
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
                <div style={{
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 16,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "var(--gray-500)", fontSize: 13 }}>{t("in.invoiceVal")}</span>
                    <span style={{ fontWeight: 800 }}>{(payingInvoice.amount || 0).toLocaleString()} {t("currency")}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "var(--gray-500)", fontSize: 13 }}>{t("in.prevPaid")}</span>
                    <span style={{ fontWeight: 700, color: "#10b981" }}>
                      {(parseFloat(payingInvoice.paidAmount) || 0).toLocaleString()} {t("currency")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--gray-500)", fontSize: 13 }}>{t("in.remaining")}</span>
                    <span style={{ fontWeight: 900, color: "#ef4444" }}>
                      {((parseFloat(payingInvoice.amount) || 0) - (parseFloat(payingInvoice.paidAmount) || 0)).toLocaleString()} {t("currency")}
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
                <button type="submit" className="btn-primary" disabled={paying}>
                  {paying ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> {t("in.recording")}
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
      )}
    </div>
  );
}