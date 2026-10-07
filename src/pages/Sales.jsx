// src/pages/Sales.jsx - المبيعات اليومية (ملابس) — قراءة فقط
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { getPaymentLabel, distributeByMethod, paymentLabelOf } from "../utils/paymentMethods.js";
import { invoiceRevenue, saleReturnsTotal, round2 } from "../utils/revenue.js";
import { moneyShort } from "../utils/fmt.js";

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ✅ التعريف الموحّد للإيراد — كان هنا نسخة رابعة بتختلف عن التلاتة التانية
// (مفيش فلتر approval + بتستخدم amount). شوف utils/revenue.js.

export default function Sales() {
  const { t, lang, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();

  const [dateStr, setDateStr] = useState(() => todayLocal());
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = (col) =>
        getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [iSnap, pSnap, cSnap, rSnap] = await Promise.all([
        getDocs(q("invoices")),
        getDocs(q("inventory")),
        getDocs(q("clients")),
        getDocs(q("returns")),
      ]);
      setInvoices(iSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setProducts(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClients(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setReturns(rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const selectedDate = useMemo(() => {
    const d = new Date(dateStr + "T00:00:00");
    return isNaN(d.getTime()) ? new Date() : d;
  }, [dateStr]);

  const isToday = dateStr === todayLocal();

  // فواتير اليوم المعتمدة فقط (القديمة بدون approval تُعامل كمؤكدة)
  const dayInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (inv.approval && inv.approval !== "validated") return false;
      const dt = toDate(inv.date || inv.createdAt);
      if (!dt) return false;
      return sameDay(dt, selectedDate);
    });
  }, [invoices, selectedDate]);

  const productMap = useMemo(() => {
    const m = {};
    products.forEach((p) => {
      m[p.id] = p;
    });
    return m;
  }, [products]);

  const clientMap = useMemo(() => {
    const m = {};
    clients.forEach((c) => {
      m[c.id] = c.name;
    });
    return m;
  }, [clients]);

  // كل سطر = فاتورة كاملة (مش صنف منفصل)
  const rows = useMemo(() => {
    return dayInvoices
      .map((inv) => {
        const dt = toDate(inv.date || inv.createdAt);
        const ts = dt ? dt.getTime() : 0;
        const clientName = clientMap[inv.clientId] || t("sales.walkIn");
        const method = paymentLabelOf(inv, lang);
        const ref = inv.id.slice(0, 6).toUpperCase();
        const items = inv.products || inv.items || [];
        const totalQtyInv = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0), 0);
        const itemsSummary = items
          .map((it) => {
            const prod = productMap[it.productId || it.id] || {};
            const name = prod.name || it.name || t("common.unspecified");
            const size = (it.size ?? prod.size ?? "").toString().trim();
            const color = (it.color ?? prod.color ?? "").toString().trim();
            const variant = [size, color].filter(Boolean).join(" / ");
            const qty = parseFloat(it.quantity) || 0;
            return variant ? `${name} (${variant}) ×${qty}` : `${name} ×${qty}`;
          })
          .join("، ");
        const amount = invoiceRevenue(inv) || parseFloat(inv.amount) || 0;
        return { key: inv.id, ts, dt, clientName, method, ref, itemsSummary, totalQtyInv, amount };
      })
      .sort((a, b) => a.ts - b.ts);
  }, [dayInvoices, productMap, clientMap, t, lang]);

  const revenue = useMemo(
    () => round2(dayInvoices.reduce((s, inv) => s + invoiceRevenue(inv), 0)),
    [dayInvoices]
  );

  const dayReturns = useMemo(() => {
    return returns.filter((r) => {
      if (r.kind && r.kind !== "sale") return false;
      if (!r.kind && r.type && r.type !== "sale") return false;
      const dt = toDate(r.date || r.createdAt);
      if (!dt) return false;
      return sameDay(dt, selectedDate);
    });
  }, [returns, selectedDate]);

  const returnsAmount = useMemo(
    () => dayReturns.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [dayReturns]
  );

  const totalQty = useMemo(
    () => rows.reduce((s, r) => s + (r.totalQtyInv || 0), 0),
    [rows]
  );

  // ⚠️ "إجمالي الكمية" كان بيجمع كميات الفواتير بس والمرتجعات مش ناقصة منه،
  // فبعد أي مرتجع الرقم كان أعلى من reality. بننقص المرتجع من الكمية.
  const returnedQty = useMemo(() => {
    return dayReturns.reduce((s, r) => {
      const items = r.items || r.products || [];
      return s + items.reduce((x, l) => x + (parseFloat(l.quantity) || 0), 0);
    }, 0);
  }, [dayReturns]);

  const netQty = Math.max(0, round2(totalQty - returnedQty));

  const net = round2(revenue - returnsAmount);

  const byMethod = useMemo(() => {
    const grouped = {};
    dayInvoices.forEach((inv) => {
      const rev = invoiceRevenue(inv);
      if (!rev) return;
      // المقسم يتفكك لطرقه الحقيقية (مفيش "split" في التقارير)
      distributeByMethod(inv, rev).forEach(({ method, amount }) => {
        grouped[method] = (grouped[method] || 0) + amount;
      });
    });
    return grouped;
  }, [dayInvoices]);

  function fmtTime(dt) {
    if (!dt) return "—";
    try {
      return dt.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dt.toLocaleTimeString(locale);
    }
  }

  function dayLabel() {
    try {
      return selectedDate.toLocaleDateString(
        locale,
        { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      );
    } catch {
      return dateStr;
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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i
                className="fas fa-shopping-bag"
                style={{ color: "#1e3a8a", marginLeft: 10 }}
              ></i>
              {t("sales.title")}
            </h1>
            <p className="subtitle">{t("sales.subtitle")}</p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                fontSize: 12,
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              {t("sales.date")}
            </label>
            <input
              type="date"
              value={dateStr}
              max={todayLocal()}
              onChange={(e) => e.target.value && setDateStr(e.target.value)}
              style={{
                padding: "9px 14px",
                border: "2px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
                fontFamily: "inherit",
                background: "white",
              }}
            />
            {!isToday && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setDateStr(todayLocal())}
              >
                {t("sales.today")}
              </button>
            )}
          </div>
        </div>

        <div
          className="stats-row"
          style={{
            gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
            marginBottom: 20,
          }}
        >
          <div className="stat-card indigo">
            <div className="stat-icon">
              <i className="fas fa-shirt"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {moneyShort(netQty, locale)}
            </div>
            <div className="stat-label">{t("sales.totalQty")}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon">
              <i className="fas fa-file-invoice"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {dayInvoices.length}
            </div>
            <div className="stat-label">{t("sales.invoices")}</div>
          </div>
          <div className="stat-card cyan">
            <div className="stat-icon">
              <i className="fas fa-money-bill-wave"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 18 }}>
              {moneyShort(revenue, locale)} {t("currency")}
            </div>
            <div className="stat-label">{t("sales.revenue")}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon">
              <i className="fas fa-undo"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 18 }}>
              {dayReturns.length} • {moneyShort(returnsAmount, locale)}{" "}
              {t("currency")}
            </div>
            <div className="stat-label">{t("sales.returns")}</div>
          </div>
          <div className={`stat-card ${net >= 0 ? "purple" : "red"}`}>
            <div className="stat-icon">
              <i className="fas fa-sack-dollar"></i>
            </div>
            <div className="stat-value" style={{ fontSize: 18 }}>
              {moneyShort(net, locale)} {t("currency")}
            </div>
            <div className="stat-label">{t("sales.net")}</div>
          </div>
        </div>

        {Object.keys(byMethod).length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 12, fontSize: 14 }}>
              <i
                className="fas fa-wallet"
                style={{ color: "#6366f1", marginLeft: 6 }}
              ></i>
              {t("sales.byMethod")}
            </h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(byMethod).map(([m, amt]) => (
                <span
                  key={m}
                  style={{
                    background: "#eef2ff",
                    color: "#4338ca",
                    padding: "6px 14px",
                    borderRadius: 20,
                    fontSize: 13,
                    fontWeight: 700,
                    border: "1px solid #c7d2fe",
                  }}
                >
                  {getPaymentLabel(m, lang)}: {moneyShort(amt, locale)}{" "}
                  {t("currency")}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("sales.list")} — {dayLabel()}
            </h3>
            <span className="table-count">{rows.length}</span>
          </div>
          <Pagination
            data={rows}
            pageSize={20}
            resetKey={dateStr}
            empty={
              <div className="empty-state" style={{ padding: "30px" }}>
                <div className="empty-icon">
                  <i className="fas fa-shopping-bag"></i>
                </div>
                <p>{t("sales.empty")}</p>
              </div>
            }
            render={(pageItems, total, start) => (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("sales.time")}</th>
                    <th>{t("sales.client")}</th>
                    <th>{t("sales.product")}</th>
                    <th>{t("sales.qty")}</th>
                    <th>{t("sales.amount")}</th>
                    <th>{t("sales.payment")}</th>
                    <th>{t("sales.ref")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r, i) => (
                    <tr key={r.key}>
                      <td style={{ color: "#94a3b8" }}>{start + i + 1}</td>
                      <td>{fmtTime(r.dt)}</td>
                      <td style={{ fontWeight: 600 }}>{r.clientName}</td>
                      <td style={{ fontSize: 12, color: "#475569", maxWidth: 260, whiteSpace: "normal", lineHeight: 1.6 }}>
                        {r.itemsSummary || "—"}
                      </td>
                      <td style={{ fontWeight: 800 }}>{r.totalQtyInv}</td>
                      <td style={{ fontWeight: 700, color: "#059669" }}>
                        {moneyShort(r.amount, locale)}
                      </td>
                      <td>
                        <span style={{ background: "#f1f5f9", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, color: "#334155" }}>
                          {getPaymentLabel(r.method, lang)}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace" }}>{r.ref}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          />
        </div>
      </div>
    </div>
  );
}
