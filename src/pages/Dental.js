// src/pages/Dental.js — تخصص الأسنان 🦷
// Dental Chart (FDI) + خطة علاج + تحويل الخطة لفاتورة — اللي يبهر دكتور السنان
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { moneyShort } from "../utils/fmt.js";

const QUADRANTS = [
  { title: "علوي يمين", teeth: ["18", "17", "16", "15", "14", "13", "12", "11"] },
  { title: "علوي شمال", teeth: ["21", "22", "23", "24", "25", "26", "27", "28"] },
  { title: "سفلي شمال", teeth: ["31", "32", "33", "34", "35", "36", "37", "38"] },
  { title: "سفلي يمين", teeth: ["41", "42", "43", "44", "45", "46", "47", "48"] },
];

const STATUSES = [
  { id: "healthy", label: "سليم", color: "#15803d", bg: "#dcfce7" },
  { id: "caries", label: "تسوس", color: "#b91c1c", bg: "#fee2e2" },
  { id: "filling", label: "حشو", color: "#1d4ed8", bg: "#dbeafe" },
  { id: "root_canal", label: "حشو عصب", color: "#c2410c", bg: "#ffedd5" },
  { id: "crown", label: "كراون", color: "#b45309", bg: "#fef3c7" },
  { id: "implant", label: "زراعة", color: "#6d28d9", bg: "#ede9fe" },
  { id: "to_extract", label: "خلع", color: "#991b1b", bg: "#fecaca" },
  { id: "missing", label: "مفقود", color: "#64748b", bg: "#f1f5f9" },
  { id: "veneer", label: "فينير", color: "#0e7490", bg: "#cffafe" },
];

const PROCEDURES = ["كشف أسنان", "تنظيف وتلميع", "حشو عادي", "حشو عصب", "خلع", "خلع جراحي", "كراون / تركيب", "زراعة", "تقويم", "تبييض", "فينير", "متابعة"];

const statusMeta = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

