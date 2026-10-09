// src/pages/EmployeeDocs.jsx - العقود والمستندات (موارد بشرية)
// مستندات الموظفين (عقد/بطاقة/رخصة) مع تنبيه انتهاء الصلاحية (30 يوم + المنتهية)
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";

const EXPIRY_WARN_DAYS = 30;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr) - new Date(new Date().toISOString().slice(0, 10));
  if (isNaN(ms)) return null;
  return Math.round(ms / 86400000);
}

export default function EmployeeDocs() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [docs, setDocs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [empFilter, setEmpFilter] = useState("all");

  const [form, setForm] = useState({
    employeeId: "", name: "", number: "", issueDate: "", expiryDate: "", notes: "",
  });
  const [editing, setEditing] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const [docSnap, empSnap] = await Promise.all([
        getDocs(getScopedQuery("employee_docs", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("employees", userRole, userCompanyId, currentUser?.uid)),
      ]);
      const data = docSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => String(a.expiryDate || "9999").localeCompare(String(b.expiryDate || "9999")));
      setDocs(data);
      const emps = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emps.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
      setEmployees(emps);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const empNameOf = (id) => employees.find((e) => e.id === id)?.name || "—";

  const alerts = useMemo(() => {
    const expiring = [];
    const expired = [];
    docs.forEach((d) => {
      if (!d.expiryDate) return;
      const left = daysUntil(d.expiryDate);
      if (left === null) return;
      if (left < 0) expired.push(d);
      else if (left <= EXPIRY_WARN_DAYS) expiring.push(d);
    });
    return { expiring, expired };
  }, [docs]);

  async function addDocEntry(e) {
    e.preventDefault();
    if (!form.employeeId || !form.name.trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "employee_docs"), {
        employeeId: form.employeeId,
        name: form.name.trim(),
        number: form.number.trim(),
        issueDate: form.issueDate || null,
        expiryDate: form.expiryDate || null,
        notes: form.notes.trim(),
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "employee_docs",
        itemId: docRef.id,
        details: `Added document ${form.name.trim()} for employee ${form.employeeId}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setForm({ employeeId: "", name: "", number: "", issueDate: "", expiryDate: "", notes: "" });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function updateDocEntry(e) {
    e.preventDefault();
    if (!editing.employeeId || !(editing.name || "").trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    try {
      await updateDoc(doc(db, "employee_docs", editing.id), {
        employeeId: editing.employeeId,
        name: editing.name.trim(),
        number: (editing.number || "").trim(),
        issueDate: editing.issueDate || null,
        expiryDate: editing.expiryDate || null,
        notes: (editing.notes || "").trim(),
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "employee_docs",
        itemId: editing.id,
        details: `Updated document ${editing.name.trim()}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setShowEditModal(false);
      setEditing(null);
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteDocEntry(id, label) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "employee_docs", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "employee_docs",
        itemId: id,
        details: `Deleted document: ${label}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  const filtered = docs.filter((d) => {
    if (empFilter !== "all" && d.employeeId !== empFilter) return false;
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return (
      (d.name || "").toLowerCase().includes(s) ||
      (d.number || "").toLowerCase().includes(s) ||
      empNameOf(d.employeeId).toLowerCase().includes(s)
    );
  });

  function expiryBadge(d) {
    if (!d.expiryDate) return <span style={{ color: "#94a3b8" }}>—</span>;
    const left = daysUntil(d.expiryDate);
    if (left === null) return <span>—</span>;
    if (left < 0)
      return <span className="badge" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>⛔ {t("doc.expired")}</span>;
    if (left <= EXPIRY_WARN_DAYS)
      return <span className="badge" style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fcd34d" }}>⚠️ {left} ⏳</span>;
    return <span style={{ fontSize: 12 }}>{new Date(d.expiryDate).toLocaleDateString(locale)}</span>;
  }

  if (loading) {
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
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-file-contract" style={{ color: "#4338ca", marginLeft: 10 }}></i>
              {t("doc.title")}
            </h1>
            <p className="subtitle">{t("doc.subtitle")}</p>
          </div>
        </div>

        {(alerts.expired.length > 0 || alerts.expiring.length > 0) && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            {alerts.expired.length > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 12, padding: "10px 18px", fontWeight: 800, fontSize: 14 }}>
                ⛔ {t("doc.expired")}: {alerts.expired.length} — {alerts.expired.slice(0, 3).map((d) => `${d.name} (${empNameOf(d.employeeId)})`).join("، ")}{alerts.expired.length > 3 ? "…" : ""}
              </div>
            )}
            {alerts.expiring.length > 0 && (
              <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", borderRadius: 12, padding: "10px 18px", fontWeight: 800, fontSize: 14 }}>
                ⚠️ {t("doc.expiring")}: {alerts.expiring.length} — {alerts.expiring.slice(0, 3).map((d) => `${d.name} (${empNameOf(d.employeeId)})`).join("، ")}{alerts.expiring.length > 3 ? "…" : ""}
              </div>
            )}
          </div>
        )}

        <div className="form-card" style={{ borderTop: "4px solid #4338ca" }}>
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#4338ca" }}></i>
            {" "}{t("doc.add")}
          </h3>
          <form onSubmit={addDocEntry}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
                alignItems: "end",
              }}
            >
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("emp.name")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                >
                  <option value="">— {t("emp.selectEmployee")} —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("doc.name")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={t("doc.namePh")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("doc.number")}
                </label>
                <input
                  type="text"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("doc.issue")}
                </label>
                <input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("doc.expiry")}
                </label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("doc.notes")}
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="btn-primary">
                <i className="fas fa-plus"></i> {t("doc.add")}
              </button>
            </div>
          </form>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("leave.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
            <option value="all">{t("doc.allEmps")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("doc.list")}
            </h3>
            <span className="table-count">{filtered.length}</span>
          </div>
          <div className="table-wrapper" style={{ overflowX: "auto" }}>
            <Pagination
              data={filtered}
              pageSize={15}
              resetKey={`${searchTerm}-${empFilter}`}
              empty={
                <div className="table-empty">
                  <i className="fas fa-file-contract"></i>
                  <p>{t("doc.empty")}</p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("emp.name")}</th>
                      <th>{t("doc.name")}</th>
                      <th>{t("doc.number")}</th>
                      <th>{t("doc.expiry")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((d, i) => (
                      <tr key={d.id}>
                        <td>{start + i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{empNameOf(d.employeeId)}</td>
                        <td>{d.name}</td>
                        <td style={{ direction: "ltr" }}>{d.number || "—"}</td>
                        <td>{expiryBadge(d)}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              onClick={() => {
                                setEditing({ ...d });
                                setShowEditModal(true);
                              }}
                              className="btn-sm btn-secondary"
                              title={t("common.edit")}
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            {userCanDelete && (
                              <button
                                onClick={() => deleteDocEntry(d.id, d.name)}
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

        {showEditModal && editing && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-edit" style={{ color: "#4338ca" }}></i> {t("doc.name")}
                </h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>
                  ×
                </button>
              </div>
              <form onSubmit={updateDocEntry}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>{t("emp.name")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <select
                      value={editing.employeeId || ""}
                      required
                      onChange={(e) => setEditing({ ...editing, employeeId: e.target.value })}
                    >
                      <option value="">— {t("emp.selectEmployee")} —</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t("doc.name")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="text"
                      value={editing.name || ""}
                      required
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t("doc.number")}</label>
                    <input
                      type="text"
                      value={editing.number || ""}
                      onChange={(e) => setEditing({ ...editing, number: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="form-group">
                      <label>{t("doc.issue")}</label>
                      <input
                        type="date"
                        value={editing.issueDate || ""}
                        onChange={(e) => setEditing({ ...editing, issueDate: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("doc.expiry")}</label>
                      <input
                        type="date"
                        value={editing.expiryDate || ""}
                        onChange={(e) => setEditing({ ...editing, expiryDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t("doc.notes")}</label>
                    <input
                      type="text"
                      value={editing.notes || ""}
                      onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
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
    </div>
  );
}
