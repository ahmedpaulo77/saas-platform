// src/components/dashboard/RevenueChartCard.jsx — رسم إيراد آخر 30 يوم + مقارنة شهرية
// مفصول عن Dashboard.js لتقليل حجمه. يستقبل البيانات جاهزة via props.
import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { moneyShort, num } from "../../utils/fmt.js";

export default function RevenueChartCard({ t, locale, loading, dailyRevenue, mom, currencyLabel }) {
  return (
    <div className="card" style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
        <h3>
          <i className="fas fa-chart-line" style={{ color: "#6366f1", marginLeft: 8 }}></i>
          {t("dash.chartTitle")}
        </h3>
        {mom.pct !== null && mom.pct !== undefined && (
          <span className={`badge ${mom.pct >= 0 ? "badge-paid" : "badge-expired"}`} style={{ fontSize: 12 }}>
            <i className={`fas ${mom.pct >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}`}></i>
            {" "}{mom.pct >= 0 ? "+" : ""}{num(mom.pct, locale)}٪ {t("dash.momVsPrev")}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 12 }}>
        {t("dash.chartSub", { cur: moneyShort(mom.cur, locale), prev: moneyShort(mom.prev, locale) })} {currencyLabel}
      </p>
      {loading ? (
        <div className="skeleton-card" style={{ height: 240 }}></div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={dailyRevenue} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="dashRevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-200)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Cairo", fill: "#64748b" }} interval={4} />
            <YAxis tick={{ fontSize: 11, fontFamily: "Cairo", fill: "#64748b" }} tickFormatter={(v) => moneyShort(v, locale)} width={60} />
            <Tooltip
              contentStyle={{ fontFamily: "Cairo", borderRadius: 12, border: "1px solid var(--gray-200)", direction: "rtl" }}
              formatter={(v) => [`${moneyShort(v, locale)} ${currencyLabel}`, t("dash.revenue")]}
            />
            <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5} fill="url(#dashRevGrad)" dot={false} activeDot={{ r: 5, fill: "#4f46e5" }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
