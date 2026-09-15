// src/pages/Profits.js - صفحة الأرباح: إيراد الشهر - مصروفات الشهر = الربح
// + مقارنة تلقائية بالشهر اللي فات + خانة اختيارية "كفر" (احتياطي مالي)
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, getDocs, query, where, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

// بيرجع أول وآخر يوم في شهر معين (year, monthIndex 0-11)
function monthRange(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

// إيراد الفاتورة زي ما بتتحسب في باقي الصفحات (paid = amount / غير كده = paidAmount)
function invoiceRevenue(inv) {
  if (inv.status === "paid") return parseFloat(inv.amount) || 0;
  return parseFloat(inv.paidAmount) || 0;
}

const MONTH_NAMES = {
  ar: [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

export default function Profits() {
  const { t, lang, dir } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);

  // خانة الكفر (احتياطي مالي اختياري)
  const [coverageEnabled, setCoverageEnabled] = useState(false);
  const [coverageAmount, setCoverageAmount] = useState("");
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [coverageSaved, setCoverageSaved] = useState(false);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-11

  // -------- تحميل الفواتير والمصروفات --------
  useEffect(() => {
    async function loadData() {
      if (!userCompanyId) return;
      setLoading(true);
      try {
        const [invSnap, expSnap] = await Promise.all([
          getDocs(query(collection(db, "invoices"), where("companyId", "==", userCompanyId))),
          getDocs(query(collection(db, "expenses"), where("companyId", "==", userCompanyId))),
        ]);
        setInvoices(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    loadData();
  }, [userCompanyId]);

  // -------- تحميل إعداد الكفر الخاص بالشركة --------
  useEffect(() => {
    async function loadCoverage() {
      if (!userCompanyId) return;
      try {
        const snap = await getDoc(doc(db, "profitCoverage", userCompanyId));
        if (snap.exists()) {
          const data = snap.data();
          setCoverageEnabled(!!data.enabled);
          setCoverageAmount(data.amount != null ? String(data.amount) : "");
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadCoverage();
  }, [userCompanyId]);

  // -------- حساب إيراد/مصروف/ربح شهر معين --------
  const calcMonth = useCallback(
    (year, monthIndex) => {
      const { start, end } = monthRange(year, monthIndex);

      const revenue = invoices.reduce((sum, inv) => {
        const dateStr = inv.date || inv.createdAt;
        if (!dateStr) return sum;
        const d = new Date(dateStr);
        if (d >= start && d <= end) return sum + invoiceRevenue(inv);
        return sum;
      }, 0);

      const expenseTotal = expenses.reduce((sum, e) => {
        if (!e.date) return sum;
        const d = new Date(e.date);
        if (d >= start && d <= end) return sum + (parseFloat(e.amount) || 0);
        return sum;
      }, 0);

      return { revenue, expenses: expenseTotal, profit: revenue - expenseTotal };
    },
    [invoices, expenses]
  );

  const currentMonthData = useMemo(
    () => calcMonth(selectedYear, selectedMonth),
    [calcMonth, selectedYear, selectedMonth]
  );

  const prevMonthData = useMemo(() => {
    const prevMonthIndex = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    return calcMonth(prevYear, prevMonthIndex);
  }, [calcMonth, selectedYear, selectedMonth]);

  const coverageValue = parseFloat(coverageAmount) || 0;
  const netAfterCoverage = coverageEnabled
    ? currentMonthData.profit - coverageValue
    : currentMonthData.profit;

  const monthLabel = useCallback(
    (year, monthIndex) => {
      const names = MONTH_NAMES[lang] || MONTH_NAMES.ar;
      return `${names[monthIndex]} ${year}`;
    },
    [lang]
  );

  async function saveCoverage(e) {
    e.preventDefault();
    if (!userCompanyId) return;
    setSavingCoverage(true);
    setCoverageSaved(false);
    try {
      await setDoc(doc(db, "profitCoverage", userCompanyId), {
        companyId: userCompanyId,
        amount: parseFloat(coverageAmount) || 0,
        enabled: coverageEnabled,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.uid || null,
      });
      setCoverageSaved(true);
      setTimeout(() => setCoverageSaved(false), 2500);
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setSavingCoverage(false);
  }

  function goToPrevMonth() {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    const isCurrentRealMonth =
      selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    if (isCurrentRealMonth) return; // مايتخطاش الشهر الحالي
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }

  const isViewingCurrentMonth =
    selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

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

  if (!isAdmin) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="header">
            <div>
              <h1>
                <i className="fas fa-chart-line" style={{ color: "#10b981", marginLeft: 10 }}></i>
                {t("profits.title")}
              </h1>
            </div>
          </div>
          <div className="card" style={{ textAlign: "center", padding: "24px 20px" }}>
            <i className="fas fa-lock" style={{ fontSize: 24, color: "#94a3b8", marginBottom: 8 }}></i>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>{t("profits.adminOnly")}</p>
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
              <i className="fas fa-chart-line" style={{ color: "#10b981", marginLeft: 10 }}></i>
              {t("profits.title")}
            </h1>
            <p className="subtitle">{t("profits.subtitle")}</p>
          </div>
        </div>

        {/* منتقي الشهر */}
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "14px 16px",
            marginBottom: 20,
          }}
        >
          <button className="btn-secondary btn-sm" onClick={goToPrevMonth} title={t("profits.prevMonth")}>
            <i className={`fas fa-chevron-${dir === "rtl" ? "right" : "left"}`}></i>
          </button>
          <div style={{ fontWeight: 800, fontSize: 16, minWidth: 160, textAlign: "center" }}>
            {monthLabel(selectedYear, selectedMonth)}
            {isViewingCurrentMonth && (
              <span
                style={{
                  marginRight: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#10b981",
                  background: "#ecfdf5",
                  padding: "2px 8px",
                  borderRadius: 20,
                }}
              >
                {t("profits.currentMonthBadge")}
              </span>
            )}
          </div>
          <button
            className="btn-secondary btn-sm"
            onClick={goToNextMonth}
            disabled={isViewingCurrentMonth}
            title={t("profits.nextMonth")}
          >
            <i className={`fas fa-chevron-${dir === "rtl" ? "left" : "right"}`}></i>
          </button>
        </div>

        {/* إحصائيات الشهر المختار */}
        <div className="stats-row">
          <div className="stat-card green">
            <div className="stat-icon">
              <i className="fas fa-arrow-trend-up"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {currentMonthData.revenue.toLocaleString()} {t("currency")}
            </div>
            <div className="stat-label">{t("profits.revenue")}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon">
              <i className="fas fa-arrow-trend-down"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {currentMonthData.expenses.toLocaleString()} {t("currency")}
            </div>
            <div className="stat-label">{t("profits.expenses")}</div>
          </div>
          <div className={`stat-card ${currentMonthData.profit >= 0 ? "indigo" : "red"}`}>
            <div className="stat-icon">
              <i className="fas fa-sack-dollar"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {currentMonthData.profit.toLocaleString()} {t("currency")}
            </div>
            <div className="stat-label">{t("profits.profit")}</div>
          </div>
          {coverageEnabled && (
            <div className={`stat-card ${netAfterCoverage >= 0 ? "purple" : "red"}`}>
              <div className="stat-icon">
                <i className="fas fa-shield-halved"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {netAfterCoverage.toLocaleString()} {t("currency")}
              </div>
              <div className="stat-label">{t("profits.netAfterCoverage")}</div>
            </div>
          )}
        </div>

        {/* مقارنة سريعة بالشهر اللي فات */}
        <div className="table-container" style={{ marginBottom: 24 }}>
          <div className="table-header">
            <h3>
              <i className="fas fa-clock-rotate-left"></i> {t("profits.previousMonth")}
            </h3>
            <span className="table-count">{monthLabel(
              selectedMonth === 0 ? selectedYear - 1 : selectedYear,
              selectedMonth === 0 ? 11 : selectedMonth - 1
            )}</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>{t("profits.revenue")}</th>
                  <th>{t("profits.expenses")}</th>
                  <th>{t("profits.profit")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 700, color: "#059669" }}>
                    {prevMonthData.revenue.toLocaleString()} {t("currency")}
                  </td>
                  <td style={{ fontWeight: 700, color: "#dc2626" }}>
                    {prevMonthData.expenses.toLocaleString()} {t("currency")}
                  </td>
                  <td style={{ fontWeight: 800, color: prevMonthData.profit >= 0 ? "#4338ca" : "#dc2626" }}>
                    {prevMonthData.profit.toLocaleString()} {t("currency")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* خانة الكفر - احتياطي مالي اختياري */}
        <div className="form-card">
          <h3>
            <i className="fas fa-shield-halved" style={{ color: "#7c3aed" }}></i>
            {t("profits.coverageTitle")}
          </h3>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: -6, marginBottom: 14 }}>
            {t("profits.coverageDesc")}
          </p>
          <form onSubmit={saveCoverage}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#faf5ff",
                  border: "1px solid #e9d5ff",
                  borderRadius: 10,
                  padding: "10px 14px",
                }}
              >
                <input
                  type="checkbox"
                  id="coverageEnabled"
                  checked={coverageEnabled}
                  onChange={(e) => setCoverageEnabled(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <label htmlFor="coverageEnabled" style={{ cursor: "pointer", fontWeight: 600, margin: 0 }}>
                  {t("profits.coverageEnable")}
                </label>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("profits.coverageAmount")}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={coverageAmount}
                  onChange={(e) => setCoverageAmount(e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <button type="submit" className="btn-primary" disabled={savingCoverage}>
                {savingCoverage ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> {t("common.saving")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-save"></i> {t("common.save")}
                  </>
                )}
              </button>
              {coverageSaved && (
                <span style={{ color: "#059669", fontSize: 13, fontWeight: 600 }}>
                  <i className="fas fa-check-circle"></i> {t("profits.coverageSaved")}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
