// src/pages/MyHr.jsx - بوابة الموظف (موارد بشرية)
// الموظف المربوط حسابه (employees.userId) يشوف: حضوره + رصيد إجازاته + سلفه + آخر مرتب + طلباته + طلب إجازة
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { moneyShort } from "../utils/fmt.js";
import { ANNUAL_BALANCE } from "./Leaves.jsx";

const todayISO = () => new Date().toISOString().slice(0, 10);
const curMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function MyHr() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [slips, setSlips] = useState([]);
  const [myRequests, setMyRequests] = useState([]);

  const [leaveForm, setLeaveForm] = useState({
    type: "annual",
    fromDate: todayISO(),
    toDate: todayISO(),
    reason: "",
  });

  const fetchAll = useCallback(async () => {
    if (!userCompanyId || !currentUser?.uid) {
      setLoading(false);
      return;
    }
    try {
      const empSnap = await getDocs(
        getScopedQuery("employees", userRole, userCompanyId, currentUser?.uid)
      ).catch(() => ({ docs: [] }));
      const mine = empSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .find((e) => e.userId === currentUser.uid) || null;
      setEmployee(mine);
      if (!mine) {
        setLoading(false);
        return;
      }
      const [attSnap, leaveSnap, advSnap, slipSnap, reqSnap] = await Promise.all([
        getDocs(getScopedQuery("attendance", userRole, userCompanyId, currentUser?.uid)).catch(() => ({ docs: [] })),
        getDocs(getScopedQuery("leaves", userRole, userCompanyId, currentUser?.uid)).catch(() => ({ docs: [] })),
        getDocs(getScopedQuery("employee_advances", userRole, userCompanyId, currentUser?.uid)).catch(() => ({ docs: [] })),
        getDocs(getScopedQuery("payrolls", userRole, userCompanyId, currentUser?.uid)).catch(() => ({ docs: [] })),
        getDocs(getScopedQuery("hr_requests", userRole, userCompanyId, currentUser?.uid)).catch(() => ({ docs: [] })),
      ]);
      // ملاحظة الخصوصية: نفلتر على الموظف المربوط فقط — لا يعرض بيانات زملائه
      const onlyMine = (arr) => arr.filter((x) => x.employeeId === mine.id);
      setAttendance(onlyMine(attSnap.docs.map((d) => ({ id: d.id, ...d.data() }))));
      setLeaves(onlyMine(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() }))));
      setAdvances(onlyMine(advSnap.docs.map((d) => ({ id: d.id, ...d.data() }))));
      setSlips(onlyMine(slipSnap.docs.map((d) => ({ id: d.id, ...d.data() }))));
      setMyRequests(onlyMine(reqSnap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const month = curMonthKey();
  const year = new Date().getFullYear();

  const monthAttendance = useMemo(
    () =>
      attendance
        .filter((r) => String(r.date || "").startsWith(month))
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))),
    [attendance, month]
  );
  const balance = useMemo(() => {
    const used = leaves
      .filter((l) => l.type === "annual" && l.status === "approved" && String(l.fromDate || "").startsWith(String(year)))
      .reduce((s, l) => s + (parseFloat(l.days) || 0), 0);
    return Math.max(0, ANNUAL_BALANCE - used);
  }, [leaves, year]);
  const monthAdvances = useMemo(
    () =>
      advances
        .filter((a) => String(a.date || a.createdAt || "").startsWith(month))
        .reduce((s, a) => s + (parseFloat(a.amount) || 0), 0),
    [advances, month]
  );
  const lastSlip = useMemo(() => {
    const sorted = [...slips].sort((a, b) => String(b.month || "").localeCompare(String(a.month || "")));
    return sorted[0] || null;
  }, [slips]);

  async function requestLeave(e) {
    e.preventDefault();
    if (!employee || !leaveForm.fromDate || !leaveForm.toDate) {
      alert(t("common.fillRequired"));
      return;
    }
    const ms = new Date(leaveForm.toDate) - new Date(leaveForm.fromDate);
    const days = isNaN(ms) || ms < 0 ? 0 : Math.round(ms / 86400000) + 1;
    if (!(days > 0)) {
      alert(t("leave.badDates"));
      return;
    }
    if (leaveForm.type === "annual" && days > balance) {
      alert(t("leave.noBalance"));
      return;
    }
    try {
      await addDoc(collection(db, "leaves"), {
        employeeId: employee.id,
        type: leaveForm.type,
        fromDate: leaveForm.fromDate,
        toDate: leaveForm.toDate,
        days,
        reason: leaveForm.reason.trim(),
        status: "pending",
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "leaves",
        itemId: "-",
        details: `Self leave request by employee ${employee.id}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setLeaveForm({ type: "annual", fromDate: todayISO(), toDate: todayISO(), reason: "" });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
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
              <i className="fas fa-id-card" style={{ color: "#1e3a8a", marginLeft: 10 }}></i>
              {t("myhr.title")}
            </h1>
            <p className="subtitle">
              {employee ? `${employee.name} — ${t("myhr.subtitle")}` : t("myhr.subtitle")}
            </p>
          </div>
        </div>

        {!employee ? (
          <div className="table-empty">
            <i className="fas fa-link"></i>
            <p>{t("myhr.notLinked")}</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 22px", textAlign: "center", flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#059669" }}>{monthAttendance.length}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{t("myhr.attendance")}</div>
              </div>
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 22px", textAlign: "center", flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#1e3a8a" }}>{balance}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{t("myhr.balance")}</div>
              </div>
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 22px", textAlign: "center", flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#b45309" }}>{moneyShort(monthAdvances, locale)}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{t("myhr.advances")}</div>
              </div>
              <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 12, padding: "12px 22px", textAlign: "center", flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#1d4ed8" }}>
                  {lastSlip ? `${moneyShort(lastSlip.net || 0, locale)}` : "—"}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
                  {t("myhr.lastSlip")}{lastSlip ? ` (${lastSlip.month})` : ""}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
              <div className="table-container">
                <div className="table-header">
                  <h3>🗓️ {t("myhr.attendance")} — {month}</h3>
                  <span className="table-count">{monthAttendance.length}</span>
                </div>
                <div className="table-wrapper" style={{ maxHeight: 320, overflowY: "auto" }}>
                  {monthAttendance.length === 0 ? (
                    <div className="table-empty"><p>—</p></div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>{t("common.date")}</th>
                          <th>{t("myhr.present")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthAttendance.map((r) => (
                          <tr key={r.id}>
                            <td>{r.date}</td>
                            <td style={{ fontSize: 12 }}>
                              ✅ {r.checkIn || "—"}{r.checkOut ? ` → ${r.checkOut}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div>
                <div className="form-card" style={{ borderTop: "4px solid #059669" }}>
                  <h3>
                    <i className="fas fa-umbrella-beach" style={{ color: "#059669" }}></i>
                    {" "}{t("leave.add")}
                  </h3>
                  <form onSubmit={requestLeave}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                          {t("leave.type")}
                        </label>
                        <select
                          value={leaveForm.type}
                          onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
                          style={{ width: "100%", boxSizing: "border-box" }}
                        >
                          <option value="annual">{t("leave.annual")} ({balance})</option>
                          <option value="sick">{t("leave.sick")}</option>
                          <option value="unpaid">{t("leave.unpaid")}</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                          {t("leave.reason")}
                        </label>
                        <input
                          type="text"
                          value={leaveForm.reason}
                          onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                          style={{ width: "100%", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                          {t("leave.from")}
                        </label>
                        <input
                          type="date"
                          value={leaveForm.fromDate}
                          onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })}
                          style={{ width: "100%", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                          {t("leave.to")}
                        </label>
                        <input
                          type="date"
                          min={leaveForm.fromDate}
                          value={leaveForm.toDate}
                          onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })}
                          style={{ width: "100%", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button type="submit" className="btn-primary">
                        <i className="fas fa-paper-plane"></i> {t("leave.add")}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="table-container">
                  <div className="table-header">
                    <h3>📥 {t("myhr.myRequests")}</h3>
                    <span className="table-count">{myRequests.length + leaves.length}</span>
                  </div>
                  <div className="table-wrapper" style={{ maxHeight: 220, overflowY: "auto" }}>
                    {[...leaves, ...myRequests].length === 0 ? (
                      <div className="table-empty"><p>—</p></div>
                    ) : (
                      <table>
                        <tbody>
                          {[...leaves, ...myRequests]
                            .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
                            .slice(0, 10)
                            .map((r) => (
                              <tr key={r.id}>
                                <td style={{ fontSize: 12 }}>
                                  {r.type === "annual" || r.type === "sick" || r.type === "unpaid"
                                    ? `${r.fromDate || ""} → ${r.toDate || ""} (${r.days ?? 0})`
                                    : (r.subject || r.details || r.type)}
                                </td>
                                <td>
                                  <span
                                    className="badge"
                                    style={
                                      (r.status || "pending") === "approved"
                                        ? { background: "#f0fdf4", color: "#15803d" }
                                        : (r.status || "pending") === "rejected"
                                          ? { background: "#fef2f2", color: "#dc2626" }
                                          : { background: "#fffbeb", color: "#b45309" }
                                    }
                                  >
                                    {r.status || "pending"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
