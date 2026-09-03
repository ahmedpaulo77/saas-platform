// src/pages/Notifications.js - مع دعم الترجمة وإشعارات Push الحقيقية
import React, { useState, useEffect, useCallback } from "react";
import { getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import { requestNotificationPermission } from "../firebase/config";

export default function Notifications() {
  const { t } = useLanguage();
  const { userRole, userCompanyId } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
const [, setPushStatus] = useState("");
  const fetchNotifications = useCallback(async () => {
    try {
      const list = [];

      const productsSnap = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId)
      );
      productsSnap.forEach((d) => {
        const p = { id: d.id, ...d.data() };
        if (p.quantity < 5) {
          list.push({
            id: `stock-${p.id}`,
            type: "warning",
            icon: "fas fa-exclamation-triangle",
            title: t("nt.stockTitle", { name: p.name }),
            message: t("nt.stockMsg", { qty: p.quantity }),
            date: new Date().toISOString(),
          });
        }
      });

      const invoicesSnap = await getDocs(
        getScopedQuery("invoices", userRole, userCompanyId)
      );
      invoicesSnap.forEach((d) => {
        const inv = { id: d.id, ...d.data() };
        if (inv.status === "overdue") {
          list.push({
            id: `inv-${inv.id}`,
            type: "danger",
            icon: "fas fa-file-invoice",
            title: t("nt.invTitle"),
            message: t("nt.invMsg", { amount: inv.amount?.toLocaleString() }),
            date: inv.date || new Date().toISOString(),
          });
        }
      });

      const tasksSnap = await getDocs(
        getScopedQuery("tasks", userRole, userCompanyId)
      );
      tasksSnap.forEach((d) => {
        const task = { id: d.id, ...d.data() };
        if (task.dueDate && task.status !== "completed") {
          const due = new Date(task.dueDate);
          const diff = Math.ceil((due - new Date()) / 86400000);
          if (diff <= 3 && diff >= 0) {
            const when = diff === 0 ? t("nt.taskToday") : t("nt.taskDays", { n: diff });
            list.push({
              id: `task-${task.id}`,
              type: "info",
              icon: "fas fa-tasks",
              title: t("nt.taskTitle", { title: task.title }),
              message: t("nt.taskMsg", {
                date: due.toLocaleDateString(),
                when: when,
              }),
              date: task.dueDate,
            });
          }
        }
      });

      list.sort((a, b) => new Date(b.date) - new Date(a.date));
      setNotifications(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, t]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleEnablePush = async () => {
    setPushStatus("jari...");
    const token = await requestNotificationPermission();
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
          
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleEnablePush}
              className="btn-primary"
              style={{ background: "#10b981", borderColor: "#10b981" }}
            >
              <i className="fas fa-satellite-dish" style={{ marginLeft: 6 }}></i>
              تفعيل إشعارات Push في الخلفية
            </button>

            <button
              onClick={() => {
                setLoading(true);
                fetchNotifications();
              }}
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