// src/pages/PurchasesStatsCards.jsx - بطاقات إحصائيات المشتريات
import React from "react";

export default function PurchasesStatsCards({ filteredPurchases, isAdmin, t, locale, moneyShort }) {
  // إجمالي المصروفات = المدفوع فعلياً بس (زي منطق الإيرادات في الفواتير)
  const totalSpent = filteredPurchases.reduce((sum, p) => {
    if (p.status === "paid") return sum + (parseFloat(p.amount) || 0);
    return sum + (parseFloat(p.paidAmount) || 0);
  }, 0);

  const paidCount = filteredPurchases.filter((p) => p.status === "paid").length;
  const pendingCount = filteredPurchases.filter((p) => p.status === "pending").length;
  const totalOwed = filteredPurchases.reduce((sum, p) => {
    if (p.status === "overdue") {
      const total = parseFloat(p.amount) || 0;
      const paid = parseFloat(p.paidAmount) || 0;
      return sum + (total - paid);
    }
    return sum;
  }, 0);

  if (!isAdmin) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "24px 20px", marginBottom: 24 }}>
        <i className="fas fa-lock" style={{ fontSize: 24, color: "#94a3b8", marginBottom: 8 }}></i>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
          {t("pur.statsAdminOnly")}
        </p>
      </div>
    );
  }

  return (
    <div
      className="stats-row"
      style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))" }}
    >
      <div className="stat-card cyan">
        <div className="stat-icon">
          <i className="fas fa-cart-arrow-down"></i>
        </div>
        <div className="stat-value">{filteredPurchases.length}</div>
        <div className="stat-label">{t("pur.statTotal")}</div>
      </div>
      <div className="stat-card green">
        <div className="stat-icon">
          <i className="fas fa-check-circle"></i>
        </div>
        <div className="stat-value">{paidCount}</div>
        <div className="stat-label">{t("pur.statPaid")}</div>
      </div>
      <div className="stat-card indigo">
        <div className="stat-icon">
          <i className="fas fa-clock"></i>
        </div>
        <div className="stat-value">{pendingCount}</div>
        <div className="stat-label">{t("pur.statPending")}</div>
      </div>
      <div className="stat-card amber">
        <div className="stat-icon">
          <i className="fas fa-money-bill-wave"></i>
        </div>
        <div className="stat-value" style={{ fontSize: 20 }}>
          {moneyShort(totalSpent, locale)}
        </div>
        <div className="stat-label">{t("pur.statSpent")}</div>
      </div>
      <div className="stat-card red">
        <div className="stat-icon">
          <i className="fas fa-exclamation-triangle"></i>
        </div>
        <div className="stat-value" style={{ fontSize: 20 }}>
          {moneyShort(totalOwed, locale)}
        </div>
        <div className="stat-label">{t("pur.statOwed")}</div>
      </div>
    </div>
  );
}