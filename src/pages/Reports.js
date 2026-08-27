// src/pages/Reports.js - تعديل: User ميشوفش حاجة + فلترة حسب الصناعة
import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/common/Sidebar";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { useLanguage } from "../i18n/LanguageContext";
import { getAvailableModules } from "../utils/modules";

const ALL_EXPORT_ITEMS = [
  { type: "companies", labelKey: "rep.file.companies", icon: "fas fa-building", color: "#6366f1", module: "companies" },
  { type: "clients", labelKey: "rep.file.clients", icon: "fas fa-user-friends", color: "#10b981", module: "clients" },
  { type: "sellers", labelKey: "rep.file.sellers", icon: "fas fa-store", color: "#f59e0b", module: "sellers" },
  { type: "buyers", labelKey: "rep.file.buyers", icon: "fas fa-user-plus", color: "#ec4899", module: "buyers" },
  { type: "invoices", labelKey: "rep.file.invoices", icon: "fas fa-file-invoice", color: "#f59e0b", module: "invoices" },
  { type: "products", labelKey: "rep.file.products", icon: "fas fa-boxes", color: "#8b5cf6", module: "inventory" },
  { type: "tasks", labelKey: "rep.file.tasks", icon: "fas fa-tasks", color: "#ec4899", module: "tasks" },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: "10px 14px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          direction: "rtl",
          fontFamily: "Cairo, sans-serif",
        }}
      >
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
          {label}
        </p>
        {payload.map((p, i) => (
          <p
            key={i}
            style={{ fontSize: 14, fontWeight: 700, color: p.color || p.fill }}
          >
            {p.name}:{" "}
            {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Reports() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, userIndustry } = useAuth();
  const superAdmin = userRole === "super_admin";
  const isAdmin = userRole === "admin" || superAdmin;

  // ✅ الوحدات المتاحة حسب صناعة الشركة
  const availableModules = getAvailableModules(userIndustry, userRole);
  const exportItems = ALL_EXPORT_ITEMS.filter((item) =>
    availableModules.has(item.module)
  );

  const [stats, setStats] = useState({
    companies: 0,
    clients: 0,
    sellers: 0,
    buyers: 0,
    invoices: 0,
    products: 0,
    tasks: 0,
    totalRevenue: 0,
    paidInvoices: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    lowStockProducts: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    pendingTasks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [allData, setAllData] = useState({});
  const [exporting, setExporting] = useState(null);
  const [clientsMap, setClientsMap] = useState({});

  const [monthlyRevenue, setMonthlyRevenue] = useState([]);
  const [invoiceStatusData, setInvoiceStatusData] = useState([]);
  const [taskStatusData, setTaskStatusData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  const fetchAllData = useCallback(async () => {
    // ✅ لو مش Admin، ميجيبش حاجة
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    if (!superAdmin && !userCompanyId) {
      setLoading(false);
      return;
    }

    try {
      let companiesData = [];
      if (superAdmin) {
        const cSnap = await getDocs(collection(db, "companies"));
        companiesData = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else if (userCompanyId) {
        const snap = await getDoc(doc(db, "companies", userCompanyId));
        companiesData = snap.exists() ? [{ id: snap.id, ...snap.data() }] : [];
      }

      let clientsData = [];
      let sellersData = [];
      let buyersData = [];
      let invoicesData = [];
      let productsData = [];
      let tasksData = [];

      if (superAdmin) {
        const [clSnap, sSnap, bSnap, iSnap, pSnap, tSnap] = await Promise.all([
          getDocs(collection(db, "clients")),
          getDocs(collection(db, "sellers")),
          getDocs(collection(db, "buyers")),
          getDocs(collection(db, "invoices")),
          getDocs(collection(db, "inventory")),
          getDocs(collection(db, "tasks")),
        ]);
        clientsData = clSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        sellersData = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        buyersData = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        invoicesData = iSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        productsData = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        tasksData = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        const [clSnap, sSnap, bSnap, iSnap, pSnap, tSnap] = await Promise.all([
          getDocs(query(collection(db, "clients"), where("companyId", "==", userCompanyId))),
          getDocs(query(collection(db, "sellers"), where("companyId", "==", userCompanyId))),
          getDocs(query(collection(db, "buyers"), where("companyId", "==", userCompanyId))),
          getDocs(query(collection(db, "invoices"), where("companyId", "==", userCompanyId))),
          getDocs(query(collection(db, "inventory"), where("companyId", "==", userCompanyId))),
          getDocs(query(collection(db, "tasks"), where("companyId", "==", userCompanyId))),
        ]);
        clientsData = clSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        sellersData = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        buyersData = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        invoicesData = iSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        productsData = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        tasksData = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      const cMap = {};
      clientsData.forEach((c) => {
        cMap[c.id] = c.name;
      });
      setClientsMap(cMap);

      let revenue = 0,
        paid = 0,
        pending = 0,
        overdue = 0;
      invoicesData.forEach((inv) => {
        const amount = parseFloat(inv.amount) || 0;
        if (inv.status === "paid") {
          revenue += amount;
          paid++;
        } else if (inv.status === "pending") {
          pending++;
          revenue += parseFloat(inv.paidAmount) || 0;
        } else if (inv.status === "overdue") {
          overdue++;
          revenue += parseFloat(inv.paidAmount) || 0;
        }
      });

      const lowStockList = productsData.filter((p) => p.quantity < 5);
      const completed = tasksData.filter(
        (t) => t.status === "completed",
      ).length;
      const inProgress = tasksData.filter(
        (t) => t.status === "in-progress",
      ).length;
      const pendingTasks = tasksData.filter(
        (t) => t.status === "pending",
      ).length;

      setStats({
        companies: companiesData.length,
        clients: clientsData.length,
        sellers: sellersData.length,
        buyers: buyersData.length,
        invoices: invoicesData.length,
        products: productsData.length,
        tasks: tasksData.length,
        totalRevenue: revenue,
        paidInvoices: paid,
        pendingInvoices: pending,
        overdueInvoices: overdue,
        lowStockProducts: lowStockList.length,
        completedTasks: completed,
        inProgressTasks: inProgress,
        pendingTasks,
      });

      const monthNames = [
        "يناير",
        "فبراير",
        "مارس",
        "أبريل",
        "مايو",
        "يونيو",
        "يوليو",
        "أغسطس",
        "سبتمبر",
        "أكتوبر",
        "نوفمبر",
        "ديسمبر",
      ];
      const revenueMap = {};
      invoicesData.forEach((inv) => {
        if (!inv.date) return;
        let paidAmount = 0;
        if (inv.status === "paid") {
          paidAmount = parseFloat(inv.amount) || 0;
        } else {
          paidAmount = parseFloat(inv.paidAmount) || 0;
        }
        if (paidAmount <= 0) return;
        const d = new Date(inv.date);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        revenueMap[key] = (revenueMap[key] || 0) + paidAmount;
      });
      const last6 = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        last6.push({
          name: monthNames[d.getMonth()],
          الإيرادات: revenueMap[key] || 0,
        });
      }
      setMonthlyRevenue(last6);

      setInvoiceStatusData(
        [
          { name: t('rep.paid'), value: paid, fill: "#10b981" },
          { name: t('rep.wait'), value: pending, fill: "#f59e0b" },
          { name: t('rep.over'), value: overdue, fill: "#ef4444" },
        ].filter((d) => d.value > 0),
      );

      setTaskStatusData([
        { name: t('rep.done'), القيمة: completed, fill: "#10b981" },
        { name: t('rep.progress'), القيمة: inProgress, fill: "#6366f1" },
        { name: t('rep.wait'), القيمة: pendingTasks, fill: "#f59e0b" },
      ]);

      const sorted = [...productsData]
        .sort((a, b) => (b.price || 0) - (a.price || 0))
        .slice(0, 6);
      setTopProducts(
        sorted.map((p) => ({
          name: p.name?.slice(0, 12) || t('rep.product'),
          السعر: p.price || 0,
          الكمية: p.quantity || 0,
        })),
      );

      setRecentInvoices(
        [...invoicesData]
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 5),
      );
      setLowStock(lowStockList);
      setAllData({
        companiesData,
        clientsData,
        sellersData,
        buyersData,
        invoicesData,
        productsData,
        tasksData,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userCompanyId, superAdmin, isAdmin, t]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  async function exportToExcel(type) {
    setExporting(type);
    await new Promise((r) => setTimeout(r, 300));

    let data = [];
    let fileName = "";
    let headers = {};

    switch (type) {
      case "companies":
        data = allData.companiesData || [];
        fileName = t('rep.file.companies');
        headers = {
          name: t('rep.col.company'),
          email: t('rep.col.email'),
          plan: t('rep.col.plan'),
          isActive: t('rep.col.active'),
        };
        break;
      case "clients":
        data = allData.clientsData || [];
        fileName = t('rep.file.clients');
        headers = {
          name: t('rep.col.client'),
          email: t('rep.col.email'),
          phone: t('rep.col.phone'),
          companyId: t('rep.col.companyId'),
        };
        break;
      case "sellers":
        data = allData.sellersData || [];
        fileName = t('rep.file.sellers');
        headers = {
          name: t('sellers.name'),
          phone: t('sellers.phone'),
          email: t('sellers.email'),
          developer: t('sellers.developer'),
          project: t('sellers.project'),
          major: t('sellers.major'),
          propertyType: t('sellers.propertyType'),
          builtUpArea: t('sellers.builtUpArea'),
          plotArea: t('sellers.plotArea'),
          bedrooms: t('sellers.bedrooms'),
          bathrooms: t('sellers.bathrooms'),
          price: t('sellers.price'),
          commission: t('sellers.commission'),
        };
        break;
      case "buyers":
        data = allData.buyersData || [];
        fileName = t('rep.file.buyers');
        headers = {
          name: t('buyers.name'),
          phone: t('buyers.phone'),
          interest: t('buyers.interest'),
          followUp1: t('buyers.followUp1'),
          followUp2: t('buyers.followUp2'),
          followUp3: t('buyers.followUp3'),
          lastCall: t('buyers.lastCall'),
          agent: t('buyers.agent'),
        };
        break;
      case "invoices": {
        const clientNameMap = {};
        (allData.clientsData || []).forEach((c) => {
          clientNameMap[c.id] = c.name;
        });
        const productNameMap = {};
        (allData.productsData || []).forEach((p) => {
          productNameMap[p.id] = p.name;
        });

        data = (allData.invoicesData || []).map((inv) => ({
          ...inv,
          clientId: clientNameMap[inv.clientId] || t('common.unspecified'),
          productId: productNameMap[inv.productId] || t('common.unspecified'),
        }));

        fileName = t('rep.file.invoices');
        headers = {
          id: t('rep.col.invId'),
          clientId: t('rep.col.client'),
          productId: t('rep.col.product'),
          quantity: t('rep.col.qty'),
          amount: t('rep.col.amount'),
          status: t('rep.col.status'),
          date: t('rep.col.date'),
          description: t('rep.col.desc'),
        };
        break;
      }
      case "products":
        data = allData.productsData || [];
        fileName = t('rep.file.products');
        headers = {
          name: t('rep.col.product'),
          category: t('rep.col.cat'),
          quantity: t('rep.col.qty'),
          price: t('rep.col.price'),
          description: t('rep.col.desc'),
        };
        break;
      case "tasks":
        data = allData.tasksData || [];
        fileName = t('rep.file.tasks');
        headers = {
          title: t('rep.col.task'),
          description: t('rep.col.desc'),
          priority: t('rep.col.priority'),
          status: t('rep.col.status'),
          dueDate: t('rep.col.due'),
          assignedTo: t('rep.col.assignee'),
        };
        break;
      default:
        setExporting(null);
        return;
    }

    const headerKeys = Object.keys(headers);
    const formattedData = data.map((item) => {
      const row = {};
      headerKeys.forEach((key) => {
        row[headers[key]] = item[key] || "";
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, fileName);
    setExporting(null);
  }

  // ✅ لو مش Admin، يظهر رسالة "غير مصرح"
  if (!isAdmin) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
            <i className="fas fa-lock" style={{ fontSize: 48, color: "#ef4444", marginBottom: 16 }}></i>
            <h3 style={{ color: "#1e293b" }}>غير مصرح لك بالوصول</h3>
            <p style={{ color: "#64748b" }}>هذه الصفحة متاحة للمديرين فقط</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading)
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>{t('rep.loading')}
          </div>
        </div>
      </div>
    );

  const payRate =
    stats.invoices > 0
      ? Math.round((stats.paidInvoices / stats.invoices) * 100)
      : 0;
  const taskRate =
    stats.tasks > 0
      ? Math.round((stats.completedTasks / stats.tasks) * 100)
      : 0;

  // ✅ كروت الإحصائيات مفلترة حسب الموديولات المتاحة للصناعة
  const ALL_STAT_CARDS = [
    { label: t('rep.companies'), value: stats.companies, icon: "fas fa-building", cls: "indigo", module: "companies" },
    { label: t('rep.clients'), value: stats.clients, icon: "fas fa-user-friends", cls: "green", module: "clients" },
    { label: t('sellers.title'), value: stats.sellers, icon: "fas fa-store", cls: "amber", module: "sellers" },
    { label: t('buyers.title'), value: stats.buyers, icon: "fas fa-user-plus", cls: "pink", module: "buyers" },
    { label: t('rep.invoices'), value: stats.invoices, icon: "fas fa-file-invoice", cls: "amber", module: "invoices" },
    { label: t('rep.products'), value: stats.products, icon: "fas fa-boxes", cls: "purple", module: "inventory" },
    { label: t('rep.tasks'), value: stats.tasks, icon: "fas fa-tasks", cls: "pink", module: "tasks" },
    { label: t('rep.revenue'), value: stats.totalRevenue.toLocaleString() + ` ${t('currency')}`, icon: "fas fa-money-bill-wave", cls: "cyan", module: "invoices" },
  ];
  const statCards = ALL_STAT_CARDS.filter((s) => availableModules.has(s.module));

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i
                className="fas fa-chart-pie"
                style={{ color: "#6366f1", marginLeft: 10 }}
              ></i>
              {t('rep.title')}
            </h1>
            <p className="subtitle">{t('rep.subtitle')}</p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchAllData();
            }}
            className="btn-secondary"
          >
            <i className="fas fa-sync-alt"></i> {t('common.refresh')}
          </button>
        </div>

        <div className="stats-row">
          {statCards.map((s) => (
            <div key={s.label} className={`stat-card ${s.cls}`}>
              <div className="stat-icon">
                <i className={s.icon}></i>
              </div>
              <div
                className="stat-value"
                style={{ fontSize: s.label === t('rep.revenue') ? 18 : 30 }}
              >
                {s.value}
              </div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {availableModules.has("invoices") && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 20 }}>
            <i className="fas fa-chart-area" style={{ color: "#6366f1" }}></i>
            {t('rep.monthly')}
          </h3>
          {monthlyRevenue.every((m) => m["الإيرادات"] === 0) ? (
            <div className="empty-state" style={{ padding: "30px 0" }}>
              <div className="empty-icon">
                <i className="fas fa-chart-area"></i>
              </div>
              <p>{t('rep.noRevenue')}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={monthlyRevenue}
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fontFamily: "Cairo", fill: "#64748b" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: "Cairo", fill: "#64748b" }}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="الإيرادات"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#revenueGrad)"
                  dot={{ fill: "#6366f1", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        )}

        {(availableModules.has("invoices") || availableModules.has("tasks")) && (
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {availableModules.has("invoices") && (
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>
              <i className="fas fa-chart-pie" style={{ color: "#f59e0b" }}></i>
              {t('rep.invDist')}
            </h3>
            {invoiceStatusData.length === 0 ? (
              <div className="empty-state" style={{ padding: "24px 0" }}>
                <div className="empty-icon">
                  <i className="fas fa-file-invoice"></i>
                </div>
                <p>{t('rep.noInv')}</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={invoiceStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {invoiceStatusData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      formatter={(v) => (
                        <span style={{ fontFamily: "Cairo", fontSize: 12 }}>
                          {v}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 14px",
                    background: "var(--primary-bg)",
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--primary-dark)",
                      fontWeight: 600,
                    }}
                  >
                    {t('rep.payRate')}
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "var(--primary)",
                    }}
                  >
                    {payRate}%
                  </span>
                </div>
              </>
            )}
          </div>
          )}

          {availableModules.has("tasks") && (
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>
              <i className="fas fa-chart-bar" style={{ color: "#8b5cf6" }}></i>
              {t('rep.taskDist')}
            </h3>
            {stats.tasks === 0 ? (
              <div className="empty-state" style={{ padding: "24px 0" }}>
                <div className="empty-icon">
                  <i className="fas fa-tasks"></i>
                </div>
                <p>{t('rep.noTasks')}</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={taskStatusData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                    barSize={40}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{
                        fontSize: 11,
                        fontFamily: "Cairo",
                        fill: "#64748b",
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="القيمة" radius={[6, 6, 0, 0]}>
                      {taskStatusData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 14px",
                    background: "#f0fdf4",
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}
                  >
                    {t('rep.taskRate')}
                  </span>
                  <span
                    style={{ fontSize: 16, fontWeight: 800, color: "#16a34a" }}
                  >
                    {taskRate}%
                  </span>
                </div>
              </>
            )}
          </div>
          )}
        </div>
        )}

        {availableModules.has("inventory") && topProducts.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 20 }}>
              <i className="fas fa-boxes" style={{ color: "#8b5cf6" }}></i>
              {t('rep.topPrice')}
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={topProducts}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f1f5f9"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fontFamily: "Cairo", fill: "#334155" }}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="السعر"
                  fill="#8b5cf6"
                  radius={[0, 6, 6, 0]}
                  barSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {(availableModules.has("inventory") || availableModules.has("tasks")) && (
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {availableModules.has("inventory") && (
          <div className="card">
            <h3 style={{ marginBottom: 14 }}>
              <i
                className="fas fa-exclamation-triangle"
                style={{
                  color: stats.lowStockProducts > 0 ? "#ef4444" : "#10b981",
                }}
              ></i>
              {t('rep.stockAlert')}
            </h3>
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 10,
                marginBottom: 8,
                background: stats.lowStockProducts > 0 ? "#fef2f2" : "#f0fdf4",
                border: `1px solid ${stats.lowStockProducts > 0 ? "#fecaca" : "#bbf7d0"}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: stats.lowStockProducts > 0 ? "#dc2626" : "#16a34a",
                  }}
                >
                  {stats.lowStockProducts > 0
                    ? `${stats.lowStockProducts} ${t('rep.lowStock')}`
                    : t('rep.stockOk')}
                </span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: stats.lowStockProducts > 0 ? "#dc2626" : "#16a34a",
                  }}
                >
                  {stats.lowStockProducts}
                </span>
              </div>
            </div>
            {lowStock.slice(0, 4).map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "7px 10px",
                  background: "var(--gray-50)",
                  borderRadius: 6,
                  marginBottom: 4,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--gray-700)" }}>
                  {p.name}
                </span>
                <span className="badge badge-expired">{p.quantity} {t('rep.left')}</span>
              </div>
            ))}
          </div>
          )}

          {availableModules.has("tasks") && (
          <div className="card">
            <h3 style={{ marginBottom: 14 }}>
              <i className="fas fa-tasks" style={{ color: "#6366f1" }}></i>
              {t('rep.taskSummary')}
            </h3>
            {[
              {
                label: t('rep.done'),
                value: stats.completedTasks,
                total: stats.tasks,
                color: "#10b981",
              },
              {
                label: t('rep.progress'),
                value: stats.inProgressTasks,
                total: stats.tasks,
                color: "#6366f1",
              },
              {
                label: t('rep.wait'),
                value: stats.pendingTasks,
                total: stats.tasks,
                color: "#f59e0b",
              },
            ].map((item) => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 5,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--gray-600)",
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    style={{ fontSize: 13, fontWeight: 700, color: item.color }}
                  >
                    {item.value} (
                    {item.total > 0
                      ? Math.round((item.value / item.total) * 100)
                      : 0}
                    %)
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: "var(--gray-100)",
                    borderRadius: 99,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 99,
                      transition: "width 0.8s ease",
                      width:
                        item.total > 0
                          ? `${(item.value / item.total) * 100}%`
                          : "0%",
                      background: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
        )}

        {exportItems.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>
            <i className="fas fa-file-excel" style={{ color: "#10b981" }}></i>
            {t('common.exportExcel')}
          </h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {exportItems.map((item) => (
              <button
                key={item.type}
                onClick={() => exportToExcel(item.type)}
                disabled={exporting === item.type}
                className="btn-secondary"
                style={{ borderColor: item.color + "40", color: item.color }}
              >
                {exporting === item.type ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className={item.icon}></i>
                )}
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        </div>
        )}

        {availableModules.has("invoices") && (
        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-history"></i> {t('rep.recent')}
            </h3>
            <span className="table-count">{recentInvoices.length}</span>
          </div>
          <div className="table-wrapper">
            {recentInvoices.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-file-invoice"></i>
                <p>{t('rep.noInv')}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('rep.col.client')}</th>
                    <th>{t('rep.col.amount')}</th>
                    <th>{t('rep.col.status')}</th>
                    <th>{t('rep.col.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv, i) => (
                    <tr key={inv.id}>
                      <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>
                        {i + 1}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {clientsMap[inv.clientId] || t('common.unspecified')}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {(inv.amount || 0).toLocaleString()} {t('currency')}
                      </td>
                      <td>
                        <span
                          className={`badge ${inv.status === "paid" ? "badge-paid" : inv.status === "pending" ? "badge-pending" : "badge-overdue"}`}
                        >
                          {inv.status === "paid"
                            ? t('rep.statusPaid')
                            : inv.status === "pending"
                              ? t('rep.statusWait')
                              : t('rep.statusOver')}
                        </span>
                      </td>
                      <td style={{ color: "var(--gray-500)", fontSize: 13 }}>
                        {inv.date
                          ? new Date(inv.date).toLocaleDateString()
                          : "-"}{" "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}