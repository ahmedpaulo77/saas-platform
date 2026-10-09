// src/pages/Shifts.jsx - الورديات (موارد بشرية)
// تعريف مواعيد الدوام (صباحية/مسائية) + سماحية التأخير — تُربط بالموظف وتُحسب عليها التأخيرات
import React, { useState, useEffect, useCallback } from "react";
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

export default function Shifts() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [form, setForm] = useState({ name: "", startTime: "", endTime: "", lateToleranceMin: "15" });
  const [editing, setEditing] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchShifts = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const snap = await getDocs(
        getScopedQuery("shifts", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      setShifts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  function isDuplicate(name, excludeId) {
    const n = (name || "").trim().toLowerCase();
    if (!n) return false;
    return shifts.some((x) => (x.name || "").trim().toLowerCase() === n && x.id !== excludeId);
  }

  async function addShift(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name || !form.startTime || !form.endTime) {
      alert(t("common.fillRequired"));
      return;
    }
    if (isDuplicate(name, null)) {
      alert(t("shift.exists"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "shifts"), {
        name,
        startTime: form.startTime,
        endTime: form.endTime,
        lateToleranceMin: Math.max(0, parseInt(form.lateToleranceMin) || 0),
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "shifts",
        itemId: docRef.id,
        details: `Created shift: ${name} (${form.startTime}-${form.endTime})`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setForm({ name: "", startTime: "", endTime: "", lateToleranceMin: "15" });
      await fetchShifts();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function updateShift(e) {
    e.preventDefault();
    const name = (editing.name || "").trim();
    if (!name || !editing.startTime || !editing.endTime) {
      alert(t("common.fillRequired"));
      return;
    }
    if (isDuplicate(name, editing.id)) {
      alert(t("shift.exists"));
      return;
    }
    try {
      await updateDoc(doc(db, "shifts", editing.id), {
        name,
        startTime: editing.startTime,
        endTime: editing.endTime,
        lateToleranceMin: Math.max(0, parseInt(editing.lateToleranceMin) || 0),
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "shifts",
        itemId: editing.id,
        details: `Updated shift: ${name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setShowEditModal(false);
      setEditing(null);
      await fetchShifts();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteShift(id, label) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "shifts", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "shifts",
        itemId: id,
        details: `Deleted shift: ${label}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchShifts();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  const filtered = shifts.filter((x) => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return (x.name || "").toLowerCase().includes(s);
  });

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
              <i className="fas fa-clock" style={{ color: "#1e3a8a", marginLeft: 10 }}></i>
              {t("shift.title")}
            </h1>
            <p className="subtitle">{t("shift.subtitle")}</p>
          </div>
        </div>

        <div className="form-card" style={{ borderTop: "4px solid #1e3a8a" }}>
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#1e3a8a" }}></i>
            {" "}{t("shift.add")}
          </h3>
          <form onSubmit={addShift}>
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
                  {t("shift.name")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={t("shift.namePh")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("shift.start")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("shift.end")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("shift.tolerance")}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.lateToleranceMin}
                  onChange={(e) => setForm({ ...form, lateToleranceMin: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="btn-primary">
                <i className="fas fa-plus"></i> {t("shift.add")}
              </button>
            </div>
          </form>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("shift.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("shift.list")}
            </h3>
            <span className="table-count">{filtered.length}</span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filtered}
              pageSize={15}
              resetKey={searchTerm}
              empty={
                <div className="table-empty">
                  <i className="fas fa-clock"></i>
                  <p>{t("shift.empty")}</p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("shift.name")}</th>
                      <th>{t("shift.start")}</th>
                      <th>{t("shift.end")}</th>
                      <th>{t("shift.tolerance")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((x, i) => (
                      <tr key={x.id}>
                        <td>{start + i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{x.name}</td>
                        <td style={{ direction: "ltr", fontFamily: "monospace" }}>{x.startTime || "—"}</td>
                        <td style={{ direction: "ltr", fontFamily: "monospace" }}>{x.endTime || "—"}</td>
                        <td>{x.lateToleranceMin ?? 0} {t("shift.min")}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              onClick={() => {
                                setEditing({ ...x });
                                setShowEditModal(true);
                              }}
                              className="btn-sm btn-secondary"
                              title={t("common.edit")}
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            {userCanDelete && (
                              <button
                                onClick={() => deleteShift(x.id, x.name)}
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
                  <i className="fas fa-edit" style={{ color: "#1e3a8a" }}></i> {t("shift.editTitle")}
                </h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>
                  ×
                </button>
              </div>
              <form onSubmit={updateShift}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>{t("shift.name")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="text"
                      value={editing.name || ""}
                      required
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="form-group">
                      <label>{t("shift.start")} <span style={{ color: "#ef4444" }}>*</span></label>
                      <input
                        type="time"
                        value={editing.startTime || ""}
                        required
                        onChange={(e) => setEditing({ ...editing, startTime: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("shift.end")} <span style={{ color: "#ef4444" }}>*</span></label>
                      <input
                        type="time"
                        value={editing.endTime || ""}
                        required
                        onChange={(e) => setEditing({ ...editing, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t("shift.tolerance")}</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editing.lateToleranceMin ?? 0}
                      onChange={(e) => setEditing({ ...editing, lateToleranceMin: e.target.value })}
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
