// src/pages/Reception.js — شاشة الاستقبال السريعة للعيادة
// الشمال: مواعيد النهاردة | اليمين: فوترة فورية + طباعة حرارية — من غير تنقل بين صفحات
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { buildClinicThermalHTML, openThermalPrint } from "../utils/invoiceHelpers.js";
import { exportInvoicePDF } from "../utils/pdfExport.js";
import { moneyShort } from "../utils/fmt.js";

const GENERAL_PRESETS = [
  { name: "كشف أول", price: "" },
  { name: "متابعة", price: "" },
  { name: "استشارة", price: "" },
  { name: "سونار", price: "" },
  { name: "جلسة", price: "" },
];

const DENTAL_PRESETS = [
  { name: "كشف أسنان", price: "" },
  { name: "تنظيف وتلميع", price: "" },
  { name: "حشو عادي", price: "" },
  { name: "حشو عصب", price: "" },
  { name: "خلع", price: "" },
  { name: "تركيب / كراون", price: "" },
  { name: "تبييض", price: "" },
  { name: "متابعة تقويم", price: "" },
];

export default function Reception() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const todayStr = new Date().toISOString().split("T")[0];
  const [day, setDay] = useState(todayStr);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [invoicesToday, setInvoicesToday] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // appointment or walk-in {walkIn:true, patientId, patientName}
  const [services, setServices] = useState([{ name: "كشف أول", price: "" }]);
  const [paidAmount, setPaidAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [saving, setSaving] = useState(false);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [search, setSearch] = useState("");
  const [walkName, setWalkName] = useState("");
  const [walkPhone, setWalkPhone] = useState("");

  const isDental = (company?.clinicSpecialty || "") === "dental";
  const PRESETS = isDental ? DENTAL_PRESETS : GENERAL_PRESETS;

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) return;
    setLoading(true);
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [aSnap, pSnap, iSnap, cSnap] = await Promise.all([
        getDocs(q("appointments")),
        getDocs(q("patients")),
        getDocs(q("invoices")),
        getDoc(doc(db, "companies", userCompanyId)),
      ]);
      const appts = [];
      aSnap.forEach((d) => appts.push({ id: d.id, ...d.data() }));
      appts.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
      setAppointments(appts);
      const plist = [];
      pSnap.forEach((d) => plist.push({ id: d.id, name: d.data().name, phone: d.data().phone || "" }));
      setPatients(plist);
      const invs = [];
      iSnap.forEach((d) => invs.push({ id: d.id, ...d.data() }));
      setInvoicesToday(invs.filter((v) => String(v.date || v.createdAt || "").split("T")[0] === todayStr));
      if (cSnap.exists()) setCompany({ id: cSnap.id, ...cSnap.data() });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [userRole, userCompanyId, currentUser?.uid, todayStr]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const dayAppts = useMemo(() => {
    const s = search.toLowerCase();
    return appointments.filter((a) => a.date === day && (!s || (a.patientName || "").toLowerCase().includes(s)));
  }, [appointments, day, search]);

  const total = useMemo(() => services.reduce((sum, sv) => sum + (parseFloat(sv.price) || 0), 0), [services]);
  const paid = paidAmount === "" ? total : parseFloat(paidAmount) || 0;
  const remain = Math.max(0, total - paid);

  const dayCash = useMemo(() => invoicesToday.reduce((s, v) => s + (parseFloat(v.paidAmount) || 0), 0), [invoicesToday]);

  function pickAppt(a) {
    setSelected(a);
    setLastInvoice(null);
    const label = a.type === "first_visit" ? "كشف أول" : a.type === "follow_up" ? "متابعة" : a.type === "emergency" ? "طوارئ" : "فحص";
    setServices([{ name: isDental && a.type === "first_visit" ? "كشف أسنان" : label, price: a.fee ? String(a.fee) : "" }]);
    setPaidAmount("");
  }

  async function addWalkIn(e) {
    e.preventDefault();
    if (!walkName.trim()) { alert("اكتب اسم المريض"); return; }
    try {
      const ref = await addDoc(collection(db, "patients"), {
        name: walkName.trim(),
        phone: walkPhone.trim() || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
        totalVisits: 0,
      });
      const np = { id: ref.id, name: walkName.trim(), phone: walkPhone.trim() };
      setPatients((p) => [...p, np]);
      setSelected({ walkIn: true, patientId: ref.id, patientName: np.name, date: day, time: new Date().toTimeString().slice(0, 5) });
      setServices([{ name: isDental ? "كشف أسنان" : "كشف أول", price: "" }]);
      setWalkName(""); setWalkPhone("");
    } catch (err) {
      console.error(err);
      alert("تعذر إضافة المريض");
    }
  }

  async function saveInvoice(printMode) {
    if (!selected) { alert("اختار موعد من الشمال الأول"); return; }
    const patientId = selected.patientId;
    if (!patientId) { alert("الموعد ده من غير مريض مرتبط"); return; }
    const clean = services.filter((s) => s.name.trim() && parseFloat(s.price) > 0);
    if (clean.length === 0) { alert("ضيف خدمة واحدة على الأقل بسعر"); return; }
    if (!(total > 0)) { alert("الإجمالي لازم أكبر من صفر"); return; }
    setSaving(true);
    try {
      const data = {
        clientId: patientId,
        patientId,
        patientName: selected.patientName || "",
        appointmentId: selected.walkIn ? null : selected.id,
        products: clean.map((s) => ({ productId: "", productName: s.name.trim(), quantity: 1, amount: parseFloat(s.price), paidAmount: 0, isManual: true })),
        manualAmount: true,
        amount: total,
        total,
        paidAmount: paid,
        status: remain <= 0.5 ? "paid" : "pending",
        approval: "new",
        type: "invoice",
        description: `استقبال — ${clean.map((s) => s.name.trim()).join(" + ")}`,
        paymentMethod: payMethod,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        dueDate: remain > 0.5 ? new Date().toISOString() : null,
      };
      const ref = await addDoc(collection(db, "invoices"), data);
      const saved = { ...data, id: ref.id };
      // اقفل الموعد لو جاي من حجز
      if (!selected.walkIn && selected.id) {
        try {
          await updateDoc(doc(db, "appointments", selected.id), {
            status: "done",
            invoiceId: ref.id,
            fee: total,
            updatedAt: new Date().toISOString(),
          });
          setAppointments((prev) => prev.map((a) => (a.id === selected.id ? { ...a, status: "done", invoiceId: ref.id } : a)));
        } catch (err) { console.warn(err); }
      }
      setInvoicesToday((prev) => [...prev, saved]);
      setLastInvoice(saved);
      setSelected((s) => (s ? { ...s, invoiceId: ref.id } : s));
      if (printMode === "thermal") {
        openThermalPrint(buildClinicThermalHTML({ invoice: saved, patientName: saved.patientName, company }));
      } else if (printMode === "pdf") {
        exportInvoicePDF(saved, saved.patientName || "", clean[0]?.name || "كشف", "invoice", locale);
      } else {
        alert("✅ تم حفظ الفاتورة");
      }
    } catch (err) {
      console.error(err);
      alert("فشل حفظ الفاتورة");
    }
    setSaving(false);
  }

  if (loading) return <div className="loading"><div className="spinner"></div>جاري تحميل الاستقبال...</div>;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div style={{ background: "linear-gradient(135deg,#059669,#0d9488)", borderRadius: "var(--radius)", padding: "18px 22px", marginBottom: 16, color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🧾 الاستقبال السريع {isDental ? "🦷" : ""}</h1>
            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.75)", fontSize: 13 }}>اختار المريض من الشمال → حاسبه واطبع من نفس الشاشة</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: "8px 14px" }}>
            <span style={{ fontSize: 12 }}>💰 محصل اليوم:</span>
            <strong style={{ fontSize: 18 }}>{moneyShort(dayCash, locale)}</strong>
            <span style={{ fontSize: 12 }}>• {invoicesToday.length} فاتورة</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
          {/* الشمال: مواعيد اليوم */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={styles.input} />
              <div className="search-wrapper" style={{ flex: 1, minWidth: 140 }}>
                <i className="fas fa-search search-icon"></i>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." />
              </div>
            </div>
            <div style={{ maxHeight: 480, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {dayAppts.length === 0 ? (
                <div style={{ textAlign: "center", color: "#94a3b8", padding: 24, fontSize: 13 }}>لا توجد مواعيد في {day}</div>
              ) : dayAppts.map((a) => {
                const active = selected && !selected.walkIn && selected.id === a.id;
                return (
                  <div key={a.id} onClick={() => pickAppt(a)} style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center", background: active ? "#ecfdf5" : "#f8fafc", border: active ? "2px solid #059669" : "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ background: a.status === "done" ? "#16a34a" : "#2563eb", color: "white", borderRadius: 8, padding: "6px 8px", fontWeight: 800, fontSize: 12, minWidth: 56, textAlign: "center" }}>{a.time || "--:--"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{a.patientName} {a.invoiceId && <span style={{ fontSize: 10, background: "#dcfce7", color: "#15803d", borderRadius: 10, padding: "0 6px" }}>🧾</span>}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{a.status === "done" ? "تم ✅" : a.status === "confirmed" ? "مؤكد" : "منتظر"}{a.doctor ? ` • ${a.doctor}` : ""}</div>
                    </div>
                    <i className="fas fa-chevron-left" style={{ color: active ? "#059669" : "#cbd5e1" }}></i>
                  </div>
                );
              })}
            </div>
            <form onSubmit={addWalkIn} style={{ padding: 10, borderTop: "1px solid #e2e8f0", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input value={walkName} onChange={(e) => setWalkName(e.target.value)} placeholder="مريض بدون حجز — الاسم" style={{ ...styles.input, flex: 2, minWidth: 120 }} />
              <input value={walkPhone} onChange={(e) => setWalkPhone(e.target.value)} placeholder="📞" style={{ ...styles.input, flex: 1, minWidth: 80 }} />
              <button className="btn-secondary btn-sm" type="submit">+ إضافة</button>
            </form>
          </div>

          {/* اليمين: الفوترة */}
          <div className="card">
            {!selected ? (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: 50 }}>
                <i className="fas fa-hand-pointer" style={{ fontSize: 36, marginBottom: 10 }}></i>
                <div style={{ fontWeight: 800 }}>اختار موعد من القائمة 👈</div>
                <div style={{ fontSize: 12 }}>أو ضيف مريض بدون حجز من تحت القائمة</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ margin: 0 }}>👤 {selected.patientName} <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{selected.date} {selected.time || ""}</span></h3>
                  {selected.invoiceId && <span style={{ fontSize: 12, fontWeight: 800, background: "#dcfce7", color: "#15803d", borderRadius: 20, padding: "2px 12px" }}>تمت الفوترة ✅</span>}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {PRESETS.map((p) => (
                    <button key={p.name} type="button" className="btn-secondary btn-sm" onClick={() => setServices((sv) => [...sv, { name: p.name, price: "" }])}>+ {p.name}</button>
                  ))}
                </div>

                {services.map((sv, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input value={sv.name} onChange={(e) => setServices((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="الخدمة" style={{ ...styles.input, flex: 2 }} />
                    <input type="number" min="0" value={sv.price} onChange={(e) => setServices((prev) => prev.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} placeholder="السعر" style={{ ...styles.input, flex: 1 }} />
                    {services.length > 1 && <button type="button" className="btn-danger btn-sm" onClick={() => setServices((prev) => prev.filter((_, j) => j !== i))}><i className="fas fa-trash"></i></button>}
                  </div>
                ))}

                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>الإجمالي</label>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>{moneyShort(total, locale)}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>المدفوع (فاضي = الكل)</label>
                    <input type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder={String(total)} style={styles.input} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>المتبقي</label>
                    <div style={{ fontSize: 20, fontWeight: 900, color: remain > 0.5 ? "#d97706" : "#16a34a" }}>{moneyShort(remain, locale)}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>الدفع</label>
                    <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={styles.input}>
                      <option value="cash">💵 كاش</option>
                      <option value="visa">💳 فيزا</option>
                      <option value="transfer">🏦 تحويل</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button className="btn-primary" disabled={saving} onClick={() => saveInvoice("thermal")} style={{ flex: 1, background: "#059669", border: "none", padding: "12px", borderRadius: 10, color: "white", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    <i className="fas fa-print"></i> {saving ? "جاري..." : "حفظ + طباعة حرارية"}
                  </button>
                  <button className="btn-secondary" disabled={saving} onClick={() => saveInvoice("pdf")}>📄 حفظ + PDF</button>
                  <button className="btn-secondary" disabled={saving} onClick={() => saveInvoice("none")}>💾 حفظ فقط</button>
                </div>

                {lastInvoice && (
                  <div style={{ marginTop: 12, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 10, padding: 10, fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    ✅ اتحفظت: {moneyShort(lastInvoice.total, locale)} — {lastInvoice.status === "paid" ? "مدفوعة" : `متبقي ${moneyShort((lastInvoice.total || 0) - (lastInvoice.paidAmount || 0), locale)}`}
                    <button className="btn-sm btn-primary" onClick={() => openThermalPrint(buildClinicThermalHTML({ invoice: lastInvoice, patientName: lastInvoice.patientName, company }))}>🖨️ إعادة الطباعة</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  input: { padding: "9px 12px", border: "1px solid var(--gray-200)", borderRadius: "var(--radius-sm)", fontSize: 13, fontFamily: "Cairo, sans-serif", background: "white", outline: "none", width: "100%", boxSizing: "border-box" },
};
