// src/pages/Dashboard.js
import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/common/Sidebar";
import { getAvailableModules } from "../utils/modules";
import { useLanguage } from "../i18n/LanguageContext";

// كل الكروت المتاحة مع الوحدة المرتبطة بكل كارت
const ALL_FEATURE_CARDS = [
  {
    to: "/companies",
    icon: "fas fa-building",
    color: "#6366f1",
    bg: "#eef2ff",
    titleKey: "dash.c1.t",
    descKey: "dash.c1.d",
    module: "companies",
  },
  {
    to: "/clients",
    icon: "fas fa-user-friends",
    color: "#10b981",
    bg: "#d1fae5",
    titleKey: "dash.c2.t",
    descKey: "dash.c2.d",
    module: "clients",
  },
  {
    to: "/sellers",
    icon: "fas fa-store",
    color: "#f59e0b",
    bg: "#fef3c7",
    titleKey: "dash.c9.t",
    descKey: "dash.c9.d",
    module: "sellers",
  },
  {
    to: "/buyers",
    icon: "fas fa-user-plus",
    color: "#ec4899",
    bg: "#fdf2f8",
    titleKey: "dash.c10.t",
    descKey: "dash.c10.d",
    module: "buyers",
  },
  {
    to: "/invoices",
    icon: "fas fa-file-invoice",
    color: "#f59e0b",
    bg: "#fef3c7",
    titleKey: "dash.c3.t",
    descKey: "dash.c3.d",
    module: "invoices",
  },
  {
    to: "/inventory",
    icon: "fas fa-boxes",
    color: "#8b5cf6",
    bg: "#f3e8ff",
    titleKey: "dash.c4.t",
    descKey: "dash.c4.d",
    module: "inventory",
  },
  {
    to: "/tasks",
    icon: "fas fa-tasks",
    color: "#ec4899",
    bg: "#fdf2f8",
    titleKey: "dash.c5.t",
    descKey: "dash.c5.d",
    module: "tasks",
  },
  {
    to: "/projects",
    icon: "fas fa-project-diagram",
    color: "#f43f5e",
    bg: "#ffe4e6",
    titleKey: "dash.c6.t",
    descKey: "dash.c6.d",
    module: "projects",
  },
  {
    to: "/users",
    icon: "fas fa-users",
    color: "#8b5cf6",
    bg: "#f3e8ff",
    titleKey: "dash.c7.t",
    descKey: "dash.c7.d",
    module: "users",
  },
  {
    to: "/reports",
    icon: "fas fa-chart-pie",
    color: "#06b6d4",
    bg: "#ecfeff",
    titleKey: "dash.c8.t",
    descKey: "dash.c8.d",
    module: "reports",
  },
];

