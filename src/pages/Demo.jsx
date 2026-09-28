// src/pages/Demo.jsx — وضع العرض التجريبي (public, بدون تسجيل)
// بيانات وهمية ثابتة لكل نشاط — لا Firebase ولا قراءة حقيقية.
// الهدف: العميل يدوس بنفسه ويشوف الشكل والإحساس قبل التسجيل.
import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.js";
import { useTheme } from "../context/ThemeContext.js";
import AnimatedNumber from "../components/common/AnimatedNumber.jsx";
import { moneyShort, num } from "../utils/fmt.js";
import { getAvailableModules, MODULE_MAP, MODULE_LABEL_KEYS } from "../utils/modules.js";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

const INDUSTRIES = [
  { id: "restaurant", icon: "fas fa-utensils", color: "#f59e0b", bg: "#fef3c7" },
  { id: "pharmacy", icon: "fas fa-pills", color: "#0891b2", bg: "#cffafe" },
  { id: "super_market", icon: "fas fa-store", color: "#10b981", bg: "#d1fae5" },
  { id: "clothing", icon: "fas fa-shirt", color: "#8b5cf6", bg: "#f3e8ff" },
  { id: "clinic", icon: "fas fa-stethoscope", color: "#ec4899", bg: "#fdf2f8" },
  { id: "general", icon: "fas fa-briefcase", color: "#6366f1", bg: "#eef2ff" },
];

// مولد بيانات ثابت لكل نشاط (نفس الشكل كل مرة — deterministic)
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function demoData(industry, locale) {
  const seed = [...industry].reduce((s, c) => s + c.charCodeAt(0), 7);
  const rnd = mulberry(seed);
  const base = { restaurant: 4200, pharmacy: 6800, super_market: 9500, clothing: 7300, clinic: 3100, general: 5400 }[industry] || 5000;
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const wave = 1 + 0.35 * Math.sin(i / 4.2) + (rnd() - 0.5) * 0.5;
    days.push({
      name: d.toLocaleDateString(locale, { day: "numeric", month: "numeric" }),
      value: Math.round(base * wave),
    });
  }
  const monthTotal = days.reduce((s, x) => s + x.value, 0);
  return {
    revenue: monthTotal,
    invoices: 180 + Math.floor(rnd() * 220),
    clients: 90 + Math.floor(rnd() * 160),
    products: 140 + Math.floor(rnd() * 300),
    momPct: 4 + Math.round(rnd() * 22 + rnd() * 10) / 10,
    days,
    top: [0.42, 0.27, 0.18, 0.13].map((f, i) => ({ i, v: Math.round(monthTotal * f) })),
  };
}

