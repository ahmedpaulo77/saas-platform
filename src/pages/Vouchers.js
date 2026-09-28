// src/pages/Vouchers.js — سندات القبض والصرف
// سند قبض = فلوس داخلة (من عميل)، سند صرف = فلوس خارجة (لمورد).
// تُطبع كورقة رسمية، وتظهر في كشف الحساب (Statements) كحركة.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, addDoc, deleteDoc, doc, getDocs } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { fmtDate, moneyShort, num } from "../utils/fmt.js";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Vouchers() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [vouchers, setVouchers] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all"); // all | receipt | payment

  const [form, setForm] = useState({
    type: "receipt",
    partyType: "client",
    partyId: "",
    partyName: "",
    amount: "",
    method: "cash",
    date: todayISO(),
    notes: "",
  });

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [vSnap, cSnap, sSnap] = await Promise.all([
        getDocs(q("vouchers")),
        getDocs(q("clients")).catch(() => ({ docs: [] })),
        getDocs(q("suppliers")).catch(() => ({ docs: [] })),
      ]);
      setVouchers(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClients(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSuppliers(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const parties = form.partyType === "client" ? clients : form.partyType === "supplier" ? suppliers : [];

  async function addVoucher(e) {
    e.preventDefault();
    const amount = parseFloat(form.amount) || 0;
    if (!(amount > 0)) { alert(t("common.fillRequired")); return; }
    const picked = parties.find((p) => p.id === form.partyId);
    const partyName = (picked?.name || form.partyName || "").trim();
    if (!partyName) { alert(t("common.fillRequired")); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "vouchers"), {
        type: form.type === "payment" ? "payment" : "receipt",
        partyType: form.partyType,
        partyId: form.partyId || "",
        partyName,
        amount,
        method: form.method || "cash",
        date: form.date ? new Date(form.date + "T12:00:00").toISOString() : new Date().toISOString(),
        notes: (form.notes || "").trim(),
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      setForm({ type: "receipt", partyType: "client", partyId: "", partyName: "", amount: "", method: "cash", date: todayISO(), notes: "" });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setSubmitting(false);
  }

  async function deleteVoucher(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "vouchers", id));
      await fetchAll();
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
  }

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return vouchers
      .filter((v) => (filterType === "all" ? true : v.type === filterType))
      .filter((v) => !term || (v.partyName || "").toLowerCase().includes(term) || (v.notes || "").toLowerCase().includes(term))
      .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  }, [vouchers, searchTerm, filterType]);

  const totals = useMemo(() => {
    let receipts = 0, payments = 0;
    vouchers.forEach((v) => {
      const a = parseFloat(v.amount) || 0;
      if (v.type === "payment") payments += a;
      else receipts += a;
    });
    return { receipts, payments, net: receipts - payments };
  }, [vouchers]);

  function voucherNo(v) {
    return `#${String(v.id || "").slice(0, 6).toUpperCase()}`;
  }

  function handlePrint(v) {
    const isReceipt = v.type !== "payment";
    const rowsHtml = `
      <tr><td>${t("v.type")}</td><td>${isReceipt ? t("v.receipt") : t("v.payment")}</td></tr>
      <tr><td>${t("v.party")}</td><td>${v.partyName || "—"}</td></tr>
      <tr><td>${t("v.amount")}</td><td>${moneyShort(v.amount || 0, locale)} ${t("currency")}</td></tr>
      <tr><td>${t("v.method")}</td><td>${v.method === "bank" ? t("v.bank") : t("v.cash")}</td></tr>
      <tr><td>${t("v.date")}</td><td>${v.date ? fmtDate(v.date, locale) : "—"}</td></tr>
      <tr><td>${t("v.notes")}</td><td>${v.notes || "—"}</td></tr>`;
    const win = window.open("", "_blank", "width=700,height=600");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/>
      <style>body{font-family:Cairo,Arial;padding:24px;color:#0f172a;}h2{margin:0 0 4px;}.box{border:2px solid #6366f1;border-radius:12px;padding:20px;max-width:520px;margin:0 auto;}table{width:100%;border-collapse:collapse;margin-top:12px;}td{border:1px solid #e2e8f0;padding:8px;font-size:14px;}td:first-child{font-weight:700;background:#f8fafc;width:130px;}.sign{display:flex;justify-content:space-between;margin-top:36px;font-size:13px;color:#64748b;}</style>
      </head><body><div class="box">
      <h2>${isReceipt ? t("v.receipt") : t("v.payment")} ${voucherNo(v)}</h2>
      <div style="color:#64748b;font-size:12px;">${v.date ? fmtDate(v.date, locale) : ""}</div>
      <table>${rowsHtml}</table>
      <div class="sign"><span>${t("v.signCashier")}</span><span>${t("v.signReceiver")}</span></div>
      </div></body></html>`);
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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1><i className="fas fa-money-bill-transfer" style={{ color: "#6366f1", marginLeft: 10 }}></i>{t("v.title")}</h1>
            <p className="subtitle">{t("v.subtitle")}</p>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-arrow-down"></i></div>
            <div className="stat-value" style={{ fontSize: 22 }}>{moneyShort(totals.receipts, locale)}</div>
            <div className="stat-label">{t("v.totalReceipts")}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-arrow-up"></i></div>
            <div className="stat-value" style={{ fontSize: 22 }}>{moneyShort(totals.payments, locale)}</div>
            <div className="stat-label">{t("v.totalPayments")}</div>
          </div>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-scale-balanced"></i></div>
            <div className="stat-value" style={{ fontSize: 22 }}>{moneyShort(totals.net, locale)}</div>
            <div className="stat-label">{t("v.netBalance")}</div>
          </div>
        </div>

        <div className="form-card">
          <h3><i className="fas fa-plus-circle" style={{ color: "#6366f1" }}></i> {t("v.add")}</h3>
          <form onSubmit={addVoucher}>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("v.type")}</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="receipt">{t("v.receipt")}</option>
                  <option value="payment">{t("v.payment")}</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("v.partyType")}</label>
                <select value={form.partyType} onChange={(e) => setForm({ ...form, partyType: e.target.value, partyId: "", partyName: "" })}>
                  <option value="client">{t("v.client")}</option>
                  <option value="supplier">{t("v.supplier")}</option>
                  <option value="other">{t("v.other")}</option>
                </select>
              </div>
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
              {form.partyType === "other" ? (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t("v.partyName")}</label>
                  <input type="text" placeholder={t("v.partyNamePh")} value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} />
                </div>
              ) : (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>{t("v.chooseParty")}</label>
                  <select value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
                    <option value="">— {t("v.chooseParty")} —</option>
                    {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("v.amount")}</label>
                <input type="number" step="0.01" min="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("v.method")}</label>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="cash">{t("v.cash")}</option>
                  <option value="bank">{t("v.bank")}</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("v.date")}</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>{t("v.notes")}</label>
              <input type="text" placeholder={t("v.notesPh")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? <><i className="fas fa-spinner fa-spin"></i> {t("common.adding")}</> : <><i className="fas fa-plus"></i> {t("v.add")}</>}
              </button>
            </div>
          </form>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper">
            <i className="fas fa-search search-icon"></i>
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t("common.search")} />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">{t("common.all")}</option>
            <option value="receipt">{t("v.receipt")}</option>
            <option value="payment">{t("v.payment")}</option>
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t("v.list")}</h3>
            <span className="table-count">{num(filtered.length, locale)}</span>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty"><i className="fas fa-money-bill-transfer"></i><p>{t("v.noData")}</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("v.type")}</th>
                    <th>{t("v.party")}</th>
                    <th>{t("v.amount")}</th>
                    <th>{t("v.method")}</th>
                    <th>{t("common.date")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => (
                    <tr key={v.id}>
                      <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>{voucherNo(v)}</td>
                      <td>
                        <span className={`badge ${v.type === "payment" ? "badge-expired" : "badge-paid"}`}>
                          {v.type === "payment" ? t("v.payment") : t("v.receipt")}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{v.partyName || "—"}</td>
                      <td style={{ fontWeight: 700 }}>{moneyShort(v.amount || 0, locale)} {t("currency")}</td>
                      <td>{v.method === "bank" ? t("v.bank") : t("v.cash")}</td>
                      <td style={{ color: "var(--gray-500)", fontSize: 13 }}>{v.date ? fmtDate(v.date, locale) : "—"}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn-secondary btn-sm" onClick={() => handlePrint(v)} title={t("v.printTitle")}>
                            <i className="fas fa-print"></i>
                          </button>
                          {isAdmin && (
                            <button className="btn-danger btn-sm" onClick={() => deleteVoucher(v.id)} title={t("common.delete")}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