export default function Dashboard() {
  const { t } = useLanguage();
  const { currentUser, userRole, userCompanyId, userIndustry, logout } =
    useAuth();
  const navigate = useNavigate();

  // ✅ التحقق من أن المستخدم Admin أو Super Admin
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  const availableModules = getAvailableModules(userIndustry, userRole);
  const featureCards = ALL_FEATURE_CARDS.filter((card) =>
    availableModules.has(card.module)
  );
  const [stats, setStats] = useState({
    companies: 0,
    clients: 0,
    sellers: 0,
    buyers: 0,
    invoices: 0,
    tasks: 0,
    projects: 0,
    users: 0,
    revenue: 0,
  });
  const [loading, setLoading] = useState(true);

  // ✅ اسم الشركة اللي هيظهر جنب Welcome
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (!userCompanyId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "companies", userCompanyId));
        if (snap.exists()) {
          setCompanyName(snap.data().name || "");
        }
      } catch (e) {
        console.error("Failed to fetch company name", e);
      }
    })();
  }, [userCompanyId]);

  useEffect(() => {
    if (!currentUser) return;
    if (userRole !== "super_admin" && !userCompanyId) return;

    // ✅ لو مش Admin، ميجيبش الإحصائيات
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const compRef = collection(db, "companies");
    const cliRef = collection(db, "clients");
    const sellerRef = collection(db, "sellers");
    const buyerRef = collection(db, "buyers");
    const invRef = collection(db, "invoices");
    const taskRef = collection(db, "tasks");
    const projRef = collection(db, "projects");
    const usersRef = collection(db, "users");

    const isSuper = userRole === "super_admin";

    const compQ = isSuper
      ? compRef
      : query(compRef, where("__name__", "==", userCompanyId));
    const cliQ = isSuper
      ? cliRef
      : query(cliRef, where("companyId", "==", userCompanyId));
    const sellerQ = isSuper
      ? sellerRef
      : query(sellerRef, where("companyId", "==", userCompanyId));
    const buyerQ = isSuper
      ? buyerRef
      : query(buyerRef, where("companyId", "==", userCompanyId));
    const invQ = isSuper
      ? invRef
      : query(invRef, where("companyId", "==", userCompanyId));
    const taskQ = isSuper
      ? taskRef
      : query(taskRef, where("companyId", "==", userCompanyId));
    const projQ = isSuper
      ? projRef
      : query(projRef, where("companyId", "==", userCompanyId));
    const usersQ = isSuper
      ? usersRef
      : query(usersRef, where("companyId", "==", userCompanyId));

    const unsubComp = onSnapshot(compQ, (snap) =>
      setStats((prev) => ({ ...prev, companies: snap.size }))
    );
    const unsubCli = onSnapshot(cliQ, (snap) =>
      setStats((prev) => ({ ...prev, clients: snap.size }))
    );
    const unsubSeller = onSnapshot(sellerQ, (snap) =>
      setStats((prev) => ({ ...prev, sellers: snap.size }))
    );
    const unsubBuyer = onSnapshot(buyerQ, (snap) =>
      setStats((prev) => ({ ...prev, buyers: snap.size }))
    );
    const unsubTask = onSnapshot(taskQ, (snap) =>
      setStats((prev) => ({ ...prev, tasks: snap.size }))
    );
    const unsubProj = onSnapshot(projQ, (snap) =>
      setStats((prev) => ({ ...prev, projects: snap.size }))
    );
    const unsubUsers = onSnapshot(usersQ, (snap) =>
      setStats((prev) => ({ ...prev, users: snap.size }))
    );

    const unsubInv = onSnapshot(invQ, (snap) => {
      let totalRevenue = 0;
      snap.forEach((doc) => {
        const inv = doc.data();
        if (inv.status === "paid") {
          const amount = parseFloat(inv.amount) || 0;
          totalRevenue += amount;
        } else {
          const paid = parseFloat(inv.paidAmount) || 0;
          totalRevenue += paid;
        }
      });
      setStats((prev) => ({
        ...prev,
        invoices: snap.size,
        revenue: totalRevenue,
      }));
      setLoading(false);
    });

    return () => {
      unsubComp();
      unsubCli();
      unsubSeller();
      unsubBuyer();
      unsubInv();
      unsubTask();
      unsubProj();
      unsubUsers();
    };
  }, [currentUser, userRole, userCompanyId, isAdmin]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              {t("dash.welcome")}
              {companyName && (
                <span style={{ fontSize: "inherit", fontWeight: "inherit" }}>
                  {" "}({companyName})
                </span>
              )}
            </h1>
            <p className="subtitle">{t("dash.subtitle")}</p>
          </div>
          <div className="user-info">
            <div className="avatar">
              {currentUser?.email?.charAt(0).toUpperCase() || "A"}
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>
              {currentUser?.email}
            </span>
            <span className="role-badge">
              {userRole === "super_admin"
                ? `👑 ${t("role.superAdmin")}`
                : userRole === "admin"
                ? `⚡ ${t("role.admin")}`
                : `👤 ${t("role.user")}`}
            </span>
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="btn-danger btn-sm"
            >
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </div>

        {/* ✅ Stats - تظهر فقط للأدمن */}
        {isAdmin ? (
          <div className="stats-row">
            <div className="stat-card indigo">
              <div className="stat-icon">
                <i className="fas fa-building"></i>
              </div>
              <div className="stat-value">
                {loading ? "..." : stats.companies}
              </div>
              <div className="stat-label">{t("dash.companies")}</div>
            </div>
            <div className="stat-card green">
              <div className="stat-icon">
                <i className="fas fa-user-friends"></i>
              </div>
              <div className="stat-value">{loading ? "..." : stats.clients}</div>
              <div className="stat-label">{t("dash.clients")}</div>
            </div>
            <div className="stat-card amber">
              <div className="stat-icon">
                <i className="fas fa-store"></i>
              </div>
              <div className="stat-value">{loading ? "..." : stats.sellers}</div>
              <div className="stat-label">{t("dash.sellers")}</div>
            </div>
            <div className="stat-card pink">
              <div className="stat-icon">
                <i className="fas fa-user-plus"></i>
              </div>
              <div className="stat-value">{loading ? "..." : stats.buyers}</div>
              <div className="stat-label">{t("dash.buyers")}</div>
            </div>
            <div className="stat-card amber">
              <div className="stat-icon">
                <i className="fas fa-file-invoice"></i>
              </div>
              <div className="stat-value">{loading ? "..." : stats.invoices}</div>
              <div className="stat-label">{t("dash.invoices")}</div>
            </div>
            <div className="stat-card pink">
              <div className="stat-icon">
                <i className="fas fa-tasks"></i>
              </div>
              <div className="stat-value">{loading ? "..." : stats.tasks}</div>
              <div className="stat-label">{t("dash.tasks")}</div>
            </div>
            <div className="stat-card red">
              <div className="stat-icon">
                <i className="fas fa-project-diagram"></i>
              </div>
              <div className="stat-value">{loading ? "..." : stats.projects}</div>
              <div className="stat-label">{t("dash.projects")}</div>
            </div>
            <div className="stat-card purple">
              <div className="stat-icon">
                <i className="fas fa-users"></i>
              </div>
              <div className="stat-value">{loading ? "..." : stats.users}</div>
              <div className="stat-label">{t("dash.users")}</div>
            </div>
            <div className="stat-card cyan">
              <div className="stat-icon">
                <i className="fas fa-money-bill-wave"></i>
              </div>
              <div className="stat-value" style={{ fontSize: 22 }}>
                {loading ? "..." : stats.revenue.toLocaleString()}
              </div>
              <div className="stat-label">{t("dash.revenue")}</div>
            </div>
          </div>
        ) : (
          // ✅ لو مش Admin، يظهر رسالة
          <div className="card" style={{ textAlign: "center", padding: "40px 20px", marginBottom: 24 }}>
            <i className="fas fa-lock" style={{ fontSize: 32, color: "#94a3b8", marginBottom: 12 }}></i>
            <h3 style={{ color: "#64748b", fontSize: 16 }}>الإحصائيات متاحة للمديرين فقط</h3>
            <p style={{ color: "#94a3b8", fontSize: 13 }}>يمكنك الوصول إلى البيانات المتعلقة بعملك فقط</p>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <div className="section-title">
            <i className="fas fa-th-large"></i> {t("dash.modules")}
          </div>
        </div>
        <div className="grid-3">
          {featureCards.map((card) => (
            <div key={card.to} className="card hoverable feature-card">
              <div
                className="card-icon"
                style={{
                  background: card.bg,
                  color: card.color,
                  width: 52,
                  height: 52,
                }}
              >
                <i className={card.icon}></i>
              </div>
              <div className="card-body">
                <h3 style={{ color: "#1e293b" }}>{t(card.titleKey)}</h3>
                <p>{t(card.descKey)}</p>
              </div>
              <button
                onClick={() => navigate(card.to)}
                className="btn-primary btn-block"
              >
                <i className="fas fa-arrow-left"></i> {t("dash.go")}
              </button>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginTop: 4 }}>
          <div
            className="card"
            style={{
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "white",
              border: "none",
            }}
          >
            <h3 style={{ color: "white", marginBottom: 8 }}>
              <i className="fas fa-crown"></i> {t("dash.upgrade")}
            </h3>
            <p style={{ color: "rgba(255,255,255,0.75)", marginBottom: 20 }}>
              {t("dash.upgradeDesc")}
            </p>
            <button
              onClick={() => navigate("/subscription")}
              style={{
                background: "white",
                color: "#6366f1",
                border: "none",
                padding: "10px 22px",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 14,
                fontFamily: "Cairo, sans-serif",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <i className="fas fa-arrow-left"></i> {t("dash.viewPlans")}
            </button>
          </div>
          <div
            className="card"
            style={{
              background: "linear-gradient(135deg,#0f172a,#1e293b)",
              color: "white",
              border: "none",
            }}
          >
            <h3 style={{ color: "white", marginBottom: 8 }}>
              <i className="fas fa-chart-line"></i> {t("dash.reports")}
            </h3>
            <p style={{ color: "rgba(255,255,255,0.6)", marginBottom: 20 }}>
              {t("dash.reportsDesc")}
            </p>
            <button
              onClick={() => navigate("/reports")}
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.2)",
                padding: "10px 22px",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 14,
                fontFamily: "Cairo, sans-serif",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <i className="fas fa-arrow-left"></i> {t("dash.viewReports")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}