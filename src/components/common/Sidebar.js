// src/components/common/Sidebar.js - نسخة محسنة مع Messages + Badge للإشعارات
import React, { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { useNotifications } from "../../context/NotificationsContext.js";
import { getAvailableModules } from "../../utils/modules.js";
import {
  iconFor,
  INVENTORY_ICON,
  PROJECTS_ICON,
  APPOINTMENTS_ICON,
  RAW_MATERIALS_ICON,
  SALES_ICON,
  POS_ICON,
  STORE_POS_ICON,
  CLIENTS_ICON,
  SELLERS_ICON,
  PATIENTS_ICON,
  SUPPLIERS_ICON,
} from "../../utils/icons.js";
import LanguageToggle from "./LanguageToggle.js";
import Logo from "./Logo.jsx";
import { useTheme } from "../../context/ThemeContext.js";
import { useLanguage } from "../../i18n/LanguageContext.js";
import "./Sidebar.css";

export default function Sidebar() {
  const { t } = useLanguage();
  const { theme, toggleTheme, isDark } = useTheme();
  const { userRole, currentUser, userIndustry, userDisabledModules, logout } = useAuth();
  // ✅ عدد التنبيهات غير المقروءة - جاي من الـ Context المشترك
  const { unreadCount } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  // بحث القائمة + طي المجموعات — حالة عرض فقط، لا تمس الصلاحيات إطلاقاً
  const [navSearch, setNavSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});

  function groupLabel(key, fallback) {
    const v = t(key);
    return v === key ? fallback : v;
  }

  const isHrIndustry = userIndustry === "hr";
  const NAV_GROUPS = useMemo(() => (isHrIndustry ? [
    { id: "staff", label: groupLabel("nav.groups.staff", "الموظفين") },
    { id: "leavepay", label: groupLabel("nav.groups.leavepay", "الإجازات والرواتب") },
    { id: "system", label: groupLabel("nav.groups.system", "النظام") },
  ] : [
    { id: "sales", label: groupLabel("nav.groups.sales", "المبيعات والفواتير") },
    { id: "stock", label: groupLabel("nav.groups.stock", "المخزون والمشتريات") },
    { id: "people", label: groupLabel("nav.groups.people", "العملاء والخدمات") },
    { id: "ops", label: groupLabel("nav.groups.ops", "التشغيل والمشاريع") },
  ]), // eslint-disable-next-line react-hooks/exhaustive-deps
  [t, userIndustry]);

  // نفس الـ modules بدون أي تغيير — التجميع بصري فقط
  // (للموارد البشرية: 3 مجموعات مخصصة، باقي المجالات زي ما هي)
  function moduleGroup(module) {
    if (isHrIndustry) {
      if (["employees", "attendance", "shifts", "biometric", "emp-docs", "my-hr"].includes(module)) return "staff";
      if (["leaves", "payroll", "requests", "holidays"].includes(module)) return "leavepay";
      return "system";
    }
    if (["pos", "store-pos", "sales", "sales-reps", "invoices", "purchases", "expenses", "profits", "vouchers"].includes(module)) return "sales";
    if (["inventory", "variant-codes", "types-categories", "daily-prices", "menu-categories", "raw-materials", "suppliers", "expiry"].includes(module)) return "stock";
    if (["clients", "sellers", "buyers", "viewings", "patients", "appointments", "prescriptions", "messages", "employees", "leaves", "payroll", "shifts", "biometric"].includes(module)) return "people";
    return "ops";
  }

  // ✅ تعريف القوائم جوه المكون (عشان الترجمة)
  const isRestaurant = (userIndustry === "restaurant" || userIndustry === "cafe");
  const isRealEstate = userIndustry === "real_estate";
  // 🆕 الأيقونات بتتبع المهنة — قبل كند كان كل الصفحات بتستخدم نفس
  // الأيقونة (fa-boxes) فمحل سباكة كان بيشوف "علب" في المخزون وعيادة
  // بتشوف "علب" بدل pills. العناوين كانت مظبوطة والأيقونات لأ.
  const invIcon = iconFor(INVENTORY_ICON, userIndustry);
  const projIcon = iconFor(PROJECTS_ICON, userIndustry);
  const apptIcon = iconFor(APPOINTMENTS_ICON, userIndustry);
  const rawIcon = iconFor(RAW_MATERIALS_ICON, userIndustry);
  // 🆕 العيادة: "فاتورة الكشف" مش "الفواتير" — كشف بأتعاب مش بيع أصناف
  const isClinic = userIndustry === "clinic";
  const posIcon = iconFor(POS_ICON, userIndustry);
  const storePosIcon = iconFor(STORE_POS_ICON, userIndustry);
  const clientsIcon = iconFor(CLIENTS_ICON, userIndustry);
  const sellersIcon = iconFor(SELLERS_ICON, userIndustry);
  const patientsIcon = iconFor(PATIENTS_ICON, userIndustry);
  const suppliersIcon = iconFor(SUPPLIERS_ICON, userIndustry);

  const ALL_NAV_ITEMS = [
    {
      to: "/dashboard",
      icon: "fas fa-th-large",
      label: t("nav.dashboard"),
      module: "dashboard",
    },
    {
      to: "/purchases",
      icon: "fas fa-cart-arrow-down",
      label: t("nav.purchases"),
      module: "purchases",
    },

    {
      to: "/pos",
      icon: `fas ${posIcon}`,
      label: t("nav.pos"),
      module: "pos",
    },
    {
      to: "/store-pos",
      icon: `fas ${storePosIcon}`,
      label: t("nav.storePos"),
      module: "store-pos",
    },
    {
      to: "/promotions",
      icon: "fas fa-percent",
      label: t("nav.promotions"),
      module: "promotions",
    },
    {
      to: "/sales",
      icon: "fas fa-shopping-bag",
      label: t("nav.sales"),
      module: "sales",
    },
    {
      to: "/sales-reps",
      icon: "fas fa-user-tie",
      label: t("nav.salesReps"),
      module: "sales-reps",
    },
    {
      // ⚠️ كان "/companies" ——was بيودّي لنسخة قديمة من الداشبورد.
      // إدارة الشركات للسوبر أدمن في قسم "الإدارة" بالأسفل (/admin).
      to: "/patients",
      icon: `fas ${patientsIcon}`,
      label: t("nav.patients"),
      module: "patients",
    },
    {
      to: "/appointments",
      icon: `fas ${apptIcon}`,
      label: t("nav.appointments"),
      module: "appointments",
    },
    {
      to: "/prescriptions",
      icon: "fas fa-prescription",
      label: t("nav.prescriptions"),
      module: "prescriptions",
    },
    {
      to: "/clients",
      icon: `fas ${clientsIcon}`,
      label: isRestaurant ? t("nav.clients.restaurant") : t("nav.clients"),
      module: "clients",
    },
    {
      to: "/sellers",
      icon: `fas ${sellersIcon}`,
      label: t("sellers.title"),
      module: "sellers",
    },
    {
      to: "/buyers",
      icon: "fas fa-user-plus",
      label: t("buyers.title"),
      module: "buyers",
    },
    {
      to: "/viewings",
      icon: "fas fa-eye",
      label: t("nav.viewings"),
      module: "viewings",
    },
    {
      to: "/messages",
      icon: "fas fa-envelope",
      label: t("nav.messages"),
      module: "messages",
    },
    {
      to: "/invoices",
      icon: `fas ${iconFor(SALES_ICON, userIndustry)}`,
      label: isRestaurant
        ? t("nav.invoices.restaurant")
        : isClinic
        ? t("nav.invoices.clinic")
        : t("nav.invoices"),
      module: "invoices",
    },
    {
      to: "/inventory",
      icon: `fas ${invIcon}`,
      label: isRestaurant
        ? t("nav.inventory.restaurant")
        : isRealEstate
        ? t("nav.inventory.real_estate")
        : t("nav.inventory"),
      module: "inventory",
    },
    {
      to: "/variant-codes",
      icon: "fas fa-barcode",
      label: t("vc.title"),
      module: "variant-codes",
    },
    {
      to: "/types-categories",
      icon: "fas fa-shirt",
      label: t("tc.title"),
      module: "types-categories",
    },
    {
      to: "/employees",
      icon: "fas fa-users",
      label: t("emp.title"),
      module: "employees",
    },
    {
      to: "/leaves",
      icon: "fas fa-umbrella-beach",
      label: t("nav.leaves"),
      module: "leaves",
    },
    {
      to: "/payroll",
      icon: "fas fa-money-check-dollar",
      label: t("nav.payroll"),
      module: "payroll",
    },
    {
      to: "/shifts",
      icon: "fas fa-clock",
      label: t("nav.shifts"),
      module: "shifts",
    },
    {
      to: "/biometric",
      icon: "fas fa-fingerprint",
      label: t("nav.biometric"),
      module: "biometric",
    },
    {
      to: "/requests",
      icon: "fas fa-inbox",
      label: t("nav.requests"),
      module: "requests",
    },
    {
      to: "/holidays",
      icon: "fas fa-flag",
      label: t("nav.holidays"),
      module: "holidays",
    },
    {
      to: "/my-hr",
      icon: "fas fa-id-card",
      label: t("nav.myhr"),
      module: "my-hr",
    },
    {
      to: "/emp-docs",
      icon: "fas fa-file-contract",
      label: t("nav.empdocs"),
      module: "emp-docs",
    },
    {
      to: "/hr-log",
      icon: "fas fa-clock-rotate-left",
      label: t("nav.hrlog"),
      module: "hr-log",
    },
    {
      to: "/hr-settings",
      icon: "fas fa-gear",
      label: t("nav.hrsettings"),
      module: "hr-settings",
    },
        {
      to: "/daily-prices",
      icon: "fas fa-tags",
      label: t("nav.dailyPrices"),
      module: "daily-prices",
    },
    {
      to: "/menu-categories",
      icon: "fas fa-layer-group",
      label: t("nav.menuCategories"),
      module: "menu-categories",
    },
    {
      to: "/raw-materials",
      icon: `fas ${rawIcon}`,
      label: t("nav.rawMaterials"),
      module: "raw-materials",
    },
    {
  to: "/kitchen",
  icon: "fas fa-fire",
  label: t("nav.kitchen"),
  module: "kitchen",
},
    {
      to: "/tables",
      icon: "fas fa-chair",
      label: t("nav.tables") || "الطاولات",
      module: "tables",
    },
    {
      to: "/suppliers",
      icon: `fas ${suppliersIcon}`,
      label: t("nav.suppliers"),
      module: "suppliers",
    },
        {
      to: "/expenses",
      icon: "fas fa-file-invoice-dollar",
      label: t("nav.expenses"),
      module: "expenses",
    },
    {
      to: "/vouchers",
      icon: "fas fa-money-bill-transfer",
      label: t("nav.vouchers"),
      module: "vouchers",
    },
    {
      to: "/profits",
      icon: "fas fa-chart-line",
      label: t("nav.profits"),
      module: "profits",
    },
    {
      to: "/expiry",
      icon: "fas fa-calendar-times",
      label: t("nav.expiry"),
      module: "expiry",
    },
    {
      to: "/tasks",
      icon: "fas fa-tasks",
      label: t("nav.tasks"),
      module: "tasks",
    },
    {
      to: "/projects",
      icon: `fas ${projIcon}`,
      label: t("nav.projects"),
      module: "projects",
    },
    {
      to: "/certificates",
      icon: "fas fa-file-contract",
      label: t("nav.certificates"),
      module: "certificates",
    },
    {
      to: "/attendance",
      icon: "fas fa-clock",
label: t("nav.attendance"),
      module: "attendance",
    },
  ];

  const ALL_SECONDARY_ITEMS = [
    {
      to: "/my-company",
      // ⚠️ كان fa-store (محل) — والمقصود "بيانات شركتي"
      icon: "fas fa-building-circle-check",
      label: t("nav.myCompany"),
      module: "my-company",
    },
    {
      to: "/users",
      icon: "fas fa-users",
      label: t("nav.users"),
      module: "users",
    },
    {
      to: "/reports",
      icon: "fas fa-chart-pie",
      label: t("nav.reports"),
      module: "reports",
    },
    {
      to: "/statements",
      icon: "fas fa-file-invoice-dollar",
      label: t("nav.statements"),
      module: "reports",
      hideFor: ["real_estate"],
      hideRole: ["super_admin"],
    },
    {
      to: "/aging",
      icon: "fas fa-clock",
      label: t("nav.aging"),
      module: "aging",
    },
    {
      to: "/notifications",
      icon: "fas fa-bell",
      label: t("nav.notifications"),
      module: "notifications",
      badge: unreadCount,
    },

    {
      to: "/profile",
      icon: "fas fa-user-circle",
      label: t("nav.profile"),
      module: "profile",
    },
    {
      to: "/about",
      icon: "fas fa-info-circle",
      label: t("nav.about"),
      module: "about",
    },
  ];

  const availableModules = getAvailableModules(userIndustry, userRole, userDisabledModules);
  const navItems = ALL_NAV_ITEMS.filter((item) =>
    availableModules.has(item.module),
  );
  const secondaryItems = ALL_SECONDARY_ITEMS.filter(
    (item) =>
      availableModules.has(item.module) &&
      !(item.hideFor || []).includes(userIndustry) &&
      !(item.hideRole || []).includes(userRole),
  );

  // بحث + تجميع بصري فقط — لا يغير نتيجة availableModules إطلاقاً
  const q = navSearch.trim();
  const filteredNav = q
    ? navItems.filter((i) => String(i.label).includes(q))
    : navItems;
  // الداش بورد دائماً أول عنصر فوق المجموعات
  const dashboardItem = filteredNav.find((i) => i.module === "dashboard");
  const restNav = filteredNav.filter((i) => i.module !== "dashboard");
  const groupedNav = useMemo(() => {
    const map = {};
    NAV_GROUPS.forEach((g) => { map[g.id] = []; });
    restNav.forEach((item) => {
      const g = moduleGroup(item.module);
      if (!map[g]) map[g] = [];
      map[g].push(item);
    });
    // احذف المجموعات الفارغة بعد فلترة الصلاحيات
    return NAV_GROUPS.map((g) => ({ ...g, items: map[g.id] || [] }))
      .filter((g) => g.items.length > 0);
  }, [restNav, NAV_GROUPS]);

  function toggleGroup(id) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // ✅ إغلاق القائمة عند تغيير المسار
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // ✅ منع التمرير في الخلفية عند فتح القائمة
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileOpen]);

  async function handleLogout() {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  const isActive = (path) => location.pathname === path;

  // ✅ toggle function
  const toggleSidebar = () => {
    setMobileOpen(!mobileOpen);
  };

  // ✅ close function
  const closeSidebar = () => {
    setMobileOpen(false);
  };

  const sidebarContent = (
    <>
      <div
        className="logo"
        style={{ cursor: "pointer" }}
        onClick={() => {
          navigate("/dashboard");
          closeSidebar();
        }}
      >
        <Logo size={40} />
        <div className="logo-text">
          <span className="logo-name">{t("brand.name")}</span>
          <span className="logo-badge">{t("brand.tagline")}</span>
        </div>
        <button
          onClick={closeSidebar}
          className="sidebar-close-btn"
          aria-label="Close menu"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div style={{ margin: "12px 12px 4px", display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <LanguageToggle variant="sidebar" />
        </div>
        <button
          onClick={toggleTheme}
          className="lang-toggle-sidebar"
          style={{ width: 46, flexShrink: 0, padding: "10px 0" }}
          title={isDark ? t("theme.light") : t("theme.dark")}
          aria-label={isDark ? t("theme.light") : t("theme.dark")}
        >
          <i className={isDark ? "fas fa-sun" : "fas fa-moon"}></i>
        </button>
      </div>

      <nav>
        <div className="nav-search-wrap">
          <i className="fas fa-search nav-search-icon"></i>
          <input
            className="nav-search"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            placeholder={t("nav.search") === "nav.search" ? "ابحث في القائمة..." : t("nav.search")}
            aria-label="Search menu"
          />
          {!!navSearch && (
            <button className="nav-search-clear" onClick={() => setNavSearch("")} aria-label="Clear search">
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
        <div className="nav-label">{t("nav.main")}</div>
        {dashboardItem && (
          <Link
            to={dashboardItem.to}
            className={isActive(dashboardItem.to) ? "active" : ""}
            onClick={closeSidebar}
          >
            <span className="icon">
              <i className={dashboardItem.icon}></i>
            </span>
            {dashboardItem.label}
          </Link>
        )}
        {groupedNav.length === 0 && !dashboardItem && (
          <div className="nav-empty">{t("nav.noResults") === "nav.noResults" ? "لا توجد نتائج مطابقة" : t("nav.noResults")}</div>
        )}
        {groupedNav.map((group) => (
          <div key={group.id} className="nav-group">
            <button
              className="nav-group-header"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={!collapsed[group.id]}
            >
              <span>{group.label} ({group.items.length})</span>
              <i className={`fas fa-chevron-down nav-chev ${collapsed[group.id] ? "closed" : ""}`}></i>
            </button>
            {!collapsed[group.id] && group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={isActive(item.to) ? "active" : ""}
                onClick={closeSidebar}
              >
                <span className="icon">
                  <i className={item.icon}></i>
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}

        <div className="nav-label">{t("nav.settings")}</div>
        {secondaryItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={isActive(item.to) ? "active" : ""}
            onClick={closeSidebar}
          >
            <span className="icon">
              <i className={item.icon}></i>
            </span>
            {item.label}
            {/* ✅ Badge رقمي - بيظهر بس لو فيه تنبيهات غير مقروءة */}
            {!!item.badge && (
              <span
                style={{
                  marginInlineEnd: "auto",
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 5px",
                }}
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        ))}

        {userRole === "super_admin" && (
          <>
            <div className="nav-label">{t("nav.admin")}</div>
            <Link
              to="/admin"
              className={isActive("/admin") ? "active" : ""}
              onClick={closeSidebar}
            >
              <span
                className="icon"
                style={{ background: "rgba(245,158,11,0.15)" }}
              >
                <i
                  className="fas fa-shield-alt"
                  style={{ color: "#f59e0b" }}
                ></i>
              </span>
              <span style={{ color: "#fcd34d" }}>{t("nav.adminPanel")}</span>
            </Link>
            <Link
              to="/admin/users"
              className={isActive("/admin/users") ? "active" : ""}
              onClick={closeSidebar}
            >
              <span
                className="icon"
                style={{ background: "rgba(245,158,11,0.15)" }}
              >
                <i
                  className="fas fa-users-cog"
                  style={{ color: "#f59e0b" }}
                ></i>
              </span>
              <span style={{ color: "#fcd34d" }}>{t("nav.manageUsers")}</span>
            </Link>
          </>
        )}
      </nav>

      <div className="user-info-strip">
        <div className="user-avatar">
          {currentUser?.email?.charAt(0).toUpperCase() || "A"}
        </div>
        <div className="user-details">
          <div className="user-email">{currentUser?.email}</div>
          <div className="user-role">
            {userRole === "super_admin"
              ? `👑 ${t("role.superAdmin")}`
              : userRole === "admin"
                ? `⚡ ${t("role.admin")}`
                : userRole === "cashier"
                  ? `💰 ${t("role.cashier")}`
                  : userRole === "kitchen"
                    ? `🔥 ${t("role.kitchen")}`
                    : `👤 ${t("role.user")}`}
          </div>
        </div>
      </div>

      <button onClick={handleLogout} className="logout-btn">
        <i className="fas fa-sign-out-alt"></i>
        {t("nav.logout")}
      </button>
    </>
  );

  return (
    <>      {/* ✅ Hamburger Button محسن — بيختفي لما القائمة تكون مفتوحة عشان منكررش زرار الإغلاق */}
      {!mobileOpen && (
        <button
          className="hamburger-btn"
          onClick={toggleSidebar}
          aria-label={t("nav.openMenu")}
        >
          <i className="fas fa-bars"></i>
        </button>
      )}

      {/* ✅ Overlay محسن */}
      {mobileOpen && (
        <div className="sidebar-overlay active" onClick={closeSidebar} />
      )}

      {/* ✅ القائمة الجانبية */}
      <div className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        {sidebarContent}
      </div>
    </>
  );
}