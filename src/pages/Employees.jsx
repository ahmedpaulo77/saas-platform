// src/pages/Employees.jsx - الموظفين (ملابس - أدمن فقط)
// تاب 1: بيانات الموظف (اسم/هاتف/عنوان/رقم بطاقة/كود وظيفي/راتب + ربط بمندوب السيلز)
// تاب 2: السلف (مبلغ + تاريخ + سبب) والجزاءات (مبلغ + سبب + تاريخ - متعددة)
// الصافي = الراتب + عمولة الشهر (من فواتير السيلز المعتمدة × نسبة المندوب) − السلف − الجزاءات
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { moneyShort } from "../utils/fmt.js";

function monthKey(d) {
  const dt = d ? new Date(d) : null;
  if (!dt || isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${dt.getMonth()}`;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Employees() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [activeTab, setActiveTab] = useState("data"); // "data" | "finance"
  const [employees, setEmployees] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [reps, setReps] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState("");

  // نموذج الموظف
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empForm, setEmpForm] = useState({
    name: "", phone: "", address: "", nationalId: "", jobCode: "", salary: "", salesRepId: "",
  });
  const [savingEmp, setSavingEmp] = useState(false);

  // نموذج سلفة / جزاء
  const [advForm, setAdvForm] = useState({ amount: "", date: todayISO(), reason: "" });
  const [penForm, setPenForm] = useState({ amount: "", date: todayISO(), reason: "" });

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const [empSnap, advSnap, penSnap, repSnap, invSnap] = await Promise.all([
        getDocs(getScopedQuery("employees", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("employee_advances", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("employee_penalties", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("sales_reps", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid)),
      ]);
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAdvances(advSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPenalties(penSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setReps(repSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setInvoices(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("employees fetch:", e?.message);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const curMonth = monthKey(new Date());

  // عمولة كل مندوب في الشهر الحالي — نفس معادلة صفحة السيلز
  const repCommission = useMemo(() => {
    const totals = {};
    invoices.forEach((inv) => {
      if (!inv.salesRepId) return;
      if ((inv.approval || "validated") !== "validated") return;
      if (monthKey(inv.date || inv.createdAt) !== curMonth) return;
      totals[inv.salesRepId] = (totals[inv.salesRepId] || 0) + (parseFloat(inv.amount) || 0);
    });
    const map = {};
    reps.forEach((r) => {
      const total = totals[r.id] || 0;
      const rate = parseFloat(r.commissionRate) || 0;
      map[r.id] = { total, rate, due: (total * rate) / 100 };
    });
    return map;
  }, [reps, invoices, curMonth]);

  const repNameOf = (id) => reps.find((r) => r.id === id)?.name || "—";

  const filteredEmployees = employees
    .filter((e) => {
      const q = searchTerm.trim().toLowerCase();
      if (!q) return true;
      return (
        (e.name || "").toLowerCase().includes(q) ||
        (e.jobCode || "").toLowerCase().includes(q) ||
        (e.phone || "").includes(q)
      );
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));

  const selectedEmp = employees.find((e) => e.id === selectedEmpId) || null;
  const empAdvances = useMemo(
    () =>
      advances
        .filter((a) => a.employeeId === selectedEmpId)
        .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || ""))),
    [advances, selectedEmpId]
  );
  const empPenalties = useMemo(
    () =>
      penalties
        .filter((p) => p.employeeId === selectedEmpId)
        .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || ""))),
    [penalties, selectedEmpId]
  );

  const summary = useMemo(() => {
    if (!selectedEmp) return null;
    const salary = parseFloat(selectedEmp.salary) || 0;
    const comm = selectedEmp.salesRepId ? repCommission[selectedEmp.salesRepId]?.due || 0 : 0;
    const advTotal = empAdvances.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    const penTotal = empPenalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    return { salary, comm, advTotal, penTotal, net: salary + comm - advTotal - penTotal };
  }, [selectedEmp, repCommission, empAdvances, empPenalties]);

  function openAddEmp() {
    setEditingEmp(null);
    setEmpForm({ name: "", phone: "", address: "", nationalId: "", jobCode: "", salary: "", salesRepId: "" });
    setShowEmpForm(true);
  }

  function openEditEmp(emp) {
    setEditingEmp(emp);
    setEmpForm({
      name: emp.name || "",
      phone: emp.phone || "",
      address: emp.address || "",
      nationalId: emp.nationalId || "",
      jobCode: emp.jobCode || "",
      salary: String(emp.salary ?? ""),
      salesRepId: emp.salesRepId || "",
    });
    setShowEmpForm(true);
  }

  async function handleSaveEmp(e) {
    e.preventDefault();
    if (!empForm.name.trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    const code = empForm.jobCode.trim();
    if (code && employees.some((x) => (x.jobCode || "").trim() === code && x.id !== editingEmp?.id)) {
      alert(t("emp.jobCodeExists"));
      return;
    }
    setSavingEmp(true);
    try {
      const payload = {
        name: empForm.name.trim(),
        phone: empForm.phone.trim(),
        address: empForm.address.trim(),
        nationalId: empForm.nationalId.trim(),
        jobCode: code,
        salary: parseFloat(empForm.salary) || 0,
        salesRepId: empForm.salesRepId || null,
      };
      if (editingEmp) {
        await updateDoc(doc(db, "employees", editingEmp.id), payload);
        await logActivity({
          actionType: "UPDATE",
          collectionName: "employees",
          itemId: editingEmp.id,
          details: `Updated employee: ${payload.name}`,
          user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
        });
      } else {
        const docRef = await addDoc(collection(db, "employees"), {
          ...payload,
          companyId: userCompanyId,
          createdBy: currentUser?.uid || null,
          createdAt: new Date().toISOString(),
        });
        await logActivity({
          actionType: "CREATE",
          collectionName: "employees",
          itemId: docRef.id,
          details: `Created employee: ${payload.name}`,
          user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
        });
      }
      setShowEmpForm(false);
      setEditingEmp(null);
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setSavingEmp(false);
  }

  async function handleDeleteEmp(emp) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "employees", emp.id));
      advances.filter((a) => a.employeeId === emp.id).forEach((a) => batch.delete(doc(db, "employee_advances", a.id)));
      penalties.filter((p) => p.employeeId === emp.id).forEach((p) => batch.delete(doc(db, "employee_penalties", p.id)));
      await batch.commit();
      await logActivity({
        actionType: "DELETE",
        collectionName: "employees",
        itemId: emp.id,
        details: `Deleted employee: ${emp.name} (with advances & penalties)`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      if (selectedEmpId === emp.id) setSelectedEmpId("");
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function handleAddAdvance(e) {
    e.preventDefault();
    if (!selectedEmpId || !(parseFloat(advForm.amount) > 0)) {
      alert(t("common.fillRequired"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "employee_advances"), {
        employeeId: selectedEmpId,
        amount: parseFloat(advForm.amount) || 0,
        date: advForm.date || todayISO(),
        reason: advForm.reason.trim(),
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "employee_advances",
        itemId: docRef.id,
        details: `Advance ${advForm.amount} for employee ${selectedEmp?.name || selectedEmpId}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setAdvForm({ amount: "", date: todayISO(), reason: "" });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function handleAddPenalty(e) {
    e.preventDefault();
    if (!selectedEmpId || !(parseFloat(penForm.amount) > 0) || !penForm.reason.trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "employee_penalties"), {
        employeeId: selectedEmpId,
        amount: parseFloat(penForm.amount) || 0,
        date: penForm.date || todayISO(),
        reason: penForm.reason.trim(),
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "employee_penalties",
        itemId: docRef.id,
        details: `Penalty ${penForm.amount} for employee ${selectedEmp?.name || selectedEmpId}: ${penForm.reason.trim()}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setPenForm({ amount: "", date: todayISO(), reason: "" });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function handleDeleteRecord(col, id, label) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, col, id));
      await logActivity({
        actionType: "DELETE",
        collectionName: col,
        itemId: id,
        details: `Deleted ${label}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
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

  const tabBtn = (active) => ({
    padding: "10px 28px",
    fontSize: 15,
    fontWeight: 800,
    borderRadius: 12,
    cursor: "pointer",
    border: active ? "2px solid #0f766e" : "2px solid #e2e8f0",
    background: active ? "#0f766e" : "white",
    color: active ? "white" : "#64748b",
  });

  const sumBox = (label, value, bg, border, color) => (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 20px", textAlign: "center", minWidth: 140, flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{moneyShort(value, locale)} {t("currency")}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, fontWeight: 700 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-users" style={{ color: "#0f766e", marginLeft: 10 }}></i>
              {t("emp.title")}
            </h1>
            <p className="subtitle">{t("emp.subtitle")}</p>
          </div>
          {activeTab === "data" && (
            <button onClick={openAddEmp} className="btn-primary">
              <i className="fas fa-plus"></i> {t("emp.add")}
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button type="button" style={tabBtn(activeTab === "data")} onClick={() => setActiveTab("data")}>
            📋 {t("emp.tabData")}
          </button>
          <button type="button" style={tabBtn(activeTab === "finance")} onClick={() => setActiveTab("finance")}>
            💰 {t("emp.tabFinance")}
          </button>
        </div>

        {activeTab === "data" && (
          <>
            <div className="filter-bar">
              <div className="search-wrapper" style={{ flex: 1 }}>
                <i className="fas fa-search search-icon"></i>
                <input
                  type="text"
                  placeholder={t("emp.search")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="table-container">
              <div className="table-header">
                <h3>
                  <i className="fas fa-list"></i> {t("emp.tabData")}
                </h3>
                <span className="table-count">{filteredEmployees.length}</span>
              </div>
              <div className="table-wrapper">
                <Pagination
                  data={filteredEmployees}
                  pageSize={15}
                  resetKey={searchTerm}
                  empty={
                    <div className="table-empty">
                      <i className="fas fa-users"></i>
                      <p>{t("emp.empty")}</p>
                    </div>
                  }
                  render={(pageItems, total, start) => (
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{t("emp.name")}</th>
                          <th>{t("emp.phone")}</th>
                          <th>{t("emp.address")}</th>
                          <th>{t("emp.nationalId")}</th>
                          <th>{t("emp.jobCode")}</th>
                          <th>{t("emp.salary")}</th>
                          <th>{t("emp.salesRep")}</th>
                          <th>{t("common.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((e, i) => (
                          <tr key={e.id}>
                            <td>{start + i + 1}</td>
                            <td style={{ fontWeight: 700 }}>{e.name}</td>
                            <td style={{ direction: "ltr" }}>{e.phone || "—"}</td>
                            <td>{e.address || "—"}</td>
                            <td style={{ direction: "ltr" }}>{e.nationalId || "—"}</td>
                            <td style={{ fontFamily: "monospace" }}>{e.jobCode || "—"}</td>
                            <td style={{ fontWeight: 700 }}>{moneyShort(parseFloat(e.salary) || 0, locale)} {t("currency")}</td>
                            <td>{e.salesRepId ? repNameOf(e.salesRepId) : <span style={{ color: "#94a3b8" }}>{t("emp.noRep")}</span>}</td>
                            <td>
                              <div className="table-actions">
                                <button onClick={() => openEditEmp(e)} className="btn-sm btn-secondary" title={t("common.edit")}>
                                  <i className="fas fa-edit"></i>
                                </button>
                                {userCanDelete && (
                                  <button onClick={() => handleDeleteEmp(e)} className="btn-danger btn-sm" title={t("common.delete")}>
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
          </>
        )}

        {activeTab === "finance" && (
          <>
            <div className="form-card">
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                {t("emp.selectEmployee")} <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                style={{ width: "100%", maxWidth: 400, boxSizing: "border-box" }}
              >
                <option value="">— {t("emp.selectEmployee")} —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}{e.jobCode ? ` (${e.jobCode})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {!selectedEmp ? (
              <div className="table-empty">
                <i className="fas fa-user-check"></i>
                <p>{t("emp.pickFirst")}</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                  {sumBox(t("emp.salary"), summary.salary, "#f8fafc", "#e2e8f0", "#0f172a")}
                  {sumBox(
                    `${t("emp.commission")} (${repNameOf(selectedEmp.salesRepId)}${selectedEmp.salesRepId && repCommission[selectedEmp.salesRepId] ? ` ${repCommission[selectedEmp.salesRepId].rate}%` : ""})`,
                    summary.comm,
                    "#f0fdf4",
                    "#86efac",
                    "#059669"
                  )}
                  {sumBox(t("emp.totalAdvances"), summary.advTotal, "#fffbeb", "#fcd34d", "#b45309")}
                  {sumBox(t("emp.totalPenalties"), summary.penTotal, "#fef2f2", "#fecaca", "#dc2626")}
                  {sumBox(t("emp.net"), summary.net, "#eff6ff", "#93c5fd", "#1d4ed8")}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, alignItems: "start" }}>
                  {/* السلف */}
                  <div>
                    <div className="form-card" style={{ borderTop: "4px solid #d97706" }}>
                      <h3>
                        <i className="fas fa-hand-holding-dollar" style={{ color: "#d97706" }}></i>
                        {" "}{t("emp.addAdvance")} — {selectedEmp.name}
                      </h3>
                      <form onSubmit={handleAddAdvance}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                              {t("emp.amount")} <span style={{ color: "#ef4444" }}>*</span>
                            </label>
                            <input
                              type="number" min="0" step="0.01" required
                              value={advForm.amount}
                              onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })}
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                              {t("emp.date")}
                            </label>
                            <input
                              type="date"
                              value={advForm.date}
                              onChange={(e) => setAdvForm({ ...advForm, date: e.target.value })}
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                            {t("emp.reason")}
                          </label>
                          <input
                            type="text"
                            value={advForm.reason}
                            onChange={(e) => setAdvForm({ ...advForm, reason: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box" }}
                          />
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <button type="submit" className="btn-primary">
                            <i className="fas fa-plus"></i> {t("emp.addAdvance")}
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className="table-container">
                      <div className="table-header">
                        <h3>{t("emp.advances")}</h3>
                        <span className="table-count">{empAdvances.length} · {moneyShort(summary.advTotal, locale)} {t("currency")}</span>
                      </div>
                      <div className="table-wrapper">
                        {empAdvances.length === 0 ? (
                          <div className="table-empty">
                            <i className="fas fa-hand-holding-dollar"></i>
                            <p>{t("emp.emptyAdvances")}</p>
                          </div>
                        ) : (
                          <table>
                            <thead>
                              <tr>
                                <th>{t("emp.amount")}</th>
                                <th>{t("emp.date")}</th>
                                <th>{t("emp.reason")}</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {empAdvances.map((a) => (
                                <tr key={a.id}>
                                  <td style={{ fontWeight: 800 }}>{moneyShort(parseFloat(a.amount) || 0, locale)}</td>
                                  <td>{a.date ? new Date(a.date).toLocaleDateString(locale) : "—"}</td>
                                  <td>{a.reason || "—"}</td>
                                  <td>
                                    {userCanDelete && (
                                      <button onClick={() => handleDeleteRecord("employee_advances", a.id, `advance ${a.amount}`)} className="btn-danger btn-sm" title={t("common.delete")}>
                                        <i className="fas fa-trash"></i>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* الجزاءات */}
                  <div>
                    <div className="form-card" style={{ borderTop: "4px solid #dc2626" }}>
                      <h3>
                        <i className="fas fa-gavel" style={{ color: "#dc2626" }}></i>
                        {" "}{t("emp.addPenalty")} — {selectedEmp.name}
                      </h3>
                      <form onSubmit={handleAddPenalty}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                              {t("emp.amount")} <span style={{ color: "#ef4444" }}>*</span>
                            </label>
                            <input
                              type="number" min="0" step="0.01" required
                              value={penForm.amount}
                              onChange={(e) => setPenForm({ ...penForm, amount: e.target.value })}
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                              {t("emp.date")}
                            </label>
                            <input
                              type="date"
                              value={penForm.date}
                              onChange={(e) => setPenForm({ ...penForm, date: e.target.value })}
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                            {t("emp.reason")} <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <input
                            type="text" required
                            value={penForm.reason}
                            onChange={(e) => setPenForm({ ...penForm, reason: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box" }}
                          />
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <button type="submit" className="btn-primary">
                            <i className="fas fa-plus"></i> {t("emp.addPenalty")}
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className="table-container">
                      <div className="table-header">
                        <h3>{t("emp.penalties")}</h3>
                        <span className="table-count">{empPenalties.length} · {moneyShort(summary.penTotal, locale)} {t("currency")}</span>
                      </div>
                      <div className="table-wrapper">
                        {empPenalties.length === 0 ? (
                          <div className="table-empty">
                            <i className="fas fa-gavel"></i>
                            <p>{t("emp.emptyPenalties")}</p>
                          </div>
                        ) : (
                          <table>
                            <thead>
                              <tr>
                                <th>{t("emp.amount")}</th>
                                <th>{t("emp.date")}</th>
                                <th>{t("emp.reason")}</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {empPenalties.map((p) => (
                                <tr key={p.id}>
                                  <td style={{ fontWeight: 800, color: "#dc2626" }}>{moneyShort(parseFloat(p.amount) || 0, locale)}</td>
                                  <td>{p.date ? new Date(p.date).toLocaleDateString(locale) : "—"}</td>
                                  <td>{p.reason || "—"}</td>
                                  <td>
                                    {userCanDelete && (
                                      <button onClick={() => handleDeleteRecord("employee_penalties", p.id, `penalty ${p.amount}`)} className="btn-danger btn-sm" title={t("common.delete")}>
                                        <i className="fas fa-trash"></i>
                                      </button>
                                    )}
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
          </>
        )}

        {showEmpForm && (
          <div className="modal-overlay" onClick={() => setShowEmpForm(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-user-plus" style={{ color: "#0f766e" }}></i>{" "}
                  {editingEmp ? t("emp.edit") : t("emp.add")}
                </h3>
                <button className="modal-close" onClick={() => setShowEmpForm(false)}>
                  ×
                </button>
              </div>
              <form onSubmit={handleSaveEmp}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>{t("emp.name")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="text" required
                      value={empForm.name}
                      onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="form-group">
                      <label>{t("emp.phone")}</label>
                      <input
                        type="text"
                        value={empForm.phone}
                        onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("emp.jobCode")}</label>
                      <input
                        type="text"
                        value={empForm.jobCode}
                        onChange={(e) => setEmpForm({ ...empForm, jobCode: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t("emp.address")}</label>
                    <input
                      type="text"
                      value={empForm.address}
                      onChange={(e) => setEmpForm({ ...empForm, address: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="form-group">
                      <label>{t("emp.nationalId")}</label>
                      <input
                        type="text"
                        value={empForm.nationalId}
                        onChange={(e) => setEmpForm({ ...empForm, nationalId: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("emp.salary")}</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={empForm.salary}
                        onChange={(e) => setEmpForm({ ...empForm, salary: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t("emp.salesRep")}</label>
                    <select
                      value={empForm.salesRepId}
                      onChange={(e) => setEmpForm({ ...empForm, salesRepId: e.target.value })}
                    >
                      <option value="">— {t("emp.noRep")} —</option>
                      {reps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({parseFloat(r.commissionRate) || 0}%)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowEmpForm(false)}>
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className="btn-primary" disabled={savingEmp}>
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
