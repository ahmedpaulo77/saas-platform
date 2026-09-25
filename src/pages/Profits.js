// src/pages/Profits.js - صفحة الأرباح: إيراد الشهر - مصروفات الشهر = الربح
// + مقارنة تلقائية بالشهر اللي فات + خانة اختيارية "كفر" (احتياطي مالي)
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, getDocs, query, where, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import { EGYPT_PAYMENTS, getPaymentLabel } from "../utils/paymentMethods";

// بيرجع أول وآخر يوم في شهر معين (year, monthIndex 0-11)
function monthRange(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function quarterRange(year, quarter) {
  const start = new Date(year, quarter * 3, 1);
  const end = new Date(year, quarter * 3 + 3, 0, 23, 59, 59, 999);
  return { start, end };
}

function halfRange(year, half) {
  const start = new Date(year, half * 6, 1);
  const end = new Date(year, half * 6 + 6, 0, 23, 59, 59, 999);
  return { start, end };
}

function yearRange(year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end };
}

// إيراد الفاتورة زي ما بتتحسب في باقي الصفحات (paid = amount / غير كده = paidAmount)
// الفواتير غير المؤكدة (approval new/waiting) لا تُحتسب — القديمة بدون approval تُعامل كمؤكدة
function invoiceRevenue(inv) {
  if (inv.approval && inv.approval !== "validated") return 0;
  if (inv.status === "paid") return parseFloat(inv.amount) || 0;
  return parseFloat(inv.paidAmount) || 0;
}

// تكلفة الشراء (نفس المنطق النقدي: مدفوعة بالكامل = amount / غير كده = paidAmount)
function purchaseCost(pur) {
  if (pur.status === "paid") return parseFloat(pur.amount) || 0;
  return parseFloat(pur.paidAmount) || 0;
}

// بيرجع أول وآخر لحظة في يوم معين
function dayRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
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
  const [purchases, setPurchases] = useState([]);
  const [returns, setReturns] = useState([]);

  // خانة الكفر (احتياطي مالي اختياري)
  const [coverageEnabled, setCoverageEnabled] = useState(false);
  const [coverageAmount, setCoverageAmount] = useState("");
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [coverageSaved, setCoverageSaved] = useState(false);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-11
  // Period selector: monthly (default) / quarterly / half / yearly
  const [periodType, setPeriodType] = useState("monthly");
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(now.getMonth() / 3)); // 0-3
  const [selectedHalf, setSelectedHalf] = useState(now.getMonth() < 6 ? 0 : 1); // 0-1
  // ✅ اليوم المختار لتقرير اليومية (default = النهاردة)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // -------- تحميل الفواتير والمشتريات والمصروفات --------
  useEffect(() => {
    async function loadData() {
      if (!userCompanyId) return;
      setLoading(true);
      try {
        const [invSnap, expSnap, purSnap, retSnap] = await Promise.all([
          getDocs(query(collection(db, "invoices"), where("companyId", "==", userCompanyId))),
          getDocs(query(collection(db, "expenses"), where("companyId", "==", userCompanyId))),
          getDocs(query(collection(db, "purchases"), where("companyId", "==", userCompanyId))),
          getDocs(query(collection(db, "returns"), where("companyId", "==", userCompanyId))),
        ]);
        setInvoices(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setPurchases(purSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setReturns(retSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  // -------- حساب إيراد/مشتريات/مصروف/مرتجعات/ربح فترة معينة --------
  // الربح = (المحصّل من المبيعات − مرتجعات البيع) − (المدفوع للموردين − مرتجعات الشراء) − المصروفات
  const calcPeriod = useCallback(
    (start, end) => {
      const inRange = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d >= start && d <= end;
      };

      const revenue = invoices.reduce(
        (sum, inv) => (inRange(inv.date || inv.createdAt) ? sum + invoiceRevenue(inv) : sum),
        0,
      );

      const purchasesTotal = purchases.reduce(
        (sum, p) => (inRange(p.date || p.createdAt) ? sum + purchaseCost(p) : sum),
        0,
      );

      let saleReturns = 0;
      let purchaseReturns = 0;
      returns.forEach((r) => {
        if (!inRange(r.date || r.createdAt)) return;
        const amt = parseFloat(r.amount) || 0;
        if (r.kind === "purchase") purchaseReturns += amt;
        else saleReturns += amt;
      });

      let expenseTotal = 0;
      let wasteTotal = 0;
      expenses.forEach((e) => {
        if (!inRange(e.date)) return;
        const amt = parseFloat(e.amount) || 0;
        expenseTotal += amt;
        if (e.category === "waste") wasteTotal += amt;
      });

      return {
        revenue,
        purchases: purchasesTotal,
        saleReturns,
        purchaseReturns,
        expenses: expenseTotal,
        waste: wasteTotal,
        otherExpenses: expenseTotal - wasteTotal,
        profit: (revenue - saleReturns) - (purchasesTotal - purchaseReturns) - expenseTotal,
      };
    },
    [invoices, expenses, purchases, returns],
  );

  // -------- حساب شهر معين (يُستخدم لمنتقي الشهور) --------
  const calcMonth = useCallback(
    (year, monthIndex) => {
      const { start, end } = monthRange(year, monthIndex);
      return calcPeriod(start, end);
    },
    [calcPeriod],
  );

  // -------- الفترات: شهري / ربع سنوي / نص سنوي / سنوي --------
  const periodRanges = useMemo(() => {
    if (periodType === "quarterly") {
      const cur = quarterRange(selectedYear, selectedQuarter);
      const pq = selectedQuarter === 0 ? 3 : selectedQuarter - 1;
      const py = selectedQuarter === 0 ? selectedYear - 1 : selectedYear;
      return { cur, prev: quarterRange(py, pq) };
    }
    if (periodType === "half") {
      const cur = halfRange(selectedYear, selectedHalf);
      const ph = selectedHalf === 0 ? 1 : 0;
      const py = selectedHalf === 0 ? selectedYear - 1 : selectedYear;
      return { cur, prev: halfRange(py, ph) };
    }
    if (periodType === "yearly") {
      return { cur: yearRange(selectedYear), prev: yearRange(selectedYear - 1) };
    }
    const cur = monthRange(selectedYear, selectedMonth);
    const pm = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const py = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    return { cur, prev: monthRange(py, pm) };
  }, [periodType, selectedYear, selectedMonth, selectedQuarter, selectedHalf]);

  const periodData = useMemo(
    () => calcPeriod(periodRanges.cur.start, periodRanges.cur.end),
    [calcPeriod, periodRanges]
  );
  const prevPeriodData = useMemo(
    () => calcPeriod(periodRanges.prev.start, periodRanges.prev.end),
    [calcPeriod, periodRanges]
  );

  const periodLabel = useMemo(() => {
    if (periodType === "quarterly") {
      const q = lang === "en" ? `Q${selectedQuarter + 1}` : `الربع ${["الأول", "الثاني", "الثالث", "الرابع"][selectedQuarter]}`;
      return `${q} ${selectedYear}`;
    }
    if (periodType === "half") {
      const h = lang === "en" ? (selectedHalf === 0 ? "H1" : "H2") : (selectedHalf === 0 ? "النصف الأول" : "النصف الثاني");
      return `${h} ${selectedYear}`;
    }
    if (periodType === "yearly") return `${selectedYear}`;
    return monthLabel(selectedYear, selectedMonth);
  }, [periodType, selectedYear, selectedMonth, selectedQuarter, selectedHalf, lang, monthLabel]);

  const prevPeriodLabel = useMemo(() => {
    if (periodType === "quarterly") {
      const pq = selectedQuarter === 0 ? 3 : selectedQuarter - 1;
      const py = selectedQuarter === 0 ? selectedYear - 1 : selectedYear;
      const q = lang === "en" ? `Q${pq + 1}` : `الربع ${["الأول", "الثاني", "الثالث", "الرابع"][pq]}`;
      return `${q} ${py}`;
    }
    if (periodType === "half") {
      const ph = selectedHalf === 0 ? 1 : 0;
      const py = selectedHalf === 0 ? selectedYear - 1 : selectedYear;
      const h = lang === "en" ? (ph === 0 ? "H1" : "H2") : (ph === 0 ? "النصف الأول" : "النصف الثاني");
      return `${h} ${py}`;
    }
    if (periodType === "yearly") return `${selectedYear - 1}`;
    const pm = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const py = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    return monthLabel(py, pm);
  }, [periodType, selectedYear, selectedMonth, selectedQuarter, selectedHalf, lang, monthLabel]);

  // -------- الإيراد حسب طريقة الدفع للفترة الحالية --------
  const revenueByMethod = useMemo(() => {
    const { start, end } = periodRanges.cur;
    const grouped = {};
    invoices.forEach((inv) => {
      const d = inv.date || inv.createdAt;
      if (!d) return;
      const dt = new Date(d);
      if (dt < start || dt > end) return;
      const rev = invoiceRevenue(inv);
      if (!rev) return;
      const m = inv.paymentMethod || "cash";
      grouped[m] = (grouped[m] || 0) + rev;
    });
    return grouped;
  }, [invoices, periodRanges]);

  // -------- يومية اليوم المختار --------
  const dayData = useMemo(() => {
    const { start, end } = dayRange(selectedDate);
    return calcPeriod(start, end);
  }, [calcPeriod, selectedDate]);

  const isViewingToday = useMemo(() => {
    const t = new Date();
    return (
      selectedDate.getFullYear() === t.getFullYear() &&
      selectedDate.getMonth() === t.getMonth() &&
      selectedDate.getDate() === t.getDate()
    );
  }, [selectedDate]);

  function goToPrevDay() {
    setSelectedDate((d) => {
      const c = new Date(d);
      c.setDate(c.getDate() - 1);
      return c;
    });
  }

  function goToNextDay() {
    if (isViewingToday) return; // مايتخطاش النهاردة
    setSelectedDate((d) => {
      const c = new Date(d);
      c.setDate(c.getDate() + 1);
      return c;
    });
  }

  const dayLabel = useMemo(() => {
    try {
      return selectedDate.toLocaleDateString(lang === "en" ? "en-US" : "ar-EG", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return selectedDate.toLocaleDateString();
    }
  }, [selectedDate, lang]);

  const coverageValue = parseFloat(coverageAmount) || 0;
  const netAfterCoverage = coverageEnabled
    ? periodData.profit - coverageValue
    : periodData.profit;

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

  function goToPrevPeriod() {
    if (periodType === "quarterly") {
      if (selectedQuarter === 0) { setSelectedQuarter(3); setSelectedYear((y) => y - 1); }
      else setSelectedQuarter((q) => q - 1);
    } else if (periodType === "half") {
      if (selectedHalf === 0) { setSelectedHalf(1); setSelectedYear((y) => y - 1); }
      else setSelectedHalf(0);
    } else if (periodType === "yearly") {
      setSelectedYear((y) => y - 1);
    } else {
      goToPrevMonth();
    }
  }

  function goToNextPeriod() {
    if (isViewingCurrentPeriod) return;
    if (periodType === "quarterly") {
      if (selectedQuarter === 3) { setSelectedQuarter(0); setSelectedYear((y) => y + 1); }
      else setSelectedQuarter((q) => q + 1);
    } else if (periodType === "half") {
      if (selectedHalf === 1) { setSelectedHalf(0); setSelectedYear((y) => y + 1); }
      else setSelectedHalf(1);
    } else if (periodType === "yearly") {
      setSelectedYear((y) => y + 1);
    } else {
      goToNextMonth();
    }
  }

  const isViewingCurrentPeriod = useMemo(() => {
    if (periodType === "quarterly") {
      return selectedYear === now.getFullYear() && selectedQuarter === Math.floor(now.getMonth() / 3);
    }
    if (periodType === "half") {
      return selectedYear === now.getFullYear() && selectedHalf === (now.getMonth() < 6 ? 0 : 1);
    }
    if (periodType === "yearly") return selectedYear === now.getFullYear();
    return selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  }, [periodType, selectedYear, selectedMonth, selectedQuarter, selectedHalf, now.getFullYear, now.getMonth]);

  function deltaFmt(cur, prev) {
    const d = (parseFloat(cur) || 0) - (parseFloat(prev) || 0);
    const sign = d > 0 ? "+" : "";
    return { value: d, text: `${sign}${d.toLocaleString()} ${t("currency")}`, positive: d >= 0 };
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

        {/* ✅ تقرير اليومية: إيراد اليوم − مشتريات اليوم − مصاريف اليوم = الصافي */}
        <div className="table-container" style={{ marginBottom: 20 }}>
          <div className="table-header">
            <h3>
              <i className="fas fa-calendar-day"></i> {t("profits.dailyTitle")}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="btn-secondary btn-sm" onClick={goToPrevDay}>
                <i className={`fas fa-chevron-${dir === "rtl" ? "right" : "left"}`}></i>
              </button>
              <span style={{ fontWeight: 800, fontSize: 13, minWidth: 130, textAlign: "center" }}>
                {dayLabel}
                {isViewingToday && (
                  <span
                    style={{
                      marginRight: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#10b981",
                      background: "#ecfdf5",
                      padding: "2px 8px",
                      borderRadius: 20,
                    }}
                  >
                    {t("profits.today")}
                  </span>
                )}
              </span>
              <button
                className="btn-secondary btn-sm"
                onClick={goToNextDay}
                disabled={isViewingToday}
              >
                <i className={`fas fa-chevron-${dir === "rtl" ? "left" : "right"}`}></i>
              </button>
            </div>
          </div>
          <div className="stats-row" style={{ padding: 16 }}>
            <div className="stat-card green">
              <div className="stat-icon">
                <i className="fas fa-arrow-trend-up"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                {dayData.revenue.toLocaleString()} {t("currency")}
              </div>
              <div className="stat-label">{t("profits.revenue")}</div>
            </div>
            <div className="stat-card amber">
              <div className="stat-icon">
                <i className="fas fa-cart-arrow-down"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                {dayData.purchases.toLocaleString()} {t("currency")}
              </div>
              <div className="stat-label">{t("pur.title")}</div>
            </div>
            <div className="stat-card red">
              <div className="stat-icon">
                <i className="fas fa-trash-can"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                {dayData.waste.toLocaleString()} {t("currency")}
              </div>
              <div className="stat-label">{t("profits.waste")}</div>
            </div>
            {(dayData.saleReturns > 0 || dayData.purchaseReturns > 0) && (
              <div className="stat-card amber">
                <div className="stat-icon">
                  <i className="fas fa-undo"></i>
                </div>
                <div className="stat-value" style={{ fontSize: 18 }}>
                  {dayData.saleReturns.toLocaleString()} {t("currency")}
                </div>
                <div className="stat-label">مرتجعات (مخصومة من الإيراد)</div>
              </div>
            )}
            <div className="stat-card indigo">
              <div className="stat-icon">
                <i className="fas fa-receipt"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                {dayData.otherExpenses.toLocaleString()} {t("currency")}
              </div>
              <div className="stat-label">{t("profits.otherExpenses")}</div>
            </div>
            <div className={`stat-card ${dayData.profit >= 0 ? "purple" : "red"}`}>
              <div className="stat-icon">
                <i className="fas fa-sack-dollar"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                {dayData.profit.toLocaleString()} {t("currency")}
              </div>
              <div className="stat-label">{t("profits.profit")} {t("profits.day")}</div>
            </div>
          </div>
        </div>

        {/* منتقي الفترة: شهري / ربع سنوي / نص سنوي / سنوي */}
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px", marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{t("profits.period") || "الفترة"}:</span>
          {[
            { v: "monthly", label: t("profits.periodMonthly") || "شهري" },
            { v: "quarterly", label: t("profits.periodQuarterly") || "ربع سنوي" },
            { v: "half", label: t("profits.periodHalf") || "نص سنوي" },
            { v: "yearly", label: t("profits.periodYearly") || "سنوي" },
          ].map((p) => (
            <button key={p.v} type="button" onClick={() => setPeriodType(p.v)}
              style={{
                padding: "6px 14px", fontSize: 13, fontWeight: 700, borderRadius: 20, cursor: "pointer",
                border: `2px solid ${periodType === p.v ? "#10b981" : "#e2e8f0"}`,
                background: periodType === p.v ? "#ecfdf5" : "white",
                color: periodType === p.v ? "#059669" : "#64748b",
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* منتقي الشهر/الفترة */}
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
          <button className="btn-secondary btn-sm" onClick={periodType === "monthly" ? goToPrevMonth : goToPrevPeriod} title={t("profits.prevMonth")}>
            <i className={`fas fa-chevron-${dir === "rtl" ? "right" : "left"}`}></i>
          </button>
          <div style={{ fontWeight: 800, fontSize: 16, minWidth: 160, textAlign: "center" }}>
            {periodType === "monthly" ? monthLabel(selectedYear, selectedMonth) : periodLabel}
            {(periodType === "monthly" ? isViewingCurrentMonth : isViewingCurrentPeriod) && (
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
            onClick={periodType === "monthly" ? goToNextMonth : goToNextPeriod}
            disabled={periodType === "monthly" ? isViewingCurrentMonth : isViewingCurrentPeriod}
            title={t("profits.nextMonth")}
          >
            <i className={`fas fa-chevron-${dir === "rtl" ? "left" : "right"}`}></i>
          </button>
        </div>

        {/* إحصائيات الفترة المختارة */}
        <div className="stats-row">
          <div className="stat-card green">
            <div className="stat-icon">
              <i className="fas fa-arrow-trend-up"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {periodData.revenue.toLocaleString()} {t("currency")}
            </div>
            <div className="stat-label">{t("profits.revenue")}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon">
              <i className="fas fa-cart-arrow-down"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {periodData.purchases.toLocaleString()} {t("currency")}
            </div>
            <div className="stat-label">{t("pur.title")}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon">
              <i className="fas fa-arrow-trend-down"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {periodData.expenses.toLocaleString()} {t("currency")}
            </div>
            <div className="stat-label">
              {t("profits.expenses")} ({t("profits.waste")}:{" "}
              {periodData.waste.toLocaleString()})
            </div>
          </div>
          {(periodData.saleReturns > 0 || periodData.purchaseReturns > 0) && (
            <div className="stat-card amber">
              <div className="stat-icon">
                <i className="fas fa-undo"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                {periodData.saleReturns.toLocaleString()} {t("currency")}
              </div>
              <div className="stat-label">مرتجعات (مخصومة من الإيراد)</div>
            </div>
          )}
          <div className={`stat-card ${periodData.profit >= 0 ? "indigo" : "red"}`}>
            <div className="stat-icon">
              <i className="fas fa-sack-dollar"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {periodData.profit.toLocaleString()} {t("currency")}
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

        {/* مقارنة بالفترة السابقة + الفرق */}
        <div className="table-container" style={{ marginBottom: 24 }}>
          <div className="table-header">
            <h3>
              <i className="fas fa-clock-rotate-left"></i> {t("profits.comparison") || t("profits.previousMonth")}
            </h3>
            <span className="table-count">{prevPeriodLabel}</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>{t("profits.revenue")}</th>
                  <th>{t("pur.title")}</th>
                  <th>{t("profits.expenses")}</th>
                  <th>{t("profits.profit")}</th>
                  <th>{t("profits.delta") || "الفرق"}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 700, color: "#059669" }}>
                    {prevPeriodData.revenue.toLocaleString()} {t("currency")}
                  </td>
                  <td style={{ fontWeight: 700, color: "#d97706" }}>
                    {prevPeriodData.purchases.toLocaleString()} {t("currency")}
                  </td>
                  <td style={{ fontWeight: 700, color: "#dc2626" }}>
                    {prevPeriodData.expenses.toLocaleString()} {t("currency")}
                  </td>
                  <td style={{ fontWeight: 800, color: prevPeriodData.profit >= 0 ? "#4338ca" : "#dc2626" }}>
                    {prevPeriodData.profit.toLocaleString()} {t("currency")}
                  </td>
                  <td style={{ fontWeight: 800, color: deltaFmt(periodData.profit, prevPeriodData.profit).positive ? "#059669" : "#dc2626" }}>
                    {deltaFmt(periodData.profit, prevPeriodData.profit).text}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* الإيراد حسب طريقة الدفع للفترة الحالية */}
        <div className="table-container" style={{ marginBottom: 24 }}>
          <div className="table-header">
            <h3>
              <i className="fas fa-wallet"></i> {t("profits.byMethod") || "الإيراد حسب طريقة الدفع"}
            </h3>
            <span className="table-count">{periodLabel}</span>
          </div>
          <div className="table-wrapper">
            {Object.keys(revenueByMethod).length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: 13, padding: "12px 16px", margin: 0 }}>لا توجد إيرادات في هذه الفترة</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>طريقة الدفع</th>
                    <th>{t("profits.revenue")}</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {EGYPT_PAYMENTS.filter((p) => revenueByMethod[p.value] > 0).map((p) => {
                    const amt = revenueByMethod[p.value] || 0;
                    const pct = periodData.revenue > 0 ? ((amt / periodData.revenue) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={p.value}>
                        <td style={{ fontWeight: 700 }}>{getPaymentLabel(p.value, lang)}</td>
                        <td style={{ fontWeight: 700, color: "#059669" }}>{amt.toLocaleString()} {t("currency")}</td>
                        <td style={{ color: "#64748b" }}>{pct}%</td>
                      </tr>
                    );
                  })}
                  {Object.entries(revenueByMethod)
                    .filter(([m]) => !EGYPT_PAYMENTS.some((p) => p.value === m))
                    .map(([m, amt]) => {
                      const pct = periodData.revenue > 0 ? ((amt / periodData.revenue) * 100).toFixed(1) : "0.0";
                      return (
                        <tr key={m}>
                          <td style={{ fontWeight: 700 }}>{getPaymentLabel(m, lang)}</td>
                          <td style={{ fontWeight: 700, color: "#059669" }}>{amt.toLocaleString()} {t("currency")}</td>
                          <td style={{ color: "#64748b" }}>{pct}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
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
