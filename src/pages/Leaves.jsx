// src/pages/Leaves.jsx - الإجازات (موارد بشرية)
// طلب إجازة (سنوية/مرضية/بدون أجر) → اعتماد/رفض من الإدارة → خصم تلقائي من الرصيد السنوي (21 يوم)
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

export const ANNUAL_BALANCE = 21;

function daysBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return 0;
  const ms = new Date(toISO) - new Date(fromISO);
  if (isNaN(ms) || ms < 0) return 0;
  return Math.round(ms / 86400000) + 1;
}

export default function Leaves() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [form, setForm] = useState({
    employeeId: "",
    type: "annual",
    fromDate: new Date().toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const [leaveSnap, empSnap] = await Promise.all([
        getDocs(getScopedQuery("leaves", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("employees", userRole, userCompanyId, currentUser?.uid)),
      ]);
      const data = leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setLeaves(data);
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
  const curYear = new Date().getFullYear();

  // الرصيد السنوي المتبقي لكل موظف (21 − المعتمدة السنوية هذا العام)
  const balanceOf = useCallback((employeeId) => {
    const used = leaves
      .filter(
        (l) =>
          l.employeeId === employeeId &&
          l.type === "annual" &&
          l.status === "approved" &&
          String(l.fromDate || "").startsWith(String(curYear))
      )
      .reduce((s, l) => s + (parseFloat(l.days) || 0), 0);
    return Math.max(0, ANNUAL_BALANCE - used);
  }, [leaves, curYear]);

  async function addLeave(e) {
    e.preventDefault();
    if (!form.employeeId || !form.fromDate || !form.toDate) {
      alert(t("common.fillRequired"));
      return;
    }
    const days = daysBetween(form.fromDate, form.toDate);
    if (!(days > 0)) {
      alert(t("leave.badDates"));
      return;
    }
    if (form.type === "annual" && days > balanceOf(form.employeeId)) {
      alert(t("leave.noBalance"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "leaves"), {
        employeeId: form.employeeId,
        type: form.type,
        fromDate: form.fromDate,
        toDate: form.toDate,
        days,
        reason: form.reason.trim(),
        status: "pending",
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "leaves",
        itemId: docRef.id,
        details: `Leave request: ${form.type} ${days}d for employee ${form.employeeId}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setForm({
        employeeId: "",
        type: "annual",
        fromDate: new Date().toISOString().slice(0, 10),
        toDate: new Date().toISOString().slice(0, 10),
        reason: "",
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function decideLeave(l, status) {
    if (!isAdmin) return;
    if (!window.confirm(status === "approved" ? t("leave.approveQ") : t("leave.rejectQ"))) return;
    // الاعتماد السنوي يتحقق من الرصيد لحظتها
    if (status === "approved" && l.type === "annual" && (parseFloat(l.days) || 0) > balanceOf(l.employeeId)) {
      alert(t("leave.noBalance"));
      return;
    }
    try {
      await updateDoc(doc(db, "leaves", l.id), {
        status,
        decidedBy: currentUser?.uid || null,
        decidedAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "leaves",
        itemId: l.id,
        details: `Leave ${status} for employee ${l.employeeId}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteLeave(id, label) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "leaves", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "leaves",
        itemId: id,
        details: `Deleted leave: ${label}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  const filtered = leaves.filter((l) => {
    if (statusFilter !== "all" && (l.status || "pending") !== statusFilter) return false;
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return (
      empNameOf(l.employeeId).toLowerCase().includes(s) ||
      (l.reason || "").toLowerCase().includes(s)
    );
  });

  const statusStyle = (st) =>
    st === "approved"
      ? { background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac" }
      : st === "rejected"
        ? { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }
        : { background: "#fffbeb", color: "#b45309", border: "1px solid #fcd34d" };

  const formDays = daysBetween(form.fromDate, form.toDate);

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
              <i className="fas fa-umbrella-beach" style={{ color: "#059669", marginLeft: 10 }}></i>
              {t("leave.title")}
            </h1>
            <p className="subtitle">{t("leave.subtitle")}</p>
          </div>
        </div>

        <div className="form-card" style={{ borderTop: "4px solid #059669" }}>
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#059669" }}></i>
            {" "}{t("leave.add")}
          </h3>
          <form onSubmit={addLeave}>
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
                    <option key={e.id} value={e.id}>
                      {e.name} ({t("leave.balance")}: {balanceOf(e.id)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("leave.type")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                >
                  <option value="annual">{t("leave.annual")}</option>
                  <option value="sick">{t("leave.sick")}</option>
                  <option value="unpaid">{t("leave.unpaid")}</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("leave.from")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="date"
                  value={form.fromDate}
                  onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("leave.to")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="date"
                  value={form.toDate}
                  min={form.fromDate}
                  onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("leave.reason")}
                </label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="submit" className="btn-primary">
                <i className="fas fa-plus"></i> {t("leave.add")}
              </button>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#059669" }}>
                {t("leave.days")}: {formDays}
                {form.employeeId && form.type === "annual" && ` • ${t("leave.balance")}: ${balanceOf(form.employeeId)}`}
              </span>
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
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">{t("leave.allStatus")}</option>
            <option value="pending">{t("leave.pending")}</option>
            <option value="approved">{t("leave.approved")}</option>
            <option value="rejected">{t("leave.rejected")}</option>
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("leave.list")}
            </h3>
            <span className="table-count">{filtered.length}</span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filtered}
              pageSize={15}
              resetKey={`${searchTerm}-${statusFilter}`}
              empty={
                <div className="table-empty">
                  <i className="fas fa-umbrella-beach"></i>
                  <p>{t("leave.empty")}</p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("emp.name")}</th>
                      <th>{t("leave.type")}</th>
                      <th>{t("leave.period")}</th>
                      <th>{t("leave.days")}</th>
                      <th>{t("leave.status")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((l, i) => (
                      <tr key={l.id}>
                        <td>{start + i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{empNameOf(l.employeeId)}</td>
                        <td>
                          {l.type === "annual" ? t("leave.annual") : l.type === "sick" ? t("leave.sick") : t("leave.unpaid")}
                        </td>
                        <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          {l.fromDate || "—"} → {l.toDate || "—"}
                        </td>
                        <td style={{ fontWeight: 800 }}>{l.days ?? 0}</td>
                        <td>
                          <span className="badge" style={statusStyle(l.status || "pending")}>
                            {(l.status || "pending") === "approved"
                              ? t("leave.approved")
                              : (l.status || "pending") === "rejected"
                                ? t("leave.rejected")
                                : t("leave.pending")}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            {isAdmin && (l.status || "pending") === "pending" && (
                              <>
                                <button
                                  onClick={() => decideLeave(l, "approved")}
                                  className="btn-success btn-sm"
                                  title={t("leave.approve")}
                                >
                                  <i className="fas fa-check"></i>
                                </button>
                                <button
                                  onClick={() => decideLeave(l, "rejected")}
                                  className="btn-danger btn-sm"
                                  title={t("leave.reject")}
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                              </>
                            )}
                            {userCanDelete && (
                              <button
                                onClick={() => deleteLeave(l.id, `${empNameOf(l.employeeId)} ${l.fromDate}`)}
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
    </div>
  );
}