export default function Dental() {
  const { locale } = useLanguage();
  const navigate = useNavigate();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState("");
  const [teeth, setTeeth] = useState({});
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [chartNotes, setChartNotes] = useState("");
  const [chartId, setChartId] = useState(null);
  const [savingChart, setSavingChart] = useState(false);
  const [loading, setLoading] = useState(true);
  // خطة العلاج
  const [planItems, setPlanItems] = useState([]);
  const [planId, setPlanId] = useState(null);
  const [newItem, setNewItem] = useState({ tooth: "", procedure: "حشو عادي", price: "" });
  const [savingPlan, setSavingPlan] = useState(false);
  const [invoicing, setInvoicing] = useState(false);

  const patient = patients.find((p) => p.id === patientId);

  const fetchPatients = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("patients", userRole, userCompanyId, currentUser?.uid));
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, name: d.data().name, phone: d.data().phone || "" }));
      setPatients(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  // تحميل شارت وخطة المريض المختار
  useEffect(() => {
    if (!patientId || !userCompanyId) { setTeeth({}); setPlanItems([]); setChartId(null); setPlanId(null); setChartNotes(""); return; }
    (async () => {
      try {
        const [cSnap, pSnap] = await Promise.all([
          getDocs(getScopedQuery("dental_charts", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("dental_plans", userRole, userCompanyId, currentUser?.uid)),
        ]);
        let found = null;
        cSnap.forEach((d) => { const v = d.data(); if (v.patientId === patientId) found = { id: d.id, ...v }; });
        if (found) {
          setTeeth(found.teeth || {});
          setChartNotes(found.notes || "");
          setChartId(found.id);
        } else { setTeeth({}); setChartNotes(""); setChartId(null); }
        let plan = null;
        pSnap.forEach((d) => { const v = d.data(); if (v.patientId === patientId) plan = { id: d.id, ...v }; });
        if (plan) {
          setPlanItems(plan.items || []);
          setPlanId(plan.id);
        } else { setPlanItems([]); setPlanId(null); }
      } catch (e) { console.error(e); }
    })();
  }, [patientId, userCompanyId, userRole, currentUser?.uid]);

  function applyStatus(statusId) {
    if (!selectedTooth) { alert("اختار ضرس من الخريطة الأول 🦷"); return; }
    setTeeth((prev) => ({ ...prev, [selectedTooth]: statusId }));
  }

  async function saveChart() {
    if (!patientId) { alert("اختار المريض الأول"); return; }
    setSavingChart(true);
    try {
      const payload = {
        patientId,
        patientName: patient?.name || "",
        teeth,
        notes: chartNotes,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        updatedAt: new Date().toISOString(),
      };
      if (chartId) {
        await updateDoc(doc(db, "dental_charts", chartId), payload);
      } else {
        const ref = await addDoc(collection(db, "dental_charts"), { ...payload, createdAt: new Date().toISOString() });
        setChartId(ref.id);
      }
      alert("✅ اتحفظت خريطة الأسنان");
    } catch (e) { console.error(e); alert("فشل الحفظ"); }
    setSavingChart(false);
  }

  function addPlanItem() {
    if (!newItem.procedure || !(parseFloat(newItem.price) > 0)) { alert("اختار الإجراء واكتب السعر"); return; }
    setPlanItems((prev) => [...prev, { tooth: newItem.tooth || "—", procedure: newItem.procedure, price: parseFloat(newItem.price), status: "planned" }]);
    setNewItem({ tooth: "", procedure: "حشو عادي", price: "" });
  }

  async function savePlan() {
    if (!patientId) { alert("اختار المريض الأول"); return; }
    setSavingPlan(true);
    try {
      const payload = {
        patientId,
        patientName: patient?.name || "",
        items: planItems,
        total: planTotal,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        updatedAt: new Date().toISOString(),
      };
      if (planId) {
        await updateDoc(doc(db, "dental_plans", planId), payload);
      } else {
        const ref = await addDoc(collection(db, "dental_plans"), { ...payload, createdAt: new Date().toISOString() });
        setPlanId(ref.id);
      }
      alert("✅ اتحفظت خطة العلاج");
    } catch (e) { console.error(e); alert("فشل الحفظ"); }
    setSavingPlan(false);
  }

  async function planToInvoice() {
    const remaining = planItems.filter((x) => x.status !== "done");
    if (remaining.length === 0) { alert("مفيش بنود متبقية للفوترة"); return; }
    if (!window.confirm(`تحويل ${remaining.length} بند لفاتورة؟`)) return;
    setInvoicing(true);
    try {
      const total = remaining.reduce((s, x) => s + (parseFloat(x.price) || 0), 0);
      await addDoc(collection(db, "invoices"), {
        clientId: patientId,
        patientId,
        patientName: patient?.name || "",
        products: remaining.map((x) => ({ productId: "", productName: `${x.procedure} (ضرس ${x.tooth})`, quantity: 1, amount: parseFloat(x.price) || 0, paidAmount: 0, isManual: true })),
        manualAmount: true,
        amount: total,
        total,
        paidAmount: 0,
        status: "pending",
        approval: "new",
        type: "invoice",
        description: `خطة علاج أسنان — ${remaining.length} بند`,
        paymentMethod: "cash",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        dueDate: new Date().toISOString(),
      });
      alert("✅ اتعملت الفاتورة — هتلاقيها في الفواتير والاستقبال");
    } catch (e) { console.error(e); alert("فشل إنشاء الفاتورة"); }
    setInvoicing(false);
  }

  const planTotal = planItems.reduce((s, x) => s + (parseFloat(x.price) || 0), 0);
  const planDone = planItems.filter((x) => x.status === "done").length;

  const counts = {};
  Object.values(teeth).forEach((s) => { counts[s] = (counts[s] || 0) + 1; });

  if (loading) return <div className="loading"><div className="spinner"></div>جاري تحميل الأسنان...</div>;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div style={{ background: "linear-gradient(135deg,#0e7490,#2563eb)", borderRadius: "var(--radius)", padding: "20px 24px", marginBottom: 20, color: "white" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🦷 ملف الأسنان</h1>
          <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.75)", fontSize: 14 }}>خريطة الضروس + خطة العلاج + الفوترة — دوس على أي ضرس وحدد حالته</p>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 800 }}>👤 المريض</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)} style={{ ...styles.input, flex: 1, minWidth: 200 }}>
              <option value="">اختار المريض...</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` (${p.phone})` : ""}</option>)}
            </select>
            {patientId && (
              <button type="button" onClick={() => navigate("/prescriptions", { state: { patientId } })} title="كتابة روشتة للمريض — مربوطة بيه وتظهر في ورقة المريض" style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap" }}>
                💊 روشتة للمريض
              </button>
            )}
          </div>
        </div>

        {!patientId ? (
          <div className="card" style={{ textAlign: "center", color: "#94a3b8", padding: 50 }}>
            <div style={{ fontSize: 48 }}>🦷</div>
            <div style={{ fontWeight: 800 }}>اختار مريض عشان تفتح خريطة سنانه</div>
          </div>
        ) : (
          <>
            {/* الخريطة */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ margin: 0 }}>🗺️ خريطة الضروس — {patient?.name}</h3>
                <button className="btn-primary btn-sm" onClick={saveChart} disabled={savingChart}>{savingChart ? "جاري الحفظ..." : "💾 حفظ الخريطة"}</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {QUADRANTS.map((q) => (
                  <div key={q.title} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 8, textAlign: "center" }}>{q.title}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                      {q.teeth.map((num) => {
                        const st = statusMeta(teeth[num] || "healthy");
                        const sel = selectedTooth === num;
                        return (
                          <button key={num} type="button" onClick={() => setSelectedTooth(num)} title={`ضرس ${num} — ${st.label}`}
                            style={{ border: sel ? "3px solid #0f172a" : `2px solid ${st.color}`, background: st.bg, color: st.color, borderRadius: 10, padding: "8px 2px", cursor: "pointer", fontWeight: 900, fontSize: 13, fontFamily: "inherit", transform: sel ? "scale(1.08)" : "none" }}>
                            <div>🦷</div>
                            <div>{num}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, background: "#f1f5f9", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                  {selectedTooth ? `ضرس ${selectedTooth} المختار — دوس على الحالة:` : "دوس على ضرس من الخريطة ثم اختار حالته 👆"}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {STATUSES.map((s) => (
                    <button key={s.id} type="button" onClick={() => applyStatus(s.id)} style={{ border: "1px solid #e2e8f0", background: s.bg, color: s.color, borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit" }}>
                      {s.label}{counts[s.id] ? ` (${counts[s.id]})` : ""}
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={chartNotes} onChange={(e) => setChartNotes(e.target.value)} placeholder="ملاحظات الدكتور على الحالة..." style={{ ...styles.input, marginTop: 10, minHeight: 56 }} />
            </div>

            {/* خطة العلاج */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ margin: 0 }}>📋 خطة العلاج ({planItems.length} بنود • منجز {planDone}) — الإجمالي {moneyShort(planTotal, locale)}</h3>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn-secondary btn-sm" onClick={savePlan} disabled={savingPlan}>{savingPlan ? "..." : "💾 حفظ الخطة"}</button>
                  <button className="btn-primary btn-sm" onClick={planToInvoice} disabled={invoicing || planItems.length === 0} style={{ background: "#059669", border: "none" }}>{invoicing ? "..." : "🧾 تحويل لفاتورة"}</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input value={newItem.tooth} onChange={(e) => setNewItem({ ...newItem, tooth: e.target.value })} placeholder="الضرس (11-48)" style={{ ...styles.input, maxWidth: 130 }} />
                <select value={newItem.procedure} onChange={(e) => setNewItem({ ...newItem, procedure: e.target.value })} style={{ ...styles.input, maxWidth: 200 }}>
                  {PROCEDURES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input type="number" min="0" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} placeholder="السعر" style={{ ...styles.input, maxWidth: 140 }} />
                <button className="btn-secondary btn-sm" onClick={addPlanItem}>+ إضافة بند</button>
                {selectedTooth && <button className="btn-sm" style={{ background: "#ede9fe", border: "1px solid #c4b5fd", borderRadius: 8, cursor: "pointer", fontWeight: 700 }} onClick={() => setNewItem((n) => ({ ...n, tooth: selectedTooth }))}>استخدم ضرس {selectedTooth}</button>}
              </div>
              {planItems.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 16 }}>لسه مفيش بنود — ضيف أول بند فوق 👆</div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>#</th><th>الضرس</th><th>الإجراء</th><th>السعر</th><th>الحالة</th><th></th></tr></thead>
                    <tbody>
                      {planItems.map((it, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 800 }}>🦷 {it.tooth}</td>
                          <td>{it.procedure}</td>
                          <td style={{ fontWeight: 800 }}>{moneyShort(Number(it.price) || 0, locale)}</td>
                          <td>
                            <button onClick={() => setPlanItems((prev) => prev.map((x, j) => (j === i ? { ...x, status: x.status === "done" ? "planned" : x.status === "planned" ? "in_progress" : "done" } : x)))}
                              style={{ border: "none", borderRadius: 20, padding: "3px 12px", cursor: "pointer", fontWeight: 800, fontSize: 11, background: it.status === "done" ? "#dcfce7" : it.status === "in_progress" ? "#dbeafe" : "#fef3c7", color: it.status === "done" ? "#15803d" : it.status === "in_progress" ? "#1d4ed8" : "#b45309" }}>
                              {it.status === "done" ? "✅ تم" : it.status === "in_progress" ? "🔧 شغال" : "📅 مخطط"}
                            </button>
                          </td>
                          <td><button className="btn-danger btn-sm" onClick={() => setPlanItems((prev) => prev.filter((_, j) => j !== i))}><i className="fas fa-trash"></i></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  input: { padding: "10px 12px", border: "1px solid var(--gray-200)", borderRadius: "var(--radius-sm)", fontSize: 14, fontFamily: "Cairo, sans-serif", background: "white", outline: "none", width: "100%", boxSizing: "border-box" },
};
