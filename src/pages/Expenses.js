// src/pages/Expenses.js - تسجيل مصروفات الشركة (إيجار، مرتبات، فواتير...)
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { collection, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { canDelete } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import { logActivity } from "../utils/auditLogger";
import Pagination from "../components/common/PaginationV2";
import { useFirestorePagination } from "../hooks/useFirestorePagination";

const PAGE_SIZE = 25;

const CATEGORIES = [
  { value: "rent", labelKey: "expn.cat.rent" },
  { value: "salaries", labelKey: "expn.cat.salaries" },
  { value: "utilities", labelKey: "expn.cat.utilities" },
  { value: "marketing", labelKey: "expn.cat.marketing" },
  { value: "transport", labelKey: "expn.cat.transport" },
  { value: "maintenance", labelKey: "expn.cat.maintenance" },
  { value: "other", labelKey: "expn.cat.other" },
];

export default function Expenses() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  const [newExpense, setNewExpense] = useState({
    category: "rent",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    description: "",
  });

  const [editingExpense, setEditingExpense] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const filters = useMemo(() => {
    const f = [];
    if (filterCategory !== "all") {
      f.push(["category", "==", filterCategory]);
    }
    return f;
  }, [filterCategory]);

  const {
    data: expenses,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset: resetPagination,
  } = useFirestorePagination("expenses", userRole, userCompanyId, currentUser?.uid, {
    pageSize: PAGE_SIZE,
    orderByField: "createdAt",
    orderDirection: "desc",
    filters,
    enabled: !!userCompanyId,
  });

  useEffect(() => {
    resetPagination();
  }, [filterCategory, resetPagination]);

  const filteredExpenses = useMemo(() => {
    if (!searchTerm.trim()) return expenses;
    const term = searchTerm.toLowerCase();
    return expenses.filter(
      (e) =>
        (e.description || "").toLowerCase().includes(term) ||
        String(e.amount).includes(term)
    );
  }, [expenses, searchTerm]);

  const categoryLabel = useCallback(
    (value) => {
      const cat = CATEGORIES.find((c) => c.value === value);
      return cat ? t(cat.labelKey) : value;
    },
    [t]
  );

  async function addExpense(e) {
    e.preventDefault();
    if (!newExpense.amount) return;
    setSubmitting(true);
    try {
      const amount = parseFloat(newExpense.amount) || 0;
      const expenseData = {
        category: newExpense.category,
        amount,
        date: newExpense.date || new Date().toISOString().slice(0, 10),
        description: newExpense.description || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "expenses"), expenseData);

      await logActivity({
        actionType: "CREATE",
        collectionName: "expenses",
        itemId: docRef.id,
        details: `Created expense: ${newExpense.category}, amount ${amount}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      setNewExpense({
        category: "rent",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        description: "",
      });
      await resetPagination();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setSubmitting(false);
  }

  async function updateExpense(e) {
    e.preventDefault();
    try {
      const amount = parseFloat(editingExpense.amount) || 0;
      await updateDoc(doc(db, "expenses", editingExpense.id), {
        category: editingExpense.category,
        amount,
        date: editingExpense.date,
        description: editingExpense.description || "",
      });

      await logActivity({
        actionType: "UPDATE",
        collectionName: "expenses",
        itemId: editingExpense.id,
        details: `Updated expense amount to ${amount}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      await resetPagination();
      setShowEditModal(false);
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteExpense(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "expenses", id));

      await logActivity({
        actionType: "DELETE",
        collectionName: "expenses",
        itemId: id,
        details: `Deleted expense`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      await resetPagination();
    } catch (err) {
      console.error(err);
    }
  }

  const userCanDelete = canDelete(userRole);

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  const thisMonthTotal = filteredExpenses.reduce((sum, e) => {
    if (!e.date) return sum;
    const d = new Date(e.date);
    const now = new Date();
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      return sum + (parseFloat(e.amount) || 0);
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
              <i className="fas fa-file-invoice-dollar" style={{ color: "#dc2626", marginLeft: 10 }}></i>
              {t("expn.title")}
            </h1>
            <p className="subtitle">{t("expn.subtitle")}</p>
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
          <div className="stats-row">
            <div className="stat-card red">
              <div className="stat-icon">
                <i className="fas fa-file-invoice-dollar"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {totalAmount.toLocaleString()}
              </div>
              <div className="stat-label">{t("expn.statTotal")}</div>
            </div>
            <div className="stat-card amber">
              <div className="stat-icon">
                <i className="fas fa-calendar-alt"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {thisMonthTotal.toLocaleString()}
              </div>
              <div className="stat-label">{t("expn.statThisMonth")}</div>
            </div>
            <div className="stat-card indigo">
              <div className="stat-icon">
                <i className="fas fa-list"></i>
              </div>
              <div className="stat-value">{filteredExpenses.length}</div>
              <div className="stat-label">{t("expn.statCount")}</div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "24px 20px", marginBottom: 24 }}>
            <i className="fas fa-lock" style={{ fontSize: 24, color: "#94a3b8", marginBottom: 8 }}></i>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
              {t("expn.statsAdminOnly")}
            </p>
          </div>
        )}

        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#dc2626" }}></i>
            {t("expn.add")}
          </h3>
          <form onSubmit={addExpense}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("expn.category")}</label>
                <select
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("expn.amountReq")}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("expn.date")}</label>
                <input
                  type="date"
                  value={newExpense.date}
                  onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("common.description")}</label>
                <input
                  type="text"
                  placeholder={t("expn.descPh")}
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
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
                    <i className="fas fa-plus"></i> {t("expn.add")}
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
              placeholder={t("expn.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">{t("expn.allCategories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("expn.list")}
            </h3>
            <span className="table-count">
              {filteredExpenses.length} {t("expn.expenses")}
            </span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filteredExpenses}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onRefresh={resetPagination}
              pageSize={PAGE_SIZE}
              empty={
                <div className="table-empty">
                  <i className="fas fa-file-invoice-dollar"></i>
                  <p>
                    {searchTerm || filterCategory !== "all" ? t("common.noResults") : t("expn.empty")}
                  </p>
                </div>
              }
              render={(pageItems) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("expn.category")}</th>
                      <th>{t("common.amount")}</th>
                      <th>{t("common.description")}</th>
                      <th>{t("common.date")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((exp, i) => (
                      <tr key={exp.id}>
                        <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{categoryLabel(exp.category)}</td>
                        <td style={{ fontWeight: 700, color: "#dc2626" }}>
                          {(exp.amount || 0).toLocaleString()} {t("currency")}
                        </td>
                        <td>{exp.description || "-"}</td>
                        <td style={{ color: "var(--gray-500)", fontSize: 13 }}>
                          {exp.date ? new Date(exp.date).toLocaleDateString() : "-"}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              onClick={() => {
                                setEditingExpense(exp);
                                setShowEditModal(true);
                              }}
                              className="btn-secondary btn-sm"
                              title={t("common.edit")}
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            {userCanDelete && (
                              <button
                                onClick={() => deleteExpense(exp.id)}
                                className="btn-danger btn-sm"
                                title={t("common.delete")}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            />
          </div>
        </div>
      </div>

      {showEditModal && editingExpense && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-edit" style={{ color: "#dc2626" }}></i> {t("common.edit")}
              </h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={updateExpense}>
              <div className="modal-body">
                <div className="form-group">
                  <label>{t("expn.category")}</label>
                  <select
                    value={editingExpense.category}
                    onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {t(c.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t("common.amount")}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingExpense.amount}
                    onChange={(e) => setEditingExpense({ ...editingExpense, amount: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t("expn.date")}</label>
                  <input
                    type="date"
                    value={editingExpense.date}
                    onChange={(e) => setEditingExpense({ ...editingExpense, date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t("common.description")}</label>
                  <input
                    type="text"
                    value={editingExpense.description || ""}
                    onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
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
    </div>
  );
}