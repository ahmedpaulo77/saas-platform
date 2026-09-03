// src/pages/Notifications.js - مع دعم الترجمة وإشعارات Push الحقيقية
// ✅ الحساب دلوقتي مركزي في NotificationsContext، والصفحة دي بس بتعرض
// نفس الداتا اللي بيشوفها الـ Sidebar (رقم واحد متطابق في كل مكان)
import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import { initializePushNotifications, onForegroundMessage } from "../firebase/config";

export default function Notifications() {
  const { t } = useLanguage();
  const { currentUser, userCompanyId } = useAuth();
  // ✅ نفس المصدر اللي بيقرا منه الـ Sidebar
  const { notifications, loading, refresh } = useNotifications();
  const [filter, setFilter] = useState("all");
  const [pushStatus, setPushStatus] = useState("");
  const [pushSupported, setPushSupported] = useState(false);

  // Check push support on mount
  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'Notification' in window;
    setPushSupported(supported);
  }, []);

  // Listen for foreground push messages
  useEffect(() => {
    const unsubscribe = onForegroundMessage((payload) => {
      console.log('Push notification received:', payload);
      // ✅ التنبيه اللحظي (Push) بيتضاف في الوقت الفعلي، لحد ما refresh() الجاي
      // من الـ Context يجيب النسخة المحدثة من قاعدة البيانات
      if (payload.notification) {
        refresh();
      }
    });
    return unsubscribe;
  }, [refresh]);

  const handleEnablePush = async () => {
    setPushStatus("جاري التفعيل...");
    const token = await initializePushNotifications(currentUser?.uid, userCompanyId);
    if (token) {
      alert("تم تفعيل إشعارات Push بنجاح! ستصلك التنبيهات في الخلفية حتى عند إغلاق التطبيق.");
      setPushStatus("active");
    } else {
      alert("تعذر تفعيل الإشعارات. يرجى التأكد من السماح بالإشعارات في المتصفح.");
      setPushStatus("failed");
    }
  };

  const filtered =
    filter === "all"
      ? notifications
      : notifications.filter((n) => n.type === filter);

  const counts = {
    all: notifications.length,
    danger: notifications.filter((n) => n.type === "danger").length,
    warning: notifications.filter((n) => n.type === "warning").length,
    info: notifications.filter((n) => n.type === "info").length,
  };

  if (loading)
    return (
      <div className="loading">
        <div className="spinner"></div>{t("common.loading")}
      </div>
    );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1>
              <i
                className="fas fa-bell"
                style={{ color: "#6366f1", marginLeft: 10 }}
              ></i>
              {t("nt.title")}
            </h1>
            <p className="subtitle">{t("nt.subtitle")}</p>
          </div>
          
          <div style={{ display: "flex", gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {pushSupported && (
              <>
                <button
                  onClick={handleEnablePush}
                  className="btn-primary"
                  style={{ background: pushStatus === 'active' ? '#10b981' : '#6366f1', borderColor: pushStatus === 'active' ? '#10b981' : '#6366f1' }}
                  disabled={pushStatus === 'جاري التفعيل...'}
                >
                  <i className="fas fa-satellite-dish" style={{ marginLeft: 6 }}></i>
                  {pushStatus === 'active' ? '✅ مفعل' : pushStatus || 'تفعيل إشعارات Push'}
                </button>
                {pushStatus && (
                  <span style={{ fontSize: 12, color: pushStatus === 'active' ? '#10b981' : '#ef4444' }}>
                    {pushStatus}
                  </span>
                )}
              </>
            )}
            {!pushSupported && (
              <span style={{ color: 'var(--gray-500)', fontSize: 13 }}>
                <i className="fas fa-exclamation-triangle" style={{ marginLeft: 6 }}></i>
                المتصفح لا يدعم Push Notifications
              </span>
            )}

            <button
              onClick={refresh}
              className="btn-secondary"
            >
              <i className="fas fa-sync-alt"></i> {t("common.refresh")}
            </button>
          </div>
        </div>

        <div
          className="stats-row"
          style={{
            gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
            marginBottom: 24,
          }}
        >
          <div className="stat-card indigo">
            <div className="stat-icon">
              <i className="fas fa-bell"></i>
            </div>
            <div className="stat-value">{counts.all}</div>
            <div className="stat-label">{t("nt.total")}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon">
              <i className="fas fa-exclamation-circle"></i>
            </div>
            <div className="stat-value">{counts.danger}</div>
            <div className="stat-label">{t("nt.urgent")}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <div className="stat-value">{counts.warning}</div>
            <div className="stat-label">{t("nt.warn")}</div>
          </div>
          <div className="stat-card cyan">
            <div className="stat-icon">
              <i className="fas fa-info-circle"></i>
            </div>
            <div className="stat-value">{counts.info}</div>
            <div className="stat-label">{t("nt.info")}</div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {[
            { key: "all", label: t("nt.all"), icon: "fas fa-list" },
            { key: "danger", label: t("nt.urgent"), icon: "fas fa-exclamation-circle" },
            { key: "warning", label: t("nt.warnOne"), icon: "fas fa-exclamation-triangle" },
            { key: "info", label: t("nt.infoOne"), icon: "fas fa-info-circle" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={
                filter === tab.key
                  ? "btn-primary btn-sm"
                  : "btn-secondary btn-sm"
              }
            >
              <i className={tab.icon}></i> {tab.label}
              {counts[tab.key] > 0 && (
                <span
                  style={{
                    background:
                      filter === tab.key
                        ? "rgba(255,255,255,0.25)"
                        : "var(--primary-bg)",
                    color: filter === tab.key ? "white" : "var(--primary)",
                    padding: "1px 7px",
                    borderRadius: 60,
                    fontSize: 10,
                    marginRight: 4,
                    fontWeight: 700,
                  }}
                >
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <i
                className="fas fa-check-circle"
                style={{ color: "#10b981" }}
              ></i>
            </div>
            <h3>{t("nt.quiet")}</h3>
            <p>{t("nt.none")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((n) => (
              <div key={n.id} className={`notification-item ${n.type}`}>
                <div className="notification-icon">
                  <i className={n.icon}></i>
                </div>
                <div className="notification-content">
                  <div className="notification-title">{n.title}</div>
                  <div className="notification-msg">{n.message}</div>
                  <div className="notification-date">
                    <i className="fas fa-clock" style={{ marginLeft: 4 }}></i>
                    {new Date(n.date).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className={`badge ${n.type === "danger" ? "badge-expired" : n.type === "warning" ? "badge-pending" : "badge-info"}`}
                >
                  {n.type === "danger"
                    ? t("nt.urgent")
                    : n.type === "warning"
                      ? t("nt.warnOne")
                      : t("nt.infoOne")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}