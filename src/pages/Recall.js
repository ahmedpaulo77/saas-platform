// src/pages/Recall.js — 💰 قايمة "رجّع فلوسك"
// المرضى الغايبين: متابعات فائتة + لم يحضروا + خطط أسنان ناقصة + غايبين من شهور
// كل صف فيه زرار واتساب برسالة جاهزة — الدكتور بيرجع مرضى = فلوس
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { moneyShort } from "../utils/fmt.js";

function waNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("002")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("01")) return "2" + digits;
  if (digits.length === 10 && digits.startsWith("1")) return "20" + digits;
  return digits;
}

const SNOOZE_DAYS = 30;

export default function Recall() {
  const { locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const todayStr = new Date().toISOString().split("T")[0];
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [plans, setPlans] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [snoozeTick, setSnoozeTick] = useState(0);

  const snoozeKey = `aamalypro-recall-snooze-${userCompanyId || "none"}`;
  function readSnooze() {
    try {
      return JSON.parse(localStorage.getItem(snoozeKey) || "{}");
    } catch {
      return {};
    }
  }
  function snoozedOn(key) {
    const all = readSnooze();
    const iso = all[key];
    if (!iso) return false;
    const diff = (new Date(todayStr + "T00:00:00") - new Date(iso + "T00:00:00")) / 86400000;
    return diff < SNOOZE_DAYS;
  }
  function snooze(key) {
    try {
      const all = readSnooze();
      all[key] = todayStr;
      localStorage.setItem(snoozeKey, JSON.stringify(all));
      setSnoozeTick((x) => x + 1);
    } catch (e) { console.warn(e); }
  }

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) return;
    setLoading(true);
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [aSnap, pSnap, dSnap] = await Promise.all([
        getDocs(q("appointments")),
        getDocs(q("patients")),
        getDocs(q("dental_plans")),
      ]);
      const appts = [];
      aSnap.forEach((d) => appts.push({ id: d.id, ...d.data() }));
      setAppointments(appts);
      const plist = [];
      const pmap = {};
      pSnap.forEach((d) => {
        const p = { id: d.id, ...d.data() };
        plist.push(p);
        pmap[p.id] = p;
      });
      setPatients(plist);
      setPatientsMap(pmap);
      const pl = [];
      dSnap.forEach((d) => pl.push({ id: d.id, ...d.data() }));
      setPlans(pl);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [userRole, userCompanyId, currentUser?.uid]);

  const [patientsMap, setPatientsMap] = useState({});

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (!userCompanyId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "companies", userCompanyId));
        if (snap.exists()) setCompanyName(snap.data().name || "");
      } catch (e) { console.warn(e); }
    })();
  }, [userCompanyId]);

  function openWa(phone, msg) {
    const num = waNumber(phone);
    if (!num) { alert("رقم هاتف المريض غير مسجل"); return; }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  const groups = useMemo(() => {
    const phoneOf = (pid, fallback = "") => patientsMap[pid]?.phone || fallback || "";
    const nameOf = (pid, fallback = "") => patientsMap[pid]?.name || fallback || "—";
    // 1) متابعات فائتة
    const overdue = appointments
      .filter((a) => a.type === "follow_up" && a.date < todayStr && (a.status === "scheduled" || a.status === "confirmed"))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((a) => ({
        key: `${a.patientId}:followup:${a.id}`,
        kind: "followup",
        patientId: a.patientId,
        name: a.patientName || nameOf(a.patientId),
        phone: phoneOf(a.patientId),
        detail: `ميعاد ${a.date} ${a.time || ""}`,
        daysLate: Math.floor((new Date(todayStr + "T00:00:00") - new Date(a.date + "T00:00:00")) / 86400000),
        msg: `أهلاً ${a.patientName || ""}، ميعاد المتابعة بتاعك كان يوم ${a.date} وفات — تحب نحجزلك ميعاد جديد؟${companyName ? ` — ${companyName}` : ""}`,
      }));
    // 2) لم يحضروا
    const noshow = appointments
      .filter((a) => a.status === "no_show")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .map((a) => ({
        key: `${a.patientId}:noshow:${a.id}`,
        kind: "noshow",
        patientId: a.patientId,
        name: a.patientName || nameOf(a.patientId),
        phone: phoneOf(a.patientId),
        detail: `ميعاد ${a.date || ""} ${a.time || ""}`,
        msg: `أهلاً ${a.patientName || ""}، حضرتك محضرتش ميعاد ${a.date || ""} — تحب نحجزلك ميعاد بديل؟${companyName ? ` — ${companyName}` : ""}`,
      }));
    // 3) خطط أسنان ناقصة
    const planRows = [];
    let planValue = 0;
    const leftText = (n) => (n === 1 ? "بند واحد" : n === 2 ? "بندين" : n <= 10 ? `${n} بنود` : `${n} بند`);
    plans.forEach((p) => {
      const left = (p.items || []).filter((x) => x.status !== "done");
      if (left.length === 0) return;
      const val = left.reduce((s, x) => s + (parseFloat(x.price) || 0), 0);
      planValue += val;
      planRows.push({
        key: `${p.patientId}:plan:${p.id}`,
        kind: "plan",
        patientId: p.patientId,
        name: p.patientName || nameOf(p.patientId),
        phone: phoneOf(p.patientId),
        detail: `متبقي ${leftText(left.length)} (${moneyShort(val, locale)})`,
        value: val,
        msg: `أهلاً ${p.patientName || ""}، خطة علاجك لسه مخلصتش — فاضل ${leftText(left.length)}، تحب تكمل؟${companyName ? ` — ${companyName}` : ""}`,
      });
    });
    // 4) غايبين من 6 شهور (آخر زيارة أقدم من 180 يوم ومفيش موعد قادم)
    const cutoff = new Date(todayStr + "T00:00:00");
    cutoff.setDate(cutoff.getDate() - 180);
    const apptsByPatient = {};
    appointments.forEach((a) => {
      if (!a.patientId) return;
      (apptsByPatient[a.patientId] = apptsByPatient[a.patientId] || []).push(a);
    });
    const inactive = patients
      .filter((p) => {
        const list = apptsByPatient[p.id] || [];
        if (list.length === 0) return false;
        const hasUpcoming = list.some((a) => a.date >= todayStr && (a.status === "scheduled" || a.status === "confirmed"));
        if (hasUpcoming) return false;
        const last = list.map((a) => a.date || "").sort().reverse()[0];
        return last && new Date(last + "T00:00:00") < cutoff;
      })
      .map((p) => {
        const list = apptsByPatient[p.id];
        const last = list.map((a) => a.date || "").sort().reverse()[0];
        return {
          key: `${p.id}:inactive`,
          kind: "inactive",
          patientId: p.id,
          name: p.name,
          phone: p.phone || "",
          detail: `آخر زيارة ${last}`,
          msg: `أهلاً ${p.name} 🌸 وحشتنا — بقالك فترة مزورتناش، تحب نحجزلك ميعاد للاطمئنان؟${companyName ? ` — ${companyName}` : ""}`,
        };
      });
    return { overdue, noshow, planRows, planValue, inactive };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, patients, plans, patientsMap, companyName, todayStr, locale]);

  const s = search.trim().toLowerCase();
  function visible(list) {
    return list.filter((r) => {
      if (!showSnoozed && snoozedOn(r.key)) return false;
      if (s && !(r.name || "").toLowerCase().includes(s) && !(r.phone || "").includes(s)) return false;
      return true;
    });
  }

  const total = groups.overdue.length + groups.noshow.length + groups.planRows.length + groups.inactive.length;

  function GroupCard({ title, color, bg, list, empty }) {
    const vis = visible(list);
    if (vis.length === 0) return null;
    return (
      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: bg, color, fontWeight: 900, display: "flex", gap: 8, alignItems: "center" }}>
          <span>{title}</span>
          <span style={{ background: "white", borderRadius: 20, padding: "0 12px", fontSize: 13 }}>{vis.length}</span>
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
          {vis.map((r) => (
            <div key={r.key} style={{ display: "flex", gap: 10, alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{r.detail}{r.daysLate != null && r.daysLate > 0 ? ` • متأخر ${r.daysLate} يوم` : ""}</div>
              </div>
              <button onClick={() => openWa(r.phone, r.msg)} title="ابعت واتساب" style={{ background: "#25D366", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 800, fontFamily: "inherit" }}>
                <i className="fab fa-whatsapp"></i> رجّعه
              </button>
              <button onClick={() => snooze(r.key)} title="تم التواصل — إخفاء شهر" className="btn-secondary btn-sm">✅ تواصلت</button>
            </div>
          ))}
          {vis.length === 0 && <div style={{ color: "#94a3b8", fontSize: 12 }}>{empty}</div>}
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading"><div className="spinner"></div>جاري تجميع الغايبين...</div>;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div style={{ background: "linear-gradient(135deg,#b45309,#dc2626)", borderRadius: "var(--radius)", padding: "20px 24px", marginBottom: 20, color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🙈 المرضى الغائبين</h1>
            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.8)", fontSize: 14 }}>المرضى الغايبين = حجوزات مستنية مكالمة — دوس رجّعه واكسب الزيارة</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: "8px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 12 }}>💎 قيمة خطط الأسنان المتوقفة</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{moneyShort(groups.planValue, locale)}</div>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card orange"><div className="stat-icon"><i className="fas fa-calendar-times"></i></div><div className="stat-value">{groups.overdue.length}</div><div className="stat-label">متابعات فائتة</div></div>
          <div className="stat-card red"><div className="stat-icon"><i className="fas fa-user-slash"></i></div><div className="stat-value">{groups.noshow.length}</div><div className="stat-label">لم يحضروا</div></div>
          <div className="stat-card purple"><div className="stat-icon"><i className="fas fa-tooth"></i></div><div className="stat-value">{groups.planRows.length}</div><div className="stat-label">خطط ناقصة</div></div>
          <div className="stat-card blue"><div className="stat-icon"><i className="fas fa-moon"></i></div><div className="stat-value">{groups.inactive.length}</div><div className="stat-label">غايبين 6 شهور</div></div>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم المريض..." />
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={showSnoozed} onChange={(e) => setShowSnoozed(e.target.checked)} style={{ width: 16, height: 16 }} />
            إظهار اللي تواصلت معاهم
          </label>
        </div>

        {total === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 50, color: "#16a34a" }}>
            <div style={{ fontSize: 48 }}>🎉</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>مفيش غايبين — عيادتك ملتزمة 100%</div>
          </div>
        ) : (
          <>
            <GroupCard title="🔁 متابعات فائتة (الأهم)" color="#b45309" bg="#fef3c7" list={groups.overdue} />
            <GroupCard title="🙈 حجزوا ومجيوش" color="#b91c1c" bg="#fee2e2" list={groups.noshow} />
            <GroupCard title="🦷 خطط علاج ناقصة" color="#6d28d9" bg="#ede9fe" list={groups.planRows} />
            <GroupCard title="😴 غايبين من 6 شهور" color="#1d4ed8" bg="#dbeafe" list={groups.inactive} />
          </>
        )}
      </div>
    </div>
  );
}
