// src/pages/SalesReps.jsx — مناديب المبيعات (السيلز) + عمولة 1% على إجمالي فواتير الشهر
// المندوب بيانات تعريفية فقط (ليس حساب دخول). الفواتير تُنسب له عبر salesRepId
// وتُحسب العمولة = إجمالي فواتير الشهر المعتمدة × نسبته.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { moneyShort } from "../utils/fmt.js";

function monthKey(d) {
  const dt = d ? new Date(d) : null;
  if (!dt || isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${dt.getMonth()}`;
}

export default function SalesReps() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [reps, setReps] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRep, setEditingRep] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", code: "", commissionRate: "1" });
  const [saving, setSaving] = useState(false);
  const userCanDelete = canDelete(userRole);

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) { setLoading(false); return; }
    try {
      const [repsSnap, invSnap, cliSnap] = await Promise.all([
        getDocs(getScopedQuery("sales_reps", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid)),
      ]);
      setReps(repsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setInvoices(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClients(cliSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error fetching sales reps:", e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const curMonth = monthKey(new Date());

  // فواتير الشهر الحالي المعتمدة لكل مندوب
  const repStats = useMemo(() => {
    const map = {};
    reps.forEach((r) => { map[r.id] = { count: 0, total: 0, invoices: [] }; });
    invoices.forEach((inv) => {
      if (!inv.salesRepId || !map[inv.salesRepId]) return;
      if ((inv.approval || "validated") !== "validated") return;
      if (monthKey(inv.date || inv.createdAt) !== curMonth) return;
      const amt = parseFloat(inv.amount) || 0;
      map[inv.salesRepId].count += 1;
      map[inv.salesRepId].total += amt;
      map[inv.salesRepId].invoices.push(inv);
    });
    Object.values(map).forEach((s) => {
      s.invoices.sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
    });
    return map;
  }, [reps, invoices, curMonth]);

  const clientNameOf = (id) => clients.find((c) => c.id === id)?.name || "—";

  const openAdd = () => {
    setEditingRep(null);
    setForm({ name: "", phone: "", code: "", commissionRate: "1" });
    setShowForm(true);
  };

  const openEdit = (rep) => {
    setEditingRep(rep);
    setForm({
      name: rep.name || "",
      phone: rep.phone || "",
      code: rep.code || "",
      commissionRate: String(rep.commissionRate ?? 1),
    });
    setShowForm(true);
  };

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        code: form.code.trim(),
        commissionRate: parseFloat(form.commissionRate) || 0,
      };
      if (editingRep) {
        await updateDoc(doc(db, "sales_reps", editingRep.id), payload);
      } else {
        await addDoc(collection(db, "sales_reps"), {
          ...payload,
          companyId: userCompanyId,
          createdBy: currentUser?.uid || null,
          createdAt: new Date().toISOString(),
        });
      }
      setShowForm(false);
      setEditingRep(null);
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(t("sr.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "sales_reps", id));
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  const filtered = reps.filter((r) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (r.name || "").toLowerCase().includes(q) ||
      (r.phone || "").includes(q) ||
      (r.code || "").toLowerCase().includes(q);
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
              <i className="fas fa-user-tie" style={{ color: "#6366f1", marginLeft: 10 }}></i>
              {t("sr.title")}
            </h1>
            <p className="subtitle">{t("sr.subtitle")} — {t("sr.month")}</p>
          </div>
          <button onClick={openAdd} className="btn-primary">
            <i className="fas fa-plus"></i> {t("sr.add")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder={t("sr.name")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: "12px 16px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "15px", outline: "none" }}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <i className="fas fa-user-tie" style={{ color: "#94a3b8" }}></i>
            </div>
            <h3>{t("sr.empty")}</h3>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("sr.name")}</th>
                  <th>{t("sr.phone")}</th>
                  <th>{t("sr.code")}</th>
                  <th>{t("sr.commission")}</th>
                  <th>{t("sr.invoices")}</th>
                  <th>{t("sr.totalSales")}</th>
                  <th>{t("sr.commissionDue")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rep, i) => {
                  const st = repStats[rep.id] || { count: 0, total: 0, invoices: [] };
                  const rate = parseFloat(rep.commissionRate) || 0;
                  const due = (st.total * rate) / 100;
                  const isOpen = expandedId === rep.id;
                  return (
                    <React.Fragment key={rep.id}>
                      <tr>
                        <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{rep.name}</td>
                        <td style={{ direction: "ltr" }}>{rep.phone || "—"}</td>
                        <td style={{ fontFamily: "monospace" }}>{rep.code || "—"}</td>
                        <td>{rate}%</td>
                        <td>{st.count}</td>
                        <td style={{ fontWeight: 700 }}>{moneyShort(st.total, locale)} {t("currency")}</td>
                        <td style={{ fontWeight: 800, color: "#059669" }}>{moneyShort(due, locale)} {t("currency")}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              onClick={() => setExpandedId(isOpen ? null : rep.id)}
                              className="btn-secondary btn-sm"
                              title={t("sr.viewInvoices")}
                            >
                              <i className={`fas ${isOpen ? "fa-chevron-up" : "fa-chevron-down"}`}></i>
                            </button>
                            <button onClick={() => openEdit(rep)} className="btn-secondary btn-sm">
                              <i className="fas fa-edit"></i>
                            </button>
                            {userCanDelete && (
                              <button onClick={() => handleDelete(rep.id)} className="btn-danger btn-sm">
                                <i className="fas fa-trash"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={9} style={{ background: "#f8fafc", padding: 0 }}>
                            <div style={{ padding: "12px 16px" }}>
                              <strong style={{ fontSize: 13 }}>
                                <i className="fas fa-file-invoice" style={{ marginInlineEnd: 6 }}></i>
                                {t("sr.viewInvoices")} — {rep.name} ({st.count})
                              </strong>
                              {st.invoices.length === 0 ? (
                                <div style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 8 }}>{t("sr.noInvoices")}</div>
                              ) : (
                                <table style={{ fontSize: 13, marginTop: 8 }}>
                                  <thead>
                                    <tr>
                                      <th>{t("common.date")}</th>
                                      <th>{t("pos.client")}</th>
                                      <th>{t("common.amount")}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {st.invoices.map((inv) => (
                                      <tr key={inv.id}>
                                        <td style={{ color: "var(--gray-500)", fontSize: 12 }}>
                                          {String(inv.date || inv.createdAt || "").slice(0, 10)}
                                        </td>
                                        <td>{clientNameOf(inv.clientId)}</td>
                                        <td style={{ fontWeight: 700 }}>{moneyShort(inv.amount || 0, locale)} {t("currency")}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-user-tie" style={{ color: "#6366f1" }}></i> {t("sr.add")}
                </h3>
                <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
              </div>
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>{t("sr.name")} *</label>
                    <input
                      type="text"
                      placeholder={t("sr.namePh")}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      autoFocus
                      style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t("sr.phone")}</label>
                    <input
                      type="tel"
                      placeholder={t("sr.phonePh")}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t("sr.code")}</label>
                    <input
                      type="text"
                      placeholder={t("sr.codePh")}
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t("sr.commission")}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.commissionRate}
                      onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                      style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>{t("sr.cancel")}</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? t("common.saving") : t("sr.save")}
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