export default function Demo() {
  const { t, locale } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [industry, setIndustry] = useState(params.get("ind") || "restaurant");
  const data = useMemo(() => demoData(industry, locale), [industry, locale]);
  const active = INDUSTRIES.find((x) => x.id === industry) || INDUSTRIES[0];

  // وحدات النشاط المختار — نفس مصدر الصلاحيات الحقيقي، بدون الوحدات الخدمية
  const industryModules = useMemo(() => {
    const avail = getAvailableModules(industry, "admin");
    const ordered = [...MODULE_MAP._base, ...(MODULE_MAP[industry] || [])];
    const seen = new Set();
    const hidden = new Set(["dashboard", "notifications", "profile", "about", "my-company"]);
    return ordered.filter((m) => {
      if (seen.has(m) || hidden.has(m) || !avail.has(m)) return false;
      seen.add(m);
      return true;
    });
  }, [industry]);

  const cards = [
    { icon: "fas fa-money-bill-wave", cls: "cyan", label: t("demo.revenue"), value: <AnimatedNumber value={data.revenue} locale={locale} format={(v) => moneyShort(v, locale)} /> },
    { icon: "fas fa-file-invoice", cls: "amber", label: t("demo.invoices"), value: <AnimatedNumber value={data.invoices} locale={locale} /> },
    { icon: "fas fa-user-friends", cls: "green", label: t("demo.clients"), value: <AnimatedNumber value={data.clients} locale={locale} /> },
    { icon: "fas fa-boxes", cls: "purple", label: t("demo.products"), value: <AnimatedNumber value={data.products} locale={locale} /> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--gray-50)" }}>
      {/* شريط علوي */}
      <div style={{ background: "var(--sidebar-bg)", padding: "14px 4%", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => navigate("/")}>
          <div style={{ width: 38, height: 38, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
            <i className="fas fa-cube"></i>
          </div>
          <span style={{ color: "white", fontWeight: 800, fontSize: 18 }}>SaaS PRO</span>
          <span className="badge badge-purple" style={{ marginInlineStart: 6 }}>{t("demo.badge")}</span>
        </div>
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
          <button onClick={toggleTheme} className="btn-secondary btn-sm" aria-label={t("theme.dark")}>
            <i className={isDark ? "fas fa-sun" : "fas fa-moon"}></i>
          </button>
          <button onClick={() => navigate("/login")} className="btn-secondary btn-sm">{t("landing.ctaLogin")}</button>
          <button onClick={() => navigate("/signup")} className="btn-primary btn-sm">{t("signup.title")}</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 4% 60px" }}>
        {/* اختيار النشاط */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {INDUSTRIES.map((x) => (
            <button
              key={x.id}
              onClick={() => setIndustry(x.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 60,
                border: industry === x.id ? "2px solid #6366f1" : "1px solid var(--gray-200)",
                background: industry === x.id ? "var(--primary-bg)" : "var(--white)",
                color: industry === x.id ? "var(--primary-dark)" : "var(--gray-600)",
                fontFamily: "Cairo", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 8, background: x.bg, color: x.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                <i className={x.icon}></i>
              </span>
              {t(`demo.ind.${x.id}`)}
            </button>
          ))}
        </div>

        <div className="page-header" style={{ marginBottom: 20 }}>
          <div className="page-header-left">
            <h1>{t("demo.title", { industry: t(`demo.ind.${industry}`) })}</h1>
            <p className="subtitle">{t("demo.subtitle")}</p>
          </div>
          <span className="badge badge-paid" style={{ fontSize: 12 }}>
            <i className="fas fa-arrow-trend-up"></i> +{num(data.momPct, locale)}٪ {t("dash.momVsPrev")}
          </span>
        </div>

        {/* لوحة: هيبقى عندك إيه في النشاط ده */}
        <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg,#0f172a,#1e1b4b)", border: "none" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ width: 54, height: 54, background: active.bg, color: active.color, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
              <i className={active.icon}></i>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ color: "white", fontSize: 19, marginBottom: 4 }}>
                {t("landing.indYouGet", { name: t(`demo.ind.${industry}`) })}
              </h3>
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 12 }}>
                {t("landing.indYouGetDesc")}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {industryModules.map((m) => (
                  <span key={m} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 60 }}>
                    <i className="fas fa-check" style={{ color: "#34d399", marginLeft: 6, fontSize: 10 }}></i>
                    {t(MODULE_LABEL_KEYS[m] || m)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* كروت */}
        <div className="stats-row anim-stagger">
          {cards.map((c) => (
            <div key={c.label} className={`stat-card ${c.cls}`}>
              <div className="stat-icon"><i className={c.icon}></i></div>
              <div className="stat-value" style={{ fontSize: 26 }}>{c.value}</div>
              <div className="stat-label">{c.label}</div>
            </div>
          ))}
        </div>

        {/* رسم + أكثر مبيعًا */}
        <div className="grid-2">
          <div className="card">
            <h3><i className="fas fa-chart-line" style={{ color: "#6366f1", marginLeft: 8 }}></i>{t("demo.chart")}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.days} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="demoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={active.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={active.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-200)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Cairo", fill: "#64748b" }} interval={5} />
                <YAxis tick={{ fontSize: 11, fontFamily: "Cairo", fill: "#64748b" }} tickFormatter={(v) => moneyShort(v, locale)} width={60} />
                <Tooltip contentStyle={{ fontFamily: "Cairo", borderRadius: 12, direction: "rtl" }} formatter={(v) => [`${moneyShort(v, locale)} ${t("currency")}`, t("demo.revenue")]} />
                <Area type="monotone" dataKey="value" stroke={active.color} strokeWidth={2.5} fill="url(#demoGrad)" dot={false} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3><i className="fas fa-trophy" style={{ color: "#f59e0b", marginLeft: 8 }}></i>{t("demo.top")}</h3>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={data.top.map((x) => ({ name: `${t("demo.item")} ${num(x.i + 1, locale)}`, v: x.v }))} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Cairo", fill: "#64748b" }} interval={0} />
                <Tooltip contentStyle={{ fontFamily: "Cairo", borderRadius: 12, direction: "rtl" }} formatter={(v) => [`${moneyShort(v, locale)} ${t("currency")}`, t("demo.revenue")]} />
                <Bar dataKey="v" fill={active.color} radius={[8, 8, 0, 0]} barSize={34} />
              </BarChart>
            </ResponsiveContainer>
            {data.top.map((x) => (
              <div key={x.i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "var(--gray-50)", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{t("demo.item")} {num(x.i + 1, locale)}</span>
                <span style={{ fontWeight: 800, color: active.color }}>{moneyShort(x.v, locale)} {t("currency")}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="card" style={{ textAlign: "center", padding: "36px 24px", background: "linear-gradient(135deg,#0f172a,#1e1b4b)", border: "none" }}>
          <h3 style={{ color: "white", fontSize: 22, marginBottom: 8 }}>{t("demo.ctaTitle")}</h3>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 20 }}>{t("demo.ctaDesc")}</p>
          <button onClick={() => navigate("/signup")} className="btn-primary btn-lg">
            <i className="fas fa-rocket"></i> {t("signup.title")}
          </button>
        </div>
      </div>
    </div>
  );
}
