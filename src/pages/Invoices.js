// src/pages/Invoices.js - مع حساب تلقائي للسعر (نسخة كاملة)
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
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { exportInvoicePDF } from "../utils/pdfExport";
export default function Invoices() {
  const { userRole, userCompanyId } = useAuth();
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
    try {
      const snap = await getDocs(
        getScopedQuery("invoices", userRole, userCompanyId),
      );
      const invoicesData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setInvoices(invoicesData);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, [userRole, userCompanyId]);

  const fetchClients = useCallback(async () => {
    try {
      const snap = await getDocs(
        getScopedQuery("clients", userRole, userCompanyId),
      );
      setClients(snap.docs.map((d) => ({ id: d.id, name: d.data().name })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId]);

  const fetchProducts = useCallback(async () => {
    try {
      const snap = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId),
      );
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId]);

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
          alert("❌ الكمية المطلوبة أكبر من المتوفرة في المخزون!");
          setSubmitting(false);
          return;
        }
        await updateDoc(productRef, { quantity: currentQty - qty });
      }

      const amount = parseFloat(newInvoice.amount) || 0;

      await addDoc(collection(db, "invoices"), {
        ...newInvoice,
        companyId: userCompanyId,
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
      alert("❌ حدث خطأ");
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
      });
      await fetchInvoices();
      setShowEditModal(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteInvoice(id) {
    if (!window.confirm("هل أنت متأكد من حذف هذه الفاتورة؟")) return;
    await deleteDoc(doc(db, "invoices", id));
    await fetchInvoices();
  }

  function handleExportPDF(invoice) {
    const clientName =
      clients.find((c) => c.id === invoice.clientId)?.name || "غير محدد";
    const productName =
      products.find((p) => p.id === invoice.productId)?.name || "غير محدد";
    exportInvoicePDF(invoice, clientName, productName);
  }

  const totalRevenue = invoices.reduce((sum, inv) => {
    const amount = parseFloat(inv.amount) || 0;
    return sum + amount;
  }, 0);

  const paidCount = invoices.filter((i) => i.status === "paid").length;
  const pendingCount = invoices.filter((i) => i.status === "pending").length;

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
      <div className="loading">
        <div className="spinner"></div>
        جاري تحميل الفواتير...
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
              إدارة الفواتير
            </h1>
            <p className="subtitle">
              إنشاء وتتبع الفواتير مع تصدير PDF احترافي
            </p>
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
            <div className="stat-label">إجمالي الفواتير</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon">
              <i className="fas fa-check-circle"></i>
            </div>
            <div className="stat-value">{paidCount}</div>
            <div className="stat-label">فواتير مدفوعة</div>
          </div>
          <div className="stat-card indigo">
            <div className="stat-icon">
              <i className="fas fa-clock"></i>
            </div>
            <div className="stat-value">{pendingCount}</div>
            <div className="stat-label">قيد الانتظار</div>
          </div>
          <div className="stat-card cyan">
            <div className="stat-icon">
              <i className="fas fa-money-bill-wave"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {totalRevenue.toLocaleString()}
            </div>
            <div className="stat-label">إجمالي الإيرادات (ج.م)</div>
          </div>
        </div>

        {/* Add Form */}
        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#6366f1" }}></i>
            إضافة فاتورة جديدة
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
                <label>العميل *</label>
                <select
                  value={newInvoice.clientId}
                  onChange={(e) =>
                    setNewInvoice({ ...newInvoice, clientId: e.target.value })
                  }
                  required
                >
                  <option value="">اختر العميل</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>المنتج *</label>
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
                  <option value="">اختر المنتج</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.quantity} متبقي)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>الكمية *</label>
                <input
                  type="number"
                  min="1"
                  value={newInvoice.quantity}
                  onChange={(e) => {
                    const quantity = parseInt(e.target.value) || 1;
                    const amount = calculateAmount(
                      newInvoice.productId,
                      quantity,
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
                <label>المبلغ (ج.م) *</label>
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
                <label>الحالة</label>
                <select
                  value={newInvoice.status}
                  onChange={(e) =>
                    setNewInvoice({ ...newInvoice, status: e.target.value })
                  }
                >
                  <option value="pending">قيد الانتظار</option>
                  <option value="paid">مدفوعة</option>
                  <option value="overdue">متأخرة</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>الوصف</label>
                <input
                  type="text"
                  placeholder="ملاحظات اختيارية"
                  value={newInvoice.description}
                  onChange={(e) =>
                    setNewInvoice({ ...newInvoice, description: e.target.value })
                  }
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>تاريخ الاستحقاق (السداد)</label>
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
                    <i className="fas fa-spinner fa-spin"></i> جاري الإضافة...
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus"></i> إضافة فاتورة
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
              placeholder="ابحث بالعميل أو المبلغ أو الوصف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">جميع الحالات</option>
            <option value="paid">مدفوعة</option>
            <option value="pending">قيد الانتظار</option>
            <option value="overdue">متأخرة</option>
          </select>
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> قائمة الفواتير
            </h3>
            <span className="table-count">{filtered.length} فاتورة</span>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-file-invoice"></i>
                <p>
                  {searchTerm || filterStatus !== "all"
                    ? "لا توجد نتائج مطابقة"
                    : "لا توجد فواتير بعد"}
                </p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>العميل</th>
                    <th>المنتج</th>
                    <th>الكمية</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv, i) => {
                    const clientName =
                      clients.find((c) => c.id === inv.clientId)?.name ||
                      "غير محدد";
                    const productName =
                      products.find((p) => p.id === inv.productId)?.name ||
                      "غير محدد";
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
                          {(inv.amount || 0).toLocaleString()} ج.م
                        </td>
                        <td>
                          <span
                            className={`badge ${inv.status === "paid" ? "badge-paid" : inv.status === "pending" ? "badge-pending" : "badge-overdue"}`}
                          >
                            {inv.status === "paid"
                              ? "✓ مدفوعة"
                              : inv.status === "pending"
                                ? "⏳ انتظار"
                                : "⚠ متأخرة"}
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
                              title="تصدير PDF"
                            >
                              <i className="fas fa-file-pdf"></i> PDF
                            </button>
                            <button
                              onClick={() => {
                                setEditingInvoice(inv);
                                setShowEditModal(true);
                              }}
                              className="btn-secondary btn-sm"
                              title="تعديل"
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              onClick={() => deleteInvoice(inv.id)}
                              className="btn-danger btn-sm"
                              title="حذف"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
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
                تعديل الفاتورة
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
                  <label>العميل</label>
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
                    <option value="">اختر العميل</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>المبلغ (ج.م)</label>
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
                  <label>الحالة</label>
                  <select
                    value={editingInvoice.status}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        status: e.target.value,
                      })
                    }
                  >
                    <option value="pending">قيد الانتظار</option>
                    <option value="paid">مدفوعة</option>
                    <option value="overdue">متأخرة</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>الوصف</label>
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
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="btn-primary">
                  <i className="fas fa-save"></i> حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
