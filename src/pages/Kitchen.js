// src/pages/Kitchen.js - شاشة المطبخ: كانبان لحظي للأوردرات (تيك أواي/توصيل)
// ✅ شاشة مستقلة من غير Sidebar عشان تتفتح على تابلت/شاشة في المطبخ وتاخد
// المساحة كلها. بتقرا من نفس invoices اللي POS.js بيكتب فيها، وبتستخدم
// onSnapshot عشان أي أوردر جديد يظهر فورًا من غير ما حد يعمل Refresh يدوي.
import React, { useState, useEffect, useMemo } from "react";
import { onSnapshot, doc, updateDoc, collection, query, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { db } from "../firebase/config";
import { Link } from "react-router-dom";

const COLUMNS = [
  { key: "new", labelKey: "kit.new", color: "#ef4444", bg: "#fef2f2", next: "preparing" },
  { key: "preparing", labelKey: "kit.preparing", color: "#f59e0b", bg: "#fffbeb", next: "ready" },
  { key: "ready", labelKey: "kit.ready", color: "#10b981", bg: "#ecfdf5", next: "completed" },
];

const NEXT_LABEL_KEY = {
  new: "kit.markPreparing",
  preparing: "kit.markReady",
  ready: "kit.markCompleted",
};

function useElapsedMinutes(dateStr) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000); // تحديث كل 15 ثانية
    return () => clearInterval(id);
  }, []);
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((now - new Date(dateStr).getTime()) / 60000));
}

function OrderCard({ order, t, onAdvance }) {
  const minutes = useElapsedMinutes(order.createdAt || order.date);
  const urgencyColor = minutes >= 20 ? "#ef4444" : minutes >= 10 ? "#f59e0b" : "#94a3b8";
  const column = COLUMNS.find((c) => c.key === order.orderStatus) || COLUMNS[0];

  return (
    <div
      style={{
        background: "white",
        borderRadius: 14,
        border: `2px solid ${column.color}33`,
        padding: 16,
        marginBottom: 14,
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: "#1e293b" }}>
          {order.orderType === "delivery" ? "🛵" : "🥡"} #{order.id.slice(0, 5).toUpperCase()}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: urgencyColor,
            background: `${urgencyColor}17`,
            padding: "3px 10px",
            borderRadius: 20,
          }}
        >
          <i className="fas fa-clock" style={{ marginLeft: 4 }}></i>
          {minutes} {t("kit.minAgo")}
        </span>
      </div>

      {order.orderType === "delivery" && order.deliveryAddress && (
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, background: "#f8fafc", padding: "6px 10px", borderRadius: 8 }}>
          📍 {order.deliveryAddress}
          {order.deliveryPhone && <> · 📞 {order.deliveryPhone}</>}
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        {(order.items || []).map((item, idx) => (
          <div key={idx} style={{ padding: "6px 0", borderBottom: idx < order.items.length - 1 ? "1px dashed #e2e8f0" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
              <span>{item.productName}</span>
              <span style={{ color: "#6366f1" }}>× {item.quantity}</span>
            </div>
            {item.extras && item.extras.length > 0 && (
              <div style={{ fontSize: 12, color: "#6d28d9", marginTop: 2 }}>
                + {item.extras.map((ex) => ex.name).join("، ")}
              </div>
            )}
            {item.note && (
              <div style={{ fontSize: 12, color: "#b45309", marginTop: 2, fontStyle: "italic" }}>
                📝 {item.note}
              </div>
            )}
          </div>
        ))}
      </div>

      {order.customerNote && (
        <div style={{ fontSize: 12, color: "#b45309", marginBottom: 10, background: "#fffbeb", padding: "6px 10px", borderRadius: 8 }}>
          📝 {order.customerNote}
        </div>
      )}

      <button
        onClick={() => onAdvance(order)}
        style={{
          width: "100%",
          border: "none",
          borderRadius: 10,
          padding: "14px",
          fontSize: 15,
          fontWeight: 800,
          color: "white",
          cursor: "pointer",
          background: column.color,
        }}
      >
        {t(NEXT_LABEL_KEY[order.orderStatus]) || t("kit.markCompleted")}
      </button>
    </div>
  );
}

export default function Kitchen() {
  const { t } = useLanguage();
  const { userRole, userCompanyId } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ✅ شاشة المطبخ تشغيلية ومشتركة: تعرض كل أوردرات الشركة لكل الأدوار
    // (مش getScopedQuery عشان هو بيحصر الـ user في الأوردرات اللي هو عملها بس)
    if (!userCompanyId && userRole !== "super_admin") return;
    const col = collection(db, "invoices");
    const q =
      userRole === "super_admin" && !userCompanyId
        ? col
        : query(col, where("companyId", "==", userCompanyId));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const data = d.data();
          // ✅ بس أوردرات المطعم (type: pos) اللي لسه شغالة (مش completed)
          if (
            data.type === "pos" &&
            data.orderStatus &&
            ["new", "preparing", "ready"].includes(data.orderStatus)
          ) {
            list.push({ id: d.id, ...data });
          }
        });
        list.sort((a, b) => new Date(a.createdAt || a.date) - new Date(b.createdAt || b.date));
        setOrders(list);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to kitchen orders:", error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [userRole, userCompanyId]);

  const grouped = useMemo(() => {
    const g = { new: [], preparing: [], ready: [] };
    orders.forEach((o) => {
      if (g[o.orderStatus]) g[o.orderStatus].push(o);
    });
    return g;
  }, [orders]);

  async function advanceOrder(order) {
    const column = COLUMNS.find((c) => c.key === order.orderStatus);
    if (!column) return;
    try {
      await updateDoc(doc(db, "invoices", order.id), { orderStatus: column.next });
    } catch (e) {
      console.error("Error updating order status:", e);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#1e293b" }}>
            <i className="fas fa-fire" style={{ color: "#ef4444", marginLeft: 10 }}></i>
            {t("kit.title")}
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{t("kit.subtitle")}</p>
        </div>
        <Link
          to="/dashboard"
          style={{
            color: "#6366f1",
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
            background: "white",
            padding: "8px 16px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
          }}
        >
          <i className="fas fa-arrow-right" style={{ marginLeft: 6 }}></i>
          {t("kit.back")}
        </Link>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          {t("common.loading")}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {COLUMNS.map((col) => (
            <div key={col.key}>
              <div
                style={{
                  background: col.bg,
                  border: `2px solid ${col.color}44`,
                  borderRadius: 12,
                  padding: "10px 16px",
                  marginBottom: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 15, color: col.color }}>
                  {t(col.labelKey)}
                </span>
                <span
                  style={{
                    background: col.color,
                    color: "white",
                    borderRadius: 20,
                    padding: "2px 10px",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {grouped[col.key].length}
                </span>
              </div>

              {grouped[col.key].length === 0 ? (
                <div style={{ textAlign: "center", color: "#cbd5e1", padding: "30px 0", fontSize: 13 }}>
                  {t("kit.empty")}
                </div>
              ) : (
                grouped[col.key].map((order) => (
                  <OrderCard key={order.id} order={order} t={t} onAdvance={advanceOrder} />
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}