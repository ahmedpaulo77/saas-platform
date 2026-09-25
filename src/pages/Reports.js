// src/pages/Reports.js - تعديل: User ميشوفش حاجة + فلترة حسب الصناعة
import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
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
  const { userRole, userCompanyId, userIndustry, currentUser } = useAuth();
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
    returnsCount: 0,
    returnsTotal: 0,
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
  // 👗 Fashion-specific: الأكثر مبيعاً بالمقاس/اللون (clothing only)
  const [topSizes, setTopSizes] = useState([]);
  const [topColors, setTopColors] = useState([]);
  // 👗 الأكثر مبيعاً حسب النوع + المنتج (clothing only, joined with inventory)
  const [topTypes, setTopTypes] = useState([]);
  const [topProductsSold, setTopProductsSold] = useState([]);
  const [productSales, setProductSales] = useState([]);
  // 🏆 top sellers (createdBy) + top clients — all industries
  const [topSellers, setTopSellers] = useState([]);
  const [topClients, setTopClients] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  // 🔎 combined filter (clothing)
  const [filterType, setFilterType] = useState("");
  const [filterSize, setFilterSize] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

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
      let usersData = [];
      let returnsData = [];

      if (superAdmin) {
        const [clSnap, sSnap, bSnap, iSnap, pSnap, tSnap, uSnap, rSnap] = await Promise.all([
          getDocs(collection(db, "clients")),
          getDocs(collection(db, "sellers")),
          getDocs(collection(db, "buyers")),
          getDocs(collection(db, "invoices")),
          getDocs(collection(db, "inventory")),
          getDocs(collection(db, "tasks")),
          getDocs(collection(db, "users")),
          getDocs(collection(db, "returns")),
        ]);
        clientsData = clSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        sellersData = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        buyersData = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        invoicesData = iSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        productsData = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        tasksData = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        usersData = uSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        returnsData = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        const [clSnap, sSnap, bSnap, iSnap, pSnap, tSnap, uSnap, rSnap] = await Promise.all([
          getDocs(getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("sellers", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("buyers", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("tasks", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("users", userRole, userCompanyId, currentUser?.uid)),
          getDocs(getScopedQuery("returns", userRole, userCompanyId, currentUser?.uid)),
        ]);
        clientsData = clSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        sellersData = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        buyersData = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        invoicesData = iSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        productsData = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        tasksData = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        usersData = uSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        returnsData = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

      const cMap = {};
      clientsData.forEach((c) => {
        cMap[c.id] = c.name;
      });
      setClientsMap(cMap);

      const uMap = {};
      usersData.forEach((u) => {
        uMap[u.id] = u.name || u.displayName || u.email || t('rep.sellerFallback');
      });
      setUsersMap(uMap);

      let revenue = 0,
        paid = 0,
        pending = 0,
        overdue = 0;
      invoicesData.forEach((inv) => {
        // Only validated invoices count in revenue (legacy docs without `approval` count as validated)
        if (inv.approval && inv.approval !== "validated") return;
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

      // مرتجعات البيع تنقص الإيراد (مرتجعات الشراء تخص المشتريات/الأرباح فقط)
      let saleReturnsTotal = 0,
        returnsCount = 0;
      returnsData.forEach((r) => {
        if (r.kind && r.kind !== "sale") return;
        returnsCount++;
        saleReturnsTotal += parseFloat(r.amount) || 0;
      });
      revenue -= saleReturnsTotal;

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
        returnsCount,
        returnsTotal: saleReturnsTotal,
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
        if (inv.approval && inv.approval !== "validated") return;
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
      // وزّع مرتجعات البيع على شهورها (بتاريخ المرتجع) — وبدون تاريخ تُخصم من الشهر الحالي
      {
        const nowD = new Date();
        const curKey = `${monthNames[nowD.getMonth()]} ${nowD.getFullYear()}`;
        returnsData.forEach((r) => {
          if (r.kind && r.kind !== "sale") return;
          const amt = parseFloat(r.amount) || 0;
          if (amt <= 0) return;
          let key = curKey;
          const rd = r.date || r.createdAt;
          if (rd) {
            const d = new Date(rd);
            if (!isNaN(d.getTime())) key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
          }
          revenueMap[key] = (revenueMap[key] || 0) - amt;
        });
      }
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

      // 👗 Fashion analytics: join invoice items (productId/qty) with inventory
      // (size/color/type/brand/model) + top sellers (createdBy) + top clients — all industries
      const norm = (v) => (v ?? "").toString().trim();
      const productMap = {};
      productsData.forEach((p) => {
        productMap[p.id] = p;
      });
      const typeMap = {};
      const sizeMap = {};
      const colorMap = {};
      const prodMap = {};
      const sellerMap = {};
      const clientMap = {};

      invoicesData.forEach((inv) => {
        if (inv.approval && inv.approval !== "validated") return;
        // --- top sellers by createdBy (all industries) ---
        const sellerKey = inv.createdBy || inv.createdByEmail || inv.sellerId || "unknown";
        const sellerEmail = inv.createdByEmail || "";
        const invAmount = parseFloat(inv.amount) || 0;
        if (!sellerMap[sellerKey]) {
          sellerMap[sellerKey] = { key: sellerKey, email: sellerEmail, revenue: 0, count: 0 };
        }
        sellerMap[sellerKey].revenue += invAmount;
        sellerMap[sellerKey].count += 1;
        if (sellerEmail && !sellerMap[sellerKey].email) sellerMap[sellerKey].email = sellerEmail;

        // --- top clients by clientId (all industries) ---
        const cliKey = inv.clientId || "unknown";
        if (!clientMap[cliKey]) {
          clientMap[cliKey] = { key: cliKey, revenue: 0, count: 0 };
        }
        clientMap[cliKey].revenue += invAmount;
        clientMap[cliKey].count += 1;

        // --- clothing: aggregate sold qty per item joined with inventory ---
        const items = inv.products || inv.items || [];
        if (!Array.isArray(items)) return;
        items.forEach((item) => {
          const qty = parseFloat(item.quantity) || 0;
          if (qty <= 0) return;
          const prod = productMap[item.productId] || productMap[item.id] || {};
          const sizeKey = norm(item.size ?? item.Size ?? prod.size ?? prod.Size) || t('common.unspecified');
          const colorKey = norm(item.color ?? item.Color ?? prod.color ?? prod.Color) || t('common.unspecified');
          const typeKey = norm(item.type ?? prod.type ?? prod.category ?? prod.Category) || t('common.unspecified');
          const brandKey = norm(item.brand ?? prod.brand);
          const modelKey = norm(item.model ?? prod.model ?? item.name ?? prod.name);
          const prodName = prod.name || item.name || t('rep.product');
          const prodKey = item.productId || item.id || `${prodName}|${typeKey}|${sizeKey}|${colorKey}`;

          sizeMap[sizeKey] = (sizeMap[sizeKey] || 0) + qty;
          colorMap[colorKey] = (colorMap[colorKey] || 0) + qty;
          typeMap[typeKey] = (typeMap[typeKey] || 0) + qty;

          if (!prodMap[prodKey]) {
            prodMap[prodKey] = {
              key: prodKey,
              name: prodName,
              type: typeKey,
              size: sizeKey,
              color: colorKey,
              brand: brandKey || "—",
              model: modelKey || prodName,
              qty: 0,
            };
          }
          prodMap[prodKey].qty += qty;
        });
      });

      const toSorted = (map) =>
        Object.entries(map)
          .map(([name, quantity]) => ({ name, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 6);

      if (userIndustry === "clothing") {
        setTopSizes(toSorted(sizeMap));
        setTopColors(toSorted(colorMap));
        setTopTypes(toSorted(typeMap));
        const prodArr = Object.values(prodMap)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 6);
        setTopProductsSold(prodArr);
        setProductSales(
          Object.values(prodMap).sort((a, b) => b.qty - a.qty)
        );
      } else {
        setTopSizes([]);
        setTopColors([]);
        setTopTypes([]);
        setTopProductsSold([]);
        setProductSales([]);
      }

      // --- top 5 sellers: resolve display name via users collection ---
      const sellersArr = Object.values(sellerMap)
        .map((s) => ({
          ...s,
          name: uMap[s.key] || s.email || t('rep.sellerFallback'),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      setTopSellers(sellersArr);

      // --- top 5 clients: resolve names from clients collection ---
      const clientsArr = Object.values(clientMap)
        .filter((c) => c.key !== "unknown")
        .map((c) => ({
          ...c,
          name: cMap[c.key] || t('common.unspecified'),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      setTopClients(clientsArr);

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
        usersData,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userCompanyId, superAdmin, isAdmin, t, userIndustry, userRole, currentUser]);

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

        data = (allData.invoicesData || []).map((inv) => {
          // inv.products هي array من { productId, quantity, amount }
          const productNames = (inv.products || [])
            .map((p) => productNameMap[p.productId] || t('common.unspecified'))
            .join(' ، ');
          const totalQty = (inv.products || []).reduce(
            (sum, p) => sum + (parseFloat(p.quantity) || 0), 0
          );
          return {
            id: inv.id,
            clientId: clientNameMap[inv.clientId] || t('common.unspecified'),
            productId: productNames || t('common.unspecified'),
            quantity: totalQty,
            amount: inv.amount,
            status: inv.status,
            date: inv.date ? new Date(inv.date).toLocaleDateString() : '',
            description: inv.description || '',
          };
        });

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
    { label: t('rep.returns'), value: `${stats.returnsCount} • ${stats.returnsTotal.toLocaleString()} ${t('currency')}`, icon: "fas fa-undo", cls: "red", module: "invoices" },
  ];
  const statCards = ALL_STAT_CARDS.filter((s) => availableModules.has(s.module));

  // 🔎 clothing combined filter: derived options + filtered aggregated results
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const allTypes = uniq(productSales.map((p) => p.type));
  const allSizes = uniq(productSales.map((p) => p.size));
  const allColors = uniq(productSales.map((p) => p.color));
  const filteredSales = productSales.filter((p) => {
    if (filterType && p.type !== filterType) return false;
    if (filterSize && p.size !== filterSize) return false;
    if (filterColor && p.color !== filterColor) return false;
    if (filterSearch) {
      const q = filterSearch.trim().toLowerCase();
      const hay = `${p.name} ${p.model} ${p.brand} ${p.type} ${p.size} ${p.color}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const rankRow = (item, idx, color) => (
    <div key={`${item.name}-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: idx === 0 ? "#f8fafc" : "var(--gray-50)", borderRadius: 8, marginBottom: 6, border: idx === 0 ? "1px solid #e2e8f0" : "1px solid transparent" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: idx === 0 ? color : "#e2e8f0", color: idx === 0 ? "white" : "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{idx + 1}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{item.name || item.model}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color }}>{item.quantity ?? item.qty}</span>
    </div>
  );

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
                style={{ fontSize: (s.label === t('rep.revenue') || s.label === t('rep.returns')) ? 18 : 30 }}
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
            <div dir="ltr" style={{ width: "100%" }}>
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
                    width={140}
                    tickMargin={8}
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
          </div>
        )}

        {userIndustry === "clothing" && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>
              <i className="fas fa-tshirt" style={{ color: "#8b5cf6", marginLeft: 8 }}></i>
              {t('rep.clothingTitle')}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#334155" }}><i className="fas fa-tags" style={{ marginLeft: 6 }}></i> {t('rep.topType')}</h4>
                {topTypes.length === 0 ? <p style={{ fontSize: 12, color: "#94a3b8" }}>{t('rep.noData')}</p> :
                  <><ResponsiveContainer width="100%" height={140}>
                    <BarChart data={topTypes.slice(0, 5)} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "Cairo", fill: "#64748b" }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="quantity" name={t('rep.soldQty')} fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                  {topTypes.slice(0, 5).map((it, i) => rankRow(it, i, "#8b5cf6"))}</>}
              </div>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#334155" }}><i className="fas fa-ruler" style={{ marginLeft: 6 }}></i> {t('rep.topSize')}</h4>
                {topSizes.length === 0 ? <p style={{ fontSize: 12, color: "#94a3b8" }}>{t('rep.noData')}</p> :
                  <><ResponsiveContainer width="100%" height={140}>
                    <BarChart data={topSizes.slice(0, 5)} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "Cairo", fill: "#64748b" }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="quantity" name={t('rep.soldQty')} fill="#6366f1" radius={[6, 6, 0, 0]} barSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                  {topSizes.slice(0, 5).map((it, i) => rankRow(it, i, "#6366f1"))}</>}
              </div>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#334155" }}><i className="fas fa-palette" style={{ marginLeft: 6 }}></i> {t('rep.topColor')}</h4>
                {topColors.length === 0 ? <p style={{ fontSize: 12, color: "#94a3b8" }}>{t('rep.noData')}</p> :
                  <><ResponsiveContainer width="100%" height={140}>
                    <BarChart data={topColors.slice(0, 5)} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "Cairo", fill: "#64748b" }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="quantity" name={t('rep.soldQty')} fill="#1e3a8a" radius={[6, 6, 0, 0]} barSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                  {topColors.slice(0, 5).map((it, i) => rankRow(it, i, "#1e3a8a"))}</>}
              </div>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#334155" }}><i className="fas fa-shirt" style={{ marginLeft: 6 }}></i> {t('rep.topProduct')}</h4>
                {topProductsSold.length === 0 ? <p style={{ fontSize: 12, color: "#94a3b8" }}>{t('rep.noData')}</p> :
                  topProductsSold.slice(0, 5).map((it, i) => (
                    <div key={it.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "var(--gray-50)", borderRadius: 8, marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 22, height: 22, borderRadius: "50%", background: i === 0 ? "#10b981" : "#e2e8f0", color: i === 0 ? "white" : "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{it.model !== it.name ? `${it.name} (${it.model})` : it.name}<br /><span style={{ fontSize: 11, fontWeight: 400, color: "#64748b" }}>{it.brand} • {it.type} • {it.size} • {it.color}</span></span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#10b981" }}>{it.qty}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {userIndustry === "clothing" && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>
              <i className="fas fa-filter" style={{ color: "#6366f1", marginLeft: 8 }}></i>
              {t('rep.filterTitle')}
            </h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "Cairo", fontSize: 13 }}>
                <option value="">{t('rep.filterType')}: {t('rep.showAll')}</option>
                {allTypes.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
              </select>
              <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "Cairo", fontSize: 13 }}>
                <option value="">{t('rep.filterSize')}: {t('rep.showAll')}</option>
                {allSizes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterColor} onChange={(e) => setFilterColor(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "Cairo", fontSize: 13 }}>
                <option value="">{t('rep.filterColor')}: {t('rep.showAll')}</option>
                {allColors.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder={t('rep.searchProduct')} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "Cairo", fontSize: 13, minWidth: 180 }} />
              {(filterType || filterSize || filterColor || filterSearch) && (
                <button onClick={() => { setFilterType(""); setFilterSize(""); setFilterColor(""); setFilterSearch(""); }} className="btn-secondary" style={{ fontSize: 12 }}>{t('common.clearAll') || "✕"}</button>
              )}
            </div>
            <div className="table-wrapper">
              {filteredSales.length === 0 ? (
                <div className="table-empty"><i className="fas fa-search"></i><p>{t('common.noResults')}</p></div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('rep.col.product')}</th>
                      <th>{t('rep.type')}</th>
                      <th>{t('rep.size')}</th>
                      <th>{t('rep.color')}</th>
                      <th>{t('rep.brand')}</th>
                      <th>{t('rep.soldQty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.slice(0, 50).map((p, i) => (
                      <tr key={p.key}>
                        <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{p.model !== p.name ? `${p.name} (${p.model})` : p.name}</td>
                        <td>{p.type}</td>
                        <td><span className="badge badge-pending">{p.size}</span></td>
                        <td>{p.color}</td>
                        <td style={{ color: "var(--gray-500)", fontSize: 12 }}>{p.brand}</td>
                        <td style={{ fontWeight: 800, color: "#6366f1" }}>{p.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {availableModules.has("invoices") && (topSellers.length > 0 || topClients.length > 0) && (
          <div className="grid-2" style={{ marginBottom: 24 }}>
            <div className="card">
              <h3 style={{ marginBottom: 14 }}>
                <i className="fas fa-trophy" style={{ color: "#f59e0b", marginLeft: 8 }}></i>
                {t('rep.topSeller')}
              </h3>
              {topSellers.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px 0" }}><p style={{ fontSize: 13 }}>{t('rep.noData')}</p></div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={topSellers} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "Cairo", fill: "#64748b" }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} width={40} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="revenue" name={t('rep.revenue')} fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                  {topSellers.map((s, i) => (
                    <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: i === 0 ? "#fffbeb" : "var(--gray-50)", borderRadius: 8, marginBottom: 6, border: i === 0 ? "1px solid #fde68a" : "1px solid transparent" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{i + 1}. {s.name}<br /><span style={{ fontSize: 11, fontWeight: 400, color: "#64748b" }}>{s.email} • {s.count} {t('rep.invoicesCount')}</span></span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#d97706" }}>{s.revenue.toLocaleString()} {t('currency')}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 14 }}>
                <i className="fas fa-crown" style={{ color: "#10b981", marginLeft: 8 }}></i>
                {t('rep.topClient')}
              </h3>
              {topClients.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px 0" }}><p style={{ fontSize: 13 }}>{t('rep.noData')}</p></div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={topClients} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "Cairo", fill: "#64748b" }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} width={40} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="revenue" name={t('rep.revenue')} fill="#10b981" radius={[6, 6, 0, 0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                  {topClients.map((c, i) => (
                    <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: i === 0 ? "#f0fdf4" : "var(--gray-50)", borderRadius: 8, marginBottom: 6, border: i === 0 ? "1px solid #bbf7d0" : "1px solid transparent" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{i + 1}. {c.name}<br /><span style={{ fontSize: 11, fontWeight: 400, color: "#64748b" }}>{c.count} {t('rep.invoicesCount')}</span></span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#16a34a" }}>{c.revenue.toLocaleString()} {t('currency')}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
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
                    ? t('rep.lowStock').replace('{n}', stats.lowStockProducts)
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