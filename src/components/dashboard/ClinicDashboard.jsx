// src/components/dashboard/ClinicDashboard.jsx — داشبورد مخصص للعيادة
// مواعيد النهاردة + إيراد الكشوفات + مرضى جدد + مديونيات — يبهر الدكاترة من أول شاشة
import React, { useEffect, useState } from "react";
import { getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { getScopedQuery } from "../../utils/companyQuery.js";
import { useLanguage } from "../../i18n/LanguageContext.js";
import { moneyShort } from "../../utils/fmt.js";

export default function ClinicDashboard() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser, userClinicSpecialty } = useAuth();
  const isDental = (userClinicSpecialty || "") === "dental";
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    todayAppts: [],
    revenueToday: 0,
    revenueMonth: 0,
    newPatients: 0,
    pendingCount: 0,
    pendingAmount: 0,
    followUps: [],
    overdueCount: 0,
  });

  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!userCompanyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [aSnap, pSnap, iSnap] = await Promise.all([
          getDocs(getScopedQuery("appointments", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("patients", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid)),
        ]);
        if (cancelled) return;
        const appts = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const patients = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const invoices = iSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const now = new Date();
        const todayAppts = appts
          .filter((a) => a.date === todayStr && a.status !== "cancelled")
          .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

        const isThisMonth = (iso) => {
          if (!iso) return false;
          const d = new Date(iso);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        };
        const isToday = (iso) => {
          if (!iso) return false;
          const d = new Date(iso);
          return d.toISOString().split("T")[0] === todayStr;
        };

        let revenueToday = 0;
        let revenueMonth = 0;
        let pendingCount = 0;
        let pendingAmount = 0;
        invoices.forEach((inv) => {
          const paid = parseFloat(inv.paidAmount) || 0;
          const total = parseFloat(inv.total) || parseFloat(inv.amount) || 0;
          const dt = inv.date || inv.createdAt;
          if (isToday(dt)) revenueToday += paid;
          if (isThisMonth(dt)) revenueMonth += paid;
          const status = String(inv.status || "").toLowerCase();
          if (status === "pending" || (total > paid && paid >= 0)) {
            // فاتورة عليها متبقي حقيقي
            const remain = total - paid;
            if (remain > 0.5) {
              pendingCount += 1;
              pendingAmount += remain;
            }
          }
        });

        const newPatients = patients.filter((p) => isThisMonth(p.createdAt)).length;

        // 💰 غايبين (للتنبيه): متابعات فائتة + لم يحضروا
        const overdueCount = appts.filter((a) =>
          (a.type === "follow_up" && a.date < todayStr && (a.status === "scheduled" || a.status === "confirmed")) ||
          a.status === "no_show"
        ).length;

        // متابعات مستحقة: مواعيد follow_up قادمة خلال 7 أيام
        const in7 = new Date();
        in7.setDate(in7.getDate() + 7);
        const followUps = appts
          .filter((a) => {
            if (!a.date) return false;
            if (!(a.status === "scheduled" || a.status === "confirmed")) return false;
            if (a.type !== "follow_up") return false;
            const d = new Date(a.date + "T00:00:00");
            const today = new Date(todayStr + "T00:00:00");
            return d >= today && d <= in7;
          })
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .slice(0, 5);

        setData({ todayAppts, revenueToday, revenueMonth, newPatients, pendingCount, pendingAmount, followUps, overdueCount });
      } catch (e) {
        console.warn("clinic dashboard:", e?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userCompanyId, userRole, currentUser?.uid, todayStr]);

  const cards = [
    { icon: "fas fa-calendar-day", cls: "blue", label: "مواعيد النهاردة", value: loading ? "..." : String(data.todayAppts.length), onClick: () => navigate("/appointments") },
    { icon: "fas fa-money-bill-wave", cls: "cyan", label: "إيراد النهاردة (كشوفات)", value: loading ? "..." : moneyShort(data.revenueToday, locale), onClick: () => navigate("/invoices") },
    { icon: "fas fa-chart-line", cls: "green", label: "إيراد الشهر", value: loading ? "..." : moneyShort(data.revenueMonth, locale), onClick: () => navigate("/reports") },
    { icon: "fas fa-user-plus", cls: "indigo", label: "مرضى جدد الشهر", value: loading ? "..." : String(data.newPatients), onClick: () => navigate("/patients") },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <i className="fas fa-stethoscope" style={{ color: "#059669" }}></i>
        لوحة العيادة اليومية
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
          {new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>

      <div className="stats-row anim-stagger" style={{ marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.label} className={`stat-card ${c.cls}`} onClick={c.onClick} style={{ cursor: "pointer" }} title="اضغط للانتقال">
            <div className="stat-icon"><i className={c.icon}></i></div>
            <div className="stat-value" style={{ fontSize: 22 }}>{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {/* جدول النهاردة */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", background: "linear-gradient(135deg,#059669,#0d9488)", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong><i className="fas fa-list-ul" style={{ marginInlineEnd: 8 }}></i>جدول النهاردة ({data.todayAppts.length})</strong>
            <button onClick={() => navigate("/appointments")} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "white", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
              كل المواعيد ←
            </button>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {loading ? (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: 20 }}><i className="fas fa-spinner fa-spin"></i> جاري التحميل...</div>
            ) : data.todayAppts.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: 24 }}>
                <i className="fas fa-coffee" style={{ fontSize: 28, marginBottom: 8 }}></i>
                <div>لا توجد مواعيد اليوم — يوم هادئ 🎉</div>
                <button onClick={() => navigate("/appointments")} className="btn-primary btn-sm" style={{ marginTop: 12 }}>+ احجز موعد</button>
              </div>
            ) : data.todayAppts.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ background: "#059669", color: "white", borderRadius: 8, padding: "6px 10px", fontWeight: 800, fontSize: 13, minWidth: 62, textAlign: "center" }}>{a.time || "—"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{a.patientName || "—"}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{a.type === "first_visit" ? "🩺 كشف" : a.type === "follow_up" ? "🔁 متابعة" : a.type === "checkup" ? "📋 فحص" : "🚨 طوارئ"}{a.doctor ? ` • ${a.doctor}` : ""}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: a.status === "done" ? "#dcfce7" : a.status === "confirmed" ? "#dbeafe" : "#fef3c7", color: a.status === "done" ? "#15803d" : a.status === "confirmed" ? "#1d4ed8" : "#b45309" }}>
                  {a.status === "done" ? "تم" : a.status === "confirmed" ? "مؤكد" : "منتظر"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* المتابعات + المديونية */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!loading && data.overdueCount > 0 && (
            <div className="card" onClick={() => navigate("/recall")} style={{ border: "2px solid #dc2626", background: "linear-gradient(135deg,#fef2f2,#fff7ed)", padding: "12px 18px", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 14, color: "#b91c1c" }}>💰 {data.overdueCount} مريض غايب مستني مكالمة</strong>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#dc2626" }}>افتح رجّع فلوسك ←</span>
              </div>
            </div>
          )}
          <div className="card" style={{ border: "2px solid #f59e0b44", padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>💰 مبالغ مستحقة على المرضى</strong>
              <button onClick={() => navigate("/aging")} style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>التفاصيل ←</button>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#d97706" }}>{loading ? "..." : moneyShort(data.pendingAmount, locale)}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{loading ? "" : `${data.pendingCount} فاتورة معلقة`}</div>
            </div>
          </div>

          <div className="card" style={{ padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>🔁 متابعات خلال 7 أيام ({data.followUps.length})</strong>
              <button onClick={() => navigate("/appointments")} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>المواعيد ←</button>
            </div>
            {data.followUps.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>لا توجد متابعات قريبة</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.followUps.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, background: "#eff6ff", borderRadius: 8, padding: "6px 10px" }}>
                    <strong>{a.patientName}</strong>
                    <span style={{ color: "#2563eb", fontWeight: 700 }}>{a.date}</span>
                    <span style={{ color: "#64748b" }}>{a.time}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button onClick={() => navigate("/reception")} className="btn-primary btn-sm" style={{ flex: 1, background: "#059669", border: "none" }}>🧾 الاستقبال</button>
              {isDental && (
                <button onClick={() => navigate("/dental")} className="btn-secondary btn-sm" style={{ flex: 1 }}>🦷 الأسنان</button>
              )}
              <button onClick={() => navigate("/patients")} className="btn-secondary btn-sm" style={{ flex: 1 }}>🩺 المرضى</button>
              <button onClick={() => navigate("/prescriptions")} className="btn-secondary btn-sm" style={{ flex: 1 }}>💊 روشتة</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
