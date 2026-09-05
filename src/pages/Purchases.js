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
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import { getAvailableModules } from "../utils/modules";
import { logActivity } from "../utils/auditLogger";
import AutocompleteInput from "../components/common/AutocompleteInput";
import Pagination from "../components/common/PaginationV2";
import { useFirestorePagination } from "../hooks/useFirestorePagination";
const PAGE_SIZE = 25;

export default function Purchases() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const availableModules = getAvailableModules(userIndustry, userRole);
  const hasInventory = availableModules.has("inventory");
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  const [newPurchase, setNewPurchase] = useState({
    supplierId: "",
    productId: "",
    quantity: "",
    unitCost: "",
    amount: "",
    status: "pending",
    description: "",
    dueDate: "",
  });

  const [editingPurchase, setEditingPurchase] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // الدفعات الجزئية (اللي بندفعها للمورد)
  const [payingPurchase, setPayingPurchase] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);

  // ✅ حساب المبلغ تلقائياً = سعر الوحدة × الكمية
  const calculateAmount = (unitCost, quantity) => {
    const cost = parseFloat(unitCost) || 0;
    const qty = parseFloat(quantity) || 0;
    if (cost > 0 && qty > 0) return cost * qty;
    return 0;
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

  // جلب المنتجات (لل autocomplete - اختياري لو مفيش مخزون)
  const fetchProducts = useCallback(async () => {
    if (!userCompanyId || !hasInventory) return;
    try {
      const snap = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid)
      );
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid, hasInventory]);

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
  }, [fetchSuppliers, fetchProducts]);

  useEffect(() => {
    resetPagination();
  }, [filterStatus, resetPagination]);

  const filteredPurchases = useMemo(() => {
    if (!searchTerm.trim()) return purchases;
    const term = searchTerm.toLowerCase();
    return purchases.filter((p) => {
      const supplierName = suppliers.find((s) => s.id === p.supplierId)?.name || "";
      const productName = products.find((x) => x.id === p.productId)?.name || "";
      return (
        supplierName.toLowerCase().includes(term) ||
        productName.toLowerCase().includes(term) ||
        String(p.amount).includes(term) ||
        (p.description || "").toLowerCase().includes(term)
      );
    });
  }, [purchases, searchTerm, suppliers, products]);

  async function addPurchase(e) {
    e.preventDefault();
    if (!newPurchase.supplierId || !newPurchase.amount) return;
    setSubmitting(true);
    try {
      // ✅ لو اتاختار منتج، الشراء بيزوّد كميته في المخزون (عكس فاتورة البيع)
      if (hasInventory && newPurchase.productId) {
        const productRef = doc(db, "inventory", newPurchase.productId);
        const productDoc = await getDoc(productRef);
        const qty = parseFloat(newPurchase.quantity) || 0;
        if (productDoc.exists() && qty > 0) {
          const currentQty = productDoc.data().quantity || 0;
          await updateDoc(productRef, { quantity: currentQty + qty });
        }
      }

      const amount = parseFloat(newPurchase.amount) || 0;
      const purchaseData = {
        ...newPurchase,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        amount,
        unitCost: parseFloat(newPurchase.unitCost) || 0,
        quantity: hasInventory ? (parseFloat(newPurchase.quantity) || 0) : 0,
        date: new Date().toISOString(),
        dueDate: newPurchase.dueDate || null,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "purchases"), purchaseData);

      await logActivity({
        actionType: "CREATE",
        collectionName: "purchases",
        itemId: docRef.id,
        details: `Created purchase from supplier ${newPurchase.supplierId}, amount ${amount}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      setNewPurchase({
        supplierId: "",
        productId: "",
        quantity: "",
        unitCost: "",
        amount: "",
        status: "pending",
        description: "",
        dueDate: "",
      });
      await Promise.all([resetPagination(), fetchProducts()]);
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
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

  async function deletePurchase(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "purchases", id));

      await logActivity({
        actionType: "DELETE",
        collectionName: "purchases",
        itemId: id,
        details: `Deleted purchase`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      await resetPagination();
    } catch (e) {
      console.error(e);
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

        {isAdmin ? (
          <div
            className="stats-row"
            style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))" }}
          >
            <div className="stat-card cyan">
              <div className="stat-icon">
                <i className="fas fa-cart-arrow-down"></i>
              </div>
              <div className="stat-value">{filteredPurchases.length}</div>
              <div className="stat-label">{t("pur.statTotal")}</div>
            </div>
            <div className="stat-card green">
              <div className="stat-icon">
                <i className="fas fa-check-circle"></i>
              </div>
              <div className="stat-value">{paidCount}</div>
              <div className="stat-label">{t("pur.statPaid")}</div>
            </div>
            <div className="stat-card indigo">
              <div className="stat-icon">
                <i className="fas fa-clock"></i>
              </div>
              <div className="stat-value">{pendingCount}</div>
              <div className="stat-label">{t("pur.statPending")}</div>
            </div>
            <div className="stat-card amber">
              <div className="stat-icon">
                <i className="fas fa-money-bill-wave"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {totalSpent.toLocaleString()}
              </div>
              <div className="stat-label">{t("pur.statSpent")}</div>
            </div>
            <div className="stat-card red">
              <div className="stat-icon">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {totalOwed.toLocaleString()}
              </div>
              <div className="stat-label">{t("pur.statOwed")}</div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "24px 20px", marginBottom: 24 }}>
            <i className="fas fa-lock" style={{ fontSize: 24, color: "#94a3b8", marginBottom: 8 }}></i>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
              {t("pur.statsAdminOnly")}
            </p>
          </div>
        )}

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
              </div>
              {hasInventory && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t("pur.productOpt")}</label>
                  <AutocompleteInput
                    items={products.map((p) => ({
                      id: p.id,
                      label: p.name,
                      sublabel: `${p.quantity || 0} ${t("in.remaining")}`,
                    }))}
                    value={newPurchase.productId}
                    onChange={(productId) => setNewPurchase({ ...newPurchase, productId })}
                    placeholder={t("pur.chooseProduct")}
                  />
                </div>
              )}
              {hasInventory && newPurchase.productId && (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>{t("pur.qty")}</label>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={newPurchase.quantity}
                      onWheel={(e) => e.target.blur()}
                      onChange={(e) => {
                        const quantity = e.target.value;
                        const amount = calculateAmount(newPurchase.unitCost, quantity);
                        setNewPurchase({
                          ...newPurchase,
                          quantity,
                          amount: amount > 0 ? amount.toString() : newPurchase.amount,
                        });
                      }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>{t("pur.unitCost")}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newPurchase.unitCost}
                      onChange={(e) => {
                        const unitCost = e.target.value;
                        const amount = calculateAmount(unitCost, newPurchase.quantity);
                        setNewPurchase({
                          ...newPurchase,
                          unitCost,
                          amount: amount > 0 ? amount.toString() : newPurchase.amount,
                        });
                      }}
                    />
                  </div>
                </>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("pur.amountReq")}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newPurchase.amount}
                  onChange={(e) => setNewPurchase({ ...newPurchase, amount: e.target.value })}
                  required
                />
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

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("pur.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">{t("in.allStatus")}</option>
            <option value="paid">{t("in.statusPaid")}</option>
            <option value="pending">{t("in.statusWait")}</option>
            <option value="overdue">{t("in.statusOver")}</option>
          </select>
        </div>

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
                      const productName =
                        products.find((x) => x.id === p.productId)?.name ||
                        t("common.unspecified");
                      const paid = parseFloat(p.paidAmount) || 0;
                      const remaining = (parseFloat(p.amount) || 0) - paid;
                      return (
                        <tr key={p.id}>
                          <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{supplierName}</td>
                          {hasInventory && <td>{productName}</td>}
                          {hasInventory && <td>{p.quantity || 0}</td>}
                          <td style={{ fontWeight: 700, color: "var(--gray-800)" }}>
                            {(p.amount || 0).toLocaleString()} {t("currency")}
                          </td>
                          <td style={{ color: "#10b981", fontWeight: 600 }}>
                            {paid > 0 ? `${paid.toLocaleString()} ${t("currency")}` : "—"}
                          </td>
                          <td style={{ fontWeight: 700, color: remaining > 0 ? "#ef4444" : "#10b981" }}>
                            {remaining > 0 ? `${remaining.toLocaleString()} ${t("currency")}` : "✓"}
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
                            {p.date ? new Date(p.date).toLocaleDateString() : "-"}
                          </td>
                          <td>
                            <div className="table-actions">
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
                              {userCanDelete && (
                                <button
                                  onClick={() => deletePurchase(p.id)}
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

      {showEditModal && editingPurchase && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-edit" style={{ color: "#0891b2" }}></i> {t("common.edit")}
              </h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={updatePurchase}>
              <div className="modal-body">
                <div className="form-group">
                  <label>{t("pur.supplier")}</label>
                  <AutocompleteInput
                    items={suppliers.map((s) => ({
                      id: s.id,
                      label: s.name,
                      sublabel: s.phone ? `📞 ${s.phone}` : "",
                    }))}
                    value={editingPurchase.supplierId}
                    onChange={(id) => setEditingPurchase({ ...editingPurchase, supplierId: id })}
                    placeholder={t("pur.chooseSupplier")}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t("common.amount")}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingPurchase.amount}
                    onChange={(e) =>
                      setEditingPurchase({ ...editingPurchase, amount: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t("common.status")}</label>
                  <select
                    value={editingPurchase.status}
                    onChange={(e) =>
                      setEditingPurchase({ ...editingPurchase, status: e.target.value })
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
                    value={editingPurchase.description || ""}
                    onChange={(e) =>
                      setEditingPurchase({ ...editingPurchase, description: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>{t("pur.due")}</label>
                  <input
                    type="date"
                    value={editingPurchase.dueDate || ""}
                    onChange={(e) =>
                      setEditingPurchase({ ...editingPurchase, dueDate: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
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

      {showPayModal && payingPurchase && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-money-bill-wave" style={{ color: "#10b981" }}></i> {t("pur.pay")}
              </h3>
              <button className="modal-close" onClick={() => setShowPayModal(false)}>
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
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "var(--gray-500)", fontSize: 13 }}>{t("pur.purchaseVal")}</span>
                    <span style={{ fontWeight: 800 }}>
                      {(payingPurchase.amount || 0).toLocaleString()} {t("currency")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "var(--gray-500)", fontSize: 13 }}>{t("in.prevPaid")}</span>
                    <span style={{ fontWeight: 700, color: "#10b981" }}>
                      {(parseFloat(payingPurchase.paidAmount) || 0).toLocaleString()} {t("currency")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--gray-500)", fontSize: 13 }}>{t("in.remaining")}</span>
                    <span style={{ fontWeight: 900, color: "#ef4444" }}>
                      {(
                        (parseFloat(payingPurchase.amount) || 0) -
                        (parseFloat(payingPurchase.paidAmount) || 0)
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
                <button type="button" className="btn-secondary" onClick={() => setShowPayModal(false)}>
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