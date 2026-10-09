// src/pages/Requests.jsx - الطلبات والموافقات (موارد بشرية)
// الموظف يطلب (تصحيح بصمة/سلفة/عام) → الإدارة تعتمد أو ترفض.
// الاعتماد ينفذ تلقائياً: تصحيح البصمة يعدّل سجل الحضور، وطلب السلفة يسجل سلفة.
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { moneyShort } from "../utils/fmt.js";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Requests() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [decidingId, setDecidingId] = useState(null);

  const [form, setForm] = useState({
    employeeId: "",
    type: "biofix",
    date: todayISO(),
    checkin: "",
    checkout: "",
    amount: "",
    subject: "",
    details: "",
  });

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const [reqSnap, empSnap] = await Promise.all([
        getDocs(getScopedQuery("hr_requests", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("employees", userRole, userCompanyId, currentUser?.uid)),
      ]);
      const data = reqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setRequests(data);
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

  function typeLabel(tp) {
    return tp === "biofix" ? t("req.biofix") : tp === "advance" ? t("req.advance") : t("req.general");
  }

  function summaryOf(r) {
    if (r.type === "biofix") return `${r.date || ""} • ${t("req.checkin")}: ${r.checkin || "—"} • ${t("req.checkout")}: ${r.checkout || "—"}`;
    if (r.type === "advance") return `${moneyShort(parseFloat(r.amount) || 0, locale)} ${t("currency")}`;
    return r.subject || r.details || "—";
  }

  async function addRequest(e) {
    e.preventDefault();
    if (!form.employeeId) {
      alert(t("common.fillRequired"));
      return;
    }
    if (form.type === "biofix" && !form.date) {
      alert(t("common.fillRequired"));
      return;
    }
    if (form.type === "advance" && !(parseFloat(form.amount) > 0)) {
      alert(t("common.fillRequired"));
      return;
    }
    if (form.type === "general" && !(form.subject.trim() || form.details.trim())) {
      alert(t("common.fillRequired"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "hr_requests"), {
        employeeId: form.employeeId,
        type: form.type,
        date: form.date || null,
        checkin: form.checkin || "",
        checkout: form.checkout || "",
        amount: form.type === "advance" ? parseFloat(form.amount) || 0 : 0,
        subject: form.subject.trim(),
        details: form.details.trim(),
        status: "pending",
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "hr_requests",
        itemId: docRef.id,
        details: `Request ${form.type} for employee ${form.employeeId}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setForm({
        employeeId: "", type: "biofix", date: todayISO(),
        checkin: "", checkout: "", amount: "", subject: "", details: "",
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  // تنفيذ الاعتماد: تصحيح بصمة → سجل حضور | طلب سلفة → سلفة مسجلة
  async function applyApproval(r) {
    const now = new Date().toISOString();
    if (r.type === "biofix" && r.date) {
      const emp = employees.find((e) => e.id === r.employeeId);
      const q = query(
        collection(db, "attendance"),
        where("companyId", "==", userCompanyId),
        where("employeeId", "==", r.employeeId),
        where("date", "==", r.date)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        await addDoc(collection(db, "attendance"), {
          employeeId: r.employeeId,
          employeeName: emp?.name || "",
          date: r.date,
          checkIn: r.checkin || "",
          checkOut: r.checkout || "",
          correctedVia: r.id,
          companyId: userCompanyId,
          createdBy: currentUser?.uid || null,
          createdAt: now,
        });
      } else {
        const patch = {};
        if (r.checkin) patch.checkIn = r.checkin;
        if (r.checkout) patch.checkOut = r.checkout;
        patch.correctedVia = r.id;
        if (Object.keys(patch).length > 1) {
          await updateDoc(doc(db, "attendance", snap.docs[0].id), patch);
        }
      }
    } else if (r.type === "advance" && parseFloat(r.amount) > 0) {
      await addDoc(collection(db, "employee_advances"), {
        employeeId: r.employeeId,
        amount: parseFloat(r.amount) || 0,
        date: r.date || todayISO(),
        reason: r.details || r.subject || t("req.advance"),
        fromRequest: r.id,
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: now,
      });
    }
  }

  async function decideRequest(r, status) {
    if (!isAdmin || decidingId) return;
    if (!window.confirm(status === "approved" ? t("req.approveQ") : t("req.rejectQ"))) return;
    setDecidingId(r.id);
    try {
      if (status === "approved") await applyApproval(r);
      await updateDoc(doc(db, "hr_requests", r.id), {
        status,
        decidedBy: currentUser?.uid || null,
        decidedAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "hr_requests",
        itemId: r.id,
        details: `Request ${status}: ${r.type} for employee ${r.employeeId}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setDecidingId(null);
  }

  async function deleteRequest(id, label) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "hr_requests", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "hr_requests",
        itemId: id,
        details: `Deleted request: ${label}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  const filtered = requests.filter((r) => {
    if (statusFilter !== "all" && (r.status || "pending") !== statusFilter) return false;
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return (
      empNameOf(r.employeeId).toLowerCase().includes(s) ||
      (r.subject || "").toLowerCase().includes(s) ||
      (r.details || "").toLowerCase().includes(s)
    );
  });

  const statusStyle = (st) =>
    st === "approved"
      ? { background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac" }
      : st === "rejected"
        ? { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }
        : { background: "#fffbeb", color: "#b45309", border: "1px solid #fcd34d" };

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
              <i className="fas fa-inbox" style={{ color: "#7c3aed", marginLeft: 10 }}></i>
              {t("req.title")}
            </h1>
            <p className="subtitle">{t("req.subtitle")}</p>
          </div>
        </div>

        <div className="form-card" style={{ borderTop: "4px solid #7c3aed" }}>
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#7c3aed" }}></i>
            {" "}{t("req.add")}
          </h3>
          <form onSubmit={addRequest}>
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
                  {t("req.type")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                >
                  <option value="biofix">{t("req.biofix")}</option>
                  <option value="advance">{t("req.advance")}</option>
                  <option value="general">{t("req.general")}</option>
                </select>
              </div>
              {form.type === "biofix" && (
                <>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                      {t("req.date")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      required
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                      {t("req.checkin")}
                    </label>
                    <input
                      type="time"
                      value={form.checkin}
                      onChange={(e) => setForm({ ...form, checkin: e.target.value })}
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                      {t("req.checkout")}
                    </label>
                    <input
                      type="time"
                      value={form.checkout}
                      onChange={(e) => setForm({ ...form, checkout: e.target.value })}
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                </>
              )}
              {form.type === "advance" && (
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                    {t("req.amount")} <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              )}
              {form.type === "general" && (
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                    {t("req.subject")}
                  </label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("req.details")}
                </label>
                <input
                  type="text"
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="btn-primary">
                <i className="fas fa-plus"></i> {t("req.add")}
              </button>
            </div>
          </form>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("req.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">{t("req.allStatus")}</option>
            <option value="pending">{t("req.pending")}</option>
            <option value="approved">{t("req.approved")}</option>
            <option value="rejected">{t("req.rejected")}</option>
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("req.list")}
            </h3>
            <span className="table-count">{filtered.length}</span>
          </div>
          <div className="table-wrapper" style={{ overflowX: "auto" }}>
            <Pagination
              data={filtered}
              pageSize={15}
              resetKey={`${searchTerm}-${statusFilter}`}
              empty={
                <div className="table-empty">
                  <i className="fas fa-inbox"></i>
                  <p>{t("req.empty")}</p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("emp.name")}</th>
                      <th>{t("req.type")}</th>
                      <th>{t("req.details")}</th>
                      <th>{t("req.status")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((r, i) => (
                      <tr key={r.id}>
                        <td>{start + i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{empNameOf(r.employeeId)}</td>
                        <td>{typeLabel(r.type)}</td>
                        <td style={{ fontSize: 12 }}>{summaryOf(r)}</td>
                        <td>
                          <span className="badge" style={statusStyle(r.status || "pending")}>
                            {(r.status || "pending") === "approved"
                              ? t("req.approved")
                              : (r.status || "pending") === "rejected"
                                ? t("req.rejected")
                                : t("req.pending")}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            {isAdmin && (r.status || "pending") === "pending" && (
                              <>
                                <button
                                  onClick={() => decideRequest(r, "approved")}
                                  className="btn-success btn-sm"
                                  title={t("req.approve")}
                                  disabled={decidingId === r.id}
                                >
                                  <i className="fas fa-check"></i>
                                </button>
                                <button
                                  onClick={() => decideRequest(r, "rejected")}
                                  className="btn-danger btn-sm"
                                  title={t("req.reject")}
                                  disabled={decidingId === r.id}
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                              </>
                            )}
                            {userCanDelete && (
                              <button
                                onClick={() => deleteRequest(r.id, `${empNameOf(r.employeeId)} ${r.type}`)}
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
