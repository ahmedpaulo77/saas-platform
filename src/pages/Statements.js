// src/pages/Statements.js - كشف حساب عميل / مورد (فواتير + مرتجعات + أرصدة)
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import { getAvailableModules } from "../utils/modules";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

export default function Statements() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const available = getAvailableModules(userIndustry, userRole);
  const isClinic = userIndustry === "clinic";
  const isRealEstate = userIndustry === "real_estate";
  // تبويب العملاء يظهر لو فيه عملاء (أو مرضى للعيادة)، والموردين لو فيه موردين
  const hasClientsTab = isClinic || available.has("clients");
  const hasSuppliersTab = available.has("suppliers");
  const entityCollection = isClinic ? "patients" : "clients";
  const entityLabel = isClinic ? "المريض" : "العميل";

  const [tab, setTab] = useState("clients"); // clients | suppliers
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  const [entityId, setEntityId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDateStr, setToDateStr] = useState("");

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [cSnap, sSnap, iSnap, pSnap, rSnap] = await Promise.all([
        getDocs(q(entityCollection)),
        getDocs(q("suppliers")),
        getDocs(q("invoices")),
        getDocs(q("purchases")),
        getDocs(q("returns")),
      ]);
      setClients(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSuppliers(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setInvoices(iSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPurchases(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setReturns(rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [userRole, userCompanyId, currentUser?.uid, entityCollection]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { setEntityId(""); }, [tab]);
  // لو التبويب الحالي مش متاح للمجال (مثلاً موردين في العيادة) حوّل للمتاح
  useEffect(() => {
    if (tab === "clients" && !hasClientsTab && hasSuppliersTab) setTab("suppliers");
    if (tab === "suppliers" && !hasSuppliersTab && hasClientsTab) setTab("clients");
  }, [tab, hasClientsTab, hasSuppliersTab]);

  const entities = tab === "clients" ? clients : suppliers;

  const movements = useMemo(() => {
    if (!entityId) return [];
    const from = fromDate ? new Date(fromDate + "T00:00:00") : null;
    const to = toDateStr ? new Date(toDateStr + "T23:59:59") : null;
    const inRange = (d) => {
      const dt = toDate(d.date || d.createdAt);
      if (!dt) return true;
      if (from && dt < from) return false;
      if (to && dt > to) return false;
      return true;
    };
    const rows = [];
    if (tab === "clients") {
      invoices.filter((i) => i.clientId === entityId && !i.isReturn && inRange(i)).forEach((i) => {
        const amount = parseFloat(i.amount) || 0;
        const paid = parseFloat(i.paidAmount) || 0;
        rows.push({ date: i.date || i.createdAt, type: "فاتورة بيع", ref: i.id.slice(0, 6).toUpperCase(), debit: amount, credit: 0, paid, remaining: amount - paid });
      });
      returns.filter((r) => r.kind === "sale" && r.entityId === entityId && inRange(r)).forEach((r) => {
        rows.push({ date: r.date || r.createdAt, type: "مرتجع بيع", ref: (r.refId || "").slice(0, 6).toUpperCase(), debit: 0, credit: parseFloat(r.amount) || 0, paid: 0, remaining: 0 });
      });
    } else {
      purchases.filter((p) => p.supplierId === entityId && inRange(p)).forEach((p) => {
        const amount = parseFloat(p.amount) || 0;
        const paid = parseFloat(p.paidAmount) || 0;
        rows.push({ date: p.date || p.createdAt, type: "فاتورة شراء", ref: p.id.slice(0, 6).toUpperCase(), debit: amount, credit: 0, paid, remaining: amount - paid });
      });
      returns.filter((r) => r.kind === "purchase" && r.entityId === entityId && inRange(r)).forEach((r) => {
        rows.push({ date: r.date || r.createdAt, type: "مرتجع شراء", ref: (r.refId || "").slice(0, 6).toUpperCase(), debit: 0, credit: parseFloat(r.amount) || 0, paid: 0, remaining: 0 });
      });
    }
    rows.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    return rows;
  }, [tab, entityId, invoices, purchases, returns, fromDate, toDateStr]);

  const totals = useMemo(() => {
    const debit = movements.reduce((s, m) => s + (m.debit || 0), 0);
    const credit = movements.reduce((s, m) => s + (m.credit || 0), 0);
    const paid = movements.reduce((s, m) => s + (m.paid || 0), 0);
    return { debit, credit, paid, balance: debit - paid - credit };
  }, [movements]);

  const entityName = entities.find((e) => e.id === entityId)?.name || "";

  function handlePrint() {
    const rowsHtml = movements.map((m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${m.date ? new Date(m.date).toLocaleDateString("ar-EG") : "—"}</td>
        <td>${m.type}</td>
        <td>${m.ref || "—"}</td>
        <td>${m.debit ? m.debit.toLocaleString() : "—"}</td>
        <td>${m.credit ? m.credit.toLocaleString() : "—"}</td>
        <td>${m.paid ? m.paid.toLocaleString() : "—"}</td>
      </tr>`).join("");
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/>
      <style>body{font-family:Cairo,Arial;padding:20px;}table{width:100%;border-collapse:collapse;font-size:13px;}th,td{border:1px solid #ccc;padding:6px;text-align:center;}th{background:#f1f5f9;}</style>
      </head><body>
      <h2>كشف حساب ${tab === "clients" ? entityLabel : "مورد"}: ${entityName}</h2>
      <div>الفترة: ${fromDate || "..."} → ${toDateStr || "..."}</div>
      <table style="margin-top:12px"><thead><tr><th>#</th><th>التاريخ</th><th>الحركة</th><th>مرجع</th><th>مدين</th><th>دائن (مرتجع)</th><th>مدفوع</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <div style="margin-top:12px;font-weight:bold;">إجمالي الفواتير: ${totals.debit.toLocaleString()} — المدفوع: ${totals.paid.toLocaleString()} — المرتجع: ${totals.credit.toLocaleString()} — الرصيد المتبقي: ${totals.balance.toLocaleString()} ${t("currency")}</div>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content"><div className="loading"><div className="spinner"></div>{t("common.loading")}</div></div>
      </div>
    );
  }

  if (isRealEstate) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="header">
            <div>
              <h1><i className="fas fa-file-invoice-dollar" style={{ color: "#6366f1", marginLeft: 10 }}></i>كشف حساب</h1>
              <p className="subtitle">فواتير + مرتجعات + الرصيد لكل عميل ومورد</p>
            </div>
          </div>
          <div className="card" style={{ textAlign: "center", padding: "30px" }}>
            <p style={{ color: "#64748b" }}>كشف الحساب غير متاح لنشاط العقارات (التعامل عبر البائعين والمشترين بدون فواتير).</p>
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
            <h1><i className="fas fa-file-invoice-dollar" style={{ color: "#6366f1", marginLeft: 10 }}></i>كشف حساب</h1>
            <p className="subtitle">فواتير + مرتجعات + الرصيد {hasSuppliersTab ? "لكل عميل ومورد" : `لكل ${entityLabel}`}</p>
          </div>
          {movements.length > 0 && (
            <button onClick={handlePrint} className="btn-secondary"><i className="fas fa-print"></i> طباعة</button>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            ...(hasClientsTab ? [{ v: "clients", l: isClinic ? "🧑‍⚕️ المرضى" : "👥 العملاء" }] : []),
            ...(hasSuppliersTab ? [{ v: "suppliers", l: "🚚 الموردين" }] : []),
          ].map((tb) => (
            <button key={tb.v} type="button" onClick={() => setTab(tb.v)}
              style={{ flex: 1, padding: "10px", fontSize: 14, fontWeight: 700, border: `2px solid ${tab === tb.v ? "#6366f1" : "#e2e8f0"}`, borderRadius: 10, background: tab === tb.v ? "#eef2ff" : "white", color: tab === tb.v ? "#4338ca" : "#64748b", cursor: "pointer" }}>
              {tb.l}
            </button>
          ))}
        </div>

        <div className="form-card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                {tab === "clients" ? `${entityLabel} *` : "المورد *"}
              </label>
              <select value={entityId} onChange={(e) => setEntityId(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white", boxSizing: "border-box" }}>
                <option value="">— اختر —</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.phone ? ` — ${e.phone}` : ""}</option>
                ))}
              </select>
              {entities.length === 0 && (
                <div style={{ fontSize: 12, color: "#d97706", marginTop: 6 }}>
                  لا يوجد {tab === "clients" ? (isClinic ? "مرضى" : "عملاء") : "موردون"} مسجلون — أضف أولاً من صفحة {tab === "clients" ? (isClinic ? "المرضى" : "العملاء") : "الموردين"}.
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>من</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>إلى</label>
              <input type="date" value={toDateStr} onChange={(e) => setToDateStr(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
            </div>
          </div>
        </div>

        {entityId && (
          <>
            <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", marginBottom: 20 }}>
              <div className="stat-card indigo"><div className="stat-icon"><i className="fas fa-file-invoice"></i></div><div className="stat-value" style={{ fontSize: 17 }}>{totals.debit.toLocaleString()}</div><div className="stat-label">إجمالي الفواتير</div></div>
              <div className="stat-card green"><div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div><div className="stat-value" style={{ fontSize: 17 }}>{totals.paid.toLocaleString()}</div><div className="stat-label">المدفوع</div></div>
              <div className="stat-card amber"><div className="stat-icon"><i className="fas fa-undo"></i></div><div className="stat-value" style={{ fontSize: 17 }}>{totals.credit.toLocaleString()}</div><div className="stat-label">المرتجع</div></div>
              <div className="stat-card red"><div className="stat-icon"><i className="fas fa-wallet"></i></div><div className="stat-value" style={{ fontSize: 17 }}>{totals.balance.toLocaleString()}</div><div className="stat-label">الرصيد المتبقي ({t("currency")})</div></div>
            </div>

            <div className="table-container">
              <div className="table-header"><h3><i className="fas fa-list"></i> الحركات ({movements.length})</h3><span>{entityName}</span></div>
              {movements.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px" }}><p>لا توجد حركات في الفترة</p></div>
              ) : (
                <table>
                  <thead><tr><th>#</th><th>التاريخ</th><th>الحركة</th><th>مرجع</th><th>مدين</th><th>دائن (مرتجع)</th><th>مدفوع</th><th>المتبقي</th></tr></thead>
                  <tbody>
                    {movements.map((m, i) => (
                      <tr key={i}>
                        <td style={{ color: "#94a3b8" }}>{i + 1}</td>
                        <td>{m.date ? new Date(m.date).toLocaleDateString("ar-EG") : "—"}</td>
                        <td><span style={{ background: m.credit ? "#fffbeb" : "#eef2ff", color: m.credit ? "#d97706" : "#4338ca", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{m.type}</span></td>
                        <td style={{ fontFamily: "monospace" }}>{m.ref || "—"}</td>
                        <td style={{ fontWeight: 700 }}>{m.debit ? m.debit.toLocaleString() : "—"}</td>
                        <td style={{ fontWeight: 700, color: "#d97706" }}>{m.credit ? m.credit.toLocaleString() : "—"}</td>
                        <td style={{ color: "#16a34a" }}>{m.paid ? m.paid.toLocaleString() : "—"}</td>
                        <td style={{ fontWeight: 700 }}>{m.remaining ? m.remaining.toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
