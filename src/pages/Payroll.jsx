// src/pages/Payroll.jsx - المرتبات (موارد بشرية)
// شيت شهري: راتب + أوفرتايم − سلف الشهر − جزاءات الشهر − خصم الغياب = صافي + حفظ + طباعة مفردات
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { moneyShort } from "../utils/fmt.js";

const curMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

export default function Payroll() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();

  const [month, setMonth] = useState(curMonthKey());
  const [employees, setEmployees] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  // تعديلات يدوية للشهر: { [employeeId]: { overtime, absenceDays } }
  const [edits, setEdits] = useState({});

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const [empSnap, advSnap, penSnap, slipSnap] = await Promise.all([
        getDocs(getScopedQuery("employees", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("employee_advances", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("employee_penalties", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("payrolls", userRole, userCompanyId, currentUser?.uid)),
      ]);
      const emps = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emps.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
      setEmployees(emps);
      setAdvances(advSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPenalties(penSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSlips(slipSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const inMonth = useCallback((dateStr) => String(dateStr || "").startsWith(month), [month]);

  const rows = useMemo(() => {
    const slipsByEmp = {};
    slips.filter((s) => s.month === month).forEach((s) => {
      slipsByEmp[s.employeeId] = s;
    });
    return employees.map((e) => {
      const salary = parseFloat(e.salary) || 0;
      const advTotal = round2(
        advances
          .filter((a) => a.employeeId === e.id && inMonth(a.date || a.createdAt))
          .reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
      );
      const penTotal = round2(
        penalties
          .filter((p) => p.employeeId === e.id && inMonth(p.date || p.createdAt))
          .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      );
      const saved = slipsByEmp[e.id] || null;
      const edit = edits[e.id] || {};
      const overtime = saved ? parseFloat(saved.overtime) || 0 : parseFloat(edit.overtime) || 0;
      const absenceDays = saved ? parseFloat(saved.absenceDays) || 0 : parseFloat(edit.absenceDays) || 0;
      const absenceDeduction = round2((salary / 30) * absenceDays);
      const net = round2(salary + overtime - advTotal - penTotal - absenceDeduction);
      return { emp: e, salary, advTotal, penTotal, overtime, absenceDays, absenceDeduction, net, saved };
    });
  }, [employees, advances, penalties, slips, edits, month, inMonth]);

  const totals = useMemo(
    () => rows.reduce(
      (s, r) => ({
        salary: round2(s.salary + r.salary),
        overtime: round2(s.overtime + r.overtime),
        adv: round2(s.adv + r.advTotal),
        pen: round2(s.pen + r.penTotal),
        abs: round2(s.abs + r.absenceDeduction),
        net: round2(s.net + r.net),
      }),
      { salary: 0, overtime: 0, adv: 0, pen: 0, abs: 0, net: 0 }
    ),
    [rows]
  );

  function setEdit(empId, field, value) {
    setEdits((prev) => ({ ...prev, [empId]: { ...(prev[empId] || {}), [field]: value } }));
  }

  async function saveSlip(row) {
    if (savingId) return;
    setSavingId(row.emp.id);
    try {
      const payload = {
        employeeId: row.emp.id,
        month,
        salary: row.salary,
        overtime: row.overtime,
        advances: row.advTotal,
        penalties: row.penTotal,
        absenceDays: row.absenceDays,
        absenceDeduction: row.absenceDeduction,
        net: row.net,
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      };
      if (row.saved) {
        await updateDoc(doc(db, "payrolls", row.saved.id), payload);
        await logActivity({
          actionType: "UPDATE", collectionName: "payrolls", itemId: row.saved.id,
          details: `Updated payroll slip for ${row.emp.name} (${month})`,
          user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
        });
      } else {
        const docRef = await addDoc(collection(db, "payrolls"), payload);
        await logActivity({
          actionType: "CREATE", collectionName: "payrolls", itemId: docRef.id,
          details: `Created payroll slip for ${row.emp.name} (${month})`,
          user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
        });
      }
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setSavingId(null);
  }

  function printSlip(row) {
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const line = (label, val, bold, color) =>
      `<div style="display:flex;justify-content:space-between;padding:5px 2px;border-bottom:1px dashed #ccc;${bold ? "font-weight:900;font-size:16px;" : ""}${color ? `color:${color};` : ""}"><span>${label}</span><span dir="ltr">${Number(val || 0).toFixed(2)}</span></div>`;
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/><title>${esc(t("pay.slip"))}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial;padding:24px;max-width:420px;margin:auto}h2{text-align:center;margin-bottom:4px}.sub{text-align:center;color:#64748b;font-size:13px;margin-bottom:14px}@media print{@page{margin:10mm}}</style>
</head><body>
<h2>🧾 ${esc(t("pay.slip"))}</h2>
<div class="sub">${esc(row.emp.name)} • ${esc(month)} • ${esc(new Date().toLocaleDateString(locale))}</div>
${line(esc(t("emp.salary")), row.salary)}
${line(esc(t("pay.overtime")) + " (+)", row.overtime, false, "#059669")}
${line(esc(t("emp.totalAdvances")) + " (−)", row.advTotal, false, "#b45309")}
${line(esc(t("emp.totalPenalties")) + " (−)", row.penTotal, false, "#dc2626")}
${line(`${esc(t("pay.absence"))} (${row.absenceDays} ${esc(t("pay.days"))}) (−)`, row.absenceDeduction, false, "#dc2626")}
${line("✅ " + esc(t("emp.net")), row.net, true, "#1d4ed8")}
<script>setTimeout(function(){window.print();},300);<\/script>
</body></html>`;
    const win = window.open("", "_blank", "width=500,height=700");
    if (!win) {
      alert(t("pay.popupBlocked"));
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
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
              <i className="fas fa-money-check-dollar" style={{ color: "#1d4ed8", marginLeft: 10 }}></i>
              {t("pay.title")}
            </h1>
            <p className="subtitle">{t("pay.subtitle")}</p>
          </div>
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value);
                setEdits({});
              }
            }}
            style={{ padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14 }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {[
            { label: t("emp.salary"), val: totals.salary, color: "#0f172a" },
            { label: t("pay.overtime"), val: totals.overtime, color: "#059669" },
            { label: t("emp.totalAdvances"), val: totals.adv, color: "#b45309" },
            { label: t("emp.totalPenalties"), val: totals.pen, color: "#dc2626" },
            { label: t("emp.net"), val: totals.net, color: "#1d4ed8" },
          ].map((b, i) => (
            <div key={i} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 20px", textAlign: "center", flex: 1, minWidth: 130 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: b.color }}>{moneyShort(b.val, locale)} {t("currency")}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{b.label}</div>
            </div>
          ))}
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("pay.sheet")} — {month}
            </h3>
            <span className="table-count">{rows.length}</span>
          </div>
          <div className="table-wrapper" style={{ overflowX: "auto" }}>
            {rows.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-users"></i>
                <p>{t("emp.empty")}</p>
              </div>
            ) : (
              <table style={{ minWidth: 860 }}>
                <thead>
                  <tr>
                    <th>{t("emp.name")}</th>
                    <th>{t("emp.salary")}</th>
                    <th>{t("pay.overtime")}</th>
                    <th>{t("pay.absenceDays")}</th>
                    <th>{t("emp.totalAdvances")}</th>
                    <th>{t("emp.totalPenalties")}</th>
                    <th>{t("emp.net")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.emp.id} style={r.saved ? { background: "#f0fdf4" } : undefined}>
                      <td style={{ fontWeight: 700 }}>
                        {r.emp.name}
                        {r.saved && <span className="badge" style={{ background: "#dcfce7", color: "#15803d", marginRight: 6, fontSize: 10 }}>✓</span>}
                      </td>
                      <td style={{ fontWeight: 700 }}>{moneyShort(r.salary, locale)}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={edits[r.emp.id]?.overtime ?? r.overtime ?? ""}
                          placeholder="0"
                          onChange={(e) => setEdit(r.emp.id, "overtime", e.target.value)}
                          style={{ width: 90, padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, textAlign: "center" }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={edits[r.emp.id]?.absenceDays ?? r.absenceDays ?? ""}
                          placeholder="0"
                          onChange={(e) => setEdit(r.emp.id, "absenceDays", e.target.value)}
                          style={{ width: 70, padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, textAlign: "center" }}
                        />
                      </td>
                      <td style={{ color: "#b45309", fontWeight: 700 }}>{moneyShort(r.advTotal, locale)}</td>
                      <td style={{ color: "#dc2626", fontWeight: 700 }}>{moneyShort(r.penTotal, locale)}</td>
                      <td style={{ fontWeight: 900, color: "#1d4ed8" }}>{moneyShort(r.net, locale)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => saveSlip(r)}
                            className="btn-sm btn-secondary"
                            title={t("common.save")}
                            disabled={savingId === r.emp.id}
                          >
                            <i className="fas fa-save"></i>
                          </button>
                          <button
                            onClick={() => printSlip(r)}
                            className="btn-sm btn-secondary"
                            title={t("in.print")}
                          >
                            <i className="fas fa-print"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
          💡 {t("pay.note")}
        </p>
      </div>
    </div>
  );
}
