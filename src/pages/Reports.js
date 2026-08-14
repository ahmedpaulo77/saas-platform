// src/pages/Reports.js - مع Charts احترافية
import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { getScopedQuery, isSuperAdmin } from '../utils/companyQuery';
import Sidebar from '../components/common/Sidebar';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';

const exportItems = [
  { type: 'companies', label: 'الشركات', icon: 'fas fa-building', color: '#6366f1' },
  { type: 'clients',   label: 'العملاء',  icon: 'fas fa-user-friends', color: '#10b981' },
  { type: 'invoices',  label: 'الفواتير', icon: 'fas fa-file-invoice', color: '#f59e0b' },
  { type: 'products',  label: 'المنتجات', icon: 'fas fa-boxes',        color: '#8b5cf6' },
  { type: 'tasks',     label: 'المهام',   icon: 'fas fa-tasks',        color: '#ec4899' },
];

// Custom Tooltip للـ Charts
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'white', border: '1px solid #e2e8f0',
        borderRadius: 10, padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        direction: 'rtl', fontFamily: 'Cairo, sans-serif'
      }}>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ fontSize: 14, fontWeight: 700, color: p.color || p.fill }}>
            {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Reports() {
  const { userRole, userCompanyId } = useAuth();
  const superAdmin = isSuperAdmin(userRole);

  const [stats, setStats] = useState({
    companies: 0, clients: 0, invoices: 0, products: 0, tasks: 0,
    totalRevenue: 0, paidInvoices: 0, pendingInvoices: 0, overdueInvoices: 0,
    lowStockProducts: 0, completedTasks: 0, inProgressTasks: 0, pendingTasks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [lowStock, setLowStock]     = useState([]);
  const [allData, setAllData]       = useState({});
  const [exporting, setExporting]   = useState(null);
  const [clientsMap, setClientsMap] = useState({});

  // Chart data states
  const [monthlyRevenue, setMonthlyRevenue] = useState([]);
  const [invoiceStatusData, setInvoiceStatusData] = useState([]);
  const [taskStatusData, setTaskStatusData]   = useState([]);
  const [topProducts, setTopProducts]         = useState([]);

  const fetchAllData = useCallback(async () => {
    try {
      let companiesData;
      if (superAdmin) {
        const cSnap = await getDocs(collection(db, 'companies'));
        companiesData = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } else if (userCompanyId) {
        const snap = await getDoc(doc(db, 'companies', userCompanyId));
        companiesData = snap.exists() ? [{ id: snap.id, ...snap.data() }] : [];
      } else { companiesData = []; }

      const [clSnap, iSnap, pSnap, tSnap] = await Promise.all([
        getDocs(getScopedQuery('clients',   userRole, userCompanyId)),
        getDocs(getScopedQuery('invoices',  userRole, userCompanyId)),
        getDocs(getScopedQuery('inventory', userRole, userCompanyId)),
        getDocs(getScopedQuery('tasks',     userRole, userCompanyId)),
      ]);

      const clientsData  = clSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const invoicesData = iSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const productsData = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const tasksData    = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const cMap = {};
      clientsData.forEach(c => { cMap[c.id] = c.name; });
      setClientsMap(cMap);

      let revenue = 0, paid = 0, pending = 0, overdue = 0;
      invoicesData.forEach(inv => {
        revenue += inv.amount || 0;
        if (inv.status === 'paid') paid++;
        else if (inv.status === 'pending') pending++;
        else if (inv.status === 'overdue') overdue++;
      });

      const lowStockList  = productsData.filter(p => p.quantity < 5);
      const completed     = tasksData.filter(t => t.status === 'completed').length;
      const inProgress    = tasksData.filter(t => t.status === 'in-progress').length;
      const pendingTasks  = tasksData.filter(t => t.status === 'pending').length;

      setStats({
        companies: companiesData.length, clients: clientsData.length,
        invoices: invoicesData.length,   products: productsData.length,
        tasks: tasksData.length,         totalRevenue: revenue,
        paidInvoices: paid,              pendingInvoices: pending,
        overdueInvoices: overdue,        lowStockProducts: lowStockList.length,
        completedTasks: completed,       inProgressTasks: inProgress,
        pendingTasks,
      });

      // ── Chart 1: إيرادات آخر 6 شهور ──
      const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
      const revenueMap = {};
      invoicesData.forEach(inv => {
        if (!inv.date) return;
        const d = new Date(inv.date);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        revenueMap[key] = (revenueMap[key] || 0) + (inv.amount || 0);
      });
      const last6 = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        last6.push({ name: monthNames[d.getMonth()], الإيرادات: revenueMap[key] || 0 });
      }
      setMonthlyRevenue(last6);

      // ── Chart 2: حالة الفواتير (Pie) ──
      setInvoiceStatusData([
        { name: 'مدفوعة',         value: paid,    fill: '#10b981' },
        { name: 'قيد الانتظار',   value: pending, fill: '#f59e0b' },
        { name: 'متأخرة',         value: overdue, fill: '#ef4444' },
      ].filter(d => d.value > 0));

      // ── Chart 3: حالة المهام (Bar) ──
      setTaskStatusData([
        { name: 'منجزة',        القيمة: completed,   fill: '#10b981' },
        { name: 'جاري التنفيذ', القيمة: inProgress,  fill: '#6366f1' },
        { name: 'قيد الانتظار', القيمة: pendingTasks, fill: '#f59e0b' },
      ]);

      // ── Chart 4: أعلى منتجات بالسعر ──
      const sorted = [...productsData].sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 6);
      setTopProducts(sorted.map(p => ({ name: p.name?.slice(0, 12) || 'منتج', السعر: p.price || 0, الكمية: p.quantity || 0 })));

      setRecentInvoices([...invoicesData].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5));
      setLowStock(lowStockList);
      setAllData({ companiesData, clientsData, invoicesData, productsData, tasksData });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, superAdmin]);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  async function exportToExcel(type) {
    setExporting(type);
    await new Promise(r => setTimeout(r, 300));
    const map = {
      companies: { data: allData.companiesData, file: 'الشركات.xlsx' },
      clients:   { data: allData.clientsData,   file: 'العملاء.xlsx' },
      invoices:  { data: allData.invoicesData,   file: 'الفواتير.xlsx' },
      products:  { data: allData.productsData,   file: 'المنتجات.xlsx' },
      tasks:     { data: allData.tasksData,      file: 'المهام.xlsx' },
    };
    const { data, file } = map[type];
    const ws = XLSX.utils.json_to_sheet(data || []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, file);
    setExporting(null);
  }

  if (loading) return (
    <div className="loading"><div className="spinner"></div>جاري تحميل التقارير...</div>
  );

  const payRate  = stats.invoices > 0 ? Math.round((stats.paidInvoices  / stats.invoices) * 100) : 0;
  const taskRate = stats.tasks    > 0 ? Math.round((stats.completedTasks / stats.tasks)    * 100) : 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">

        {/* Header */}
        <div className="header">
          <div>
            <h1><i className="fas fa-chart-pie" style={{ color: '#6366f1', marginLeft: 10 }}></i>التقارير والإحصائيات</h1>
            <p className="subtitle">تحليلات شاملة وبيانية لأداء أعمالك</p>
          </div>
          <button onClick={() => { setLoading(true); fetchAllData(); }} className="btn-secondary">
            <i className="fas fa-sync-alt"></i> تحديث
          </button>
        </div>

        {/* Stats Row */}
        <div className="stats-row">
          {[
            { label: 'الشركات',  value: stats.companies,                            icon: 'fas fa-building',      cls: 'indigo' },
            { label: 'العملاء',  value: stats.clients,                              icon: 'fas fa-user-friends',  cls: 'green'  },
            { label: 'الفواتير', value: stats.invoices,                             icon: 'fas fa-file-invoice',  cls: 'amber'  },
            { label: 'المنتجات', value: stats.products,                             icon: 'fas fa-boxes',         cls: 'purple' },
            { label: 'المهام',   value: stats.tasks,                                icon: 'fas fa-tasks',         cls: 'pink'   },
            { label: 'الإيرادات',value: stats.totalRevenue.toLocaleString() + ' ج', icon: 'fas fa-money-bill-wave', cls: 'cyan' },
          ].map(s => (
            <div key={s.label} className={`stat-card ${s.cls}`}>
              <div className="stat-icon"><i className={s.icon}></i></div>
              <div className="stat-value" style={{ fontSize: s.label === 'الإيرادات' ? 18 : 30 }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Chart 1: الإيرادات الشهرية ── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 20 }}>
            <i className="fas fa-chart-area" style={{ color: '#6366f1' }}></i>
            الإيرادات الشهرية — آخر 6 أشهر
          </h3>
          {monthlyRevenue.every(m => m['الإيرادات'] === 0) ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <div className="empty-icon"><i className="fas fa-chart-area"></i></div>
              <p>لا توجد بيانات إيرادات بعد</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={monthlyRevenue} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Cairo', fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'Cairo', fill: '#64748b' }} tickFormatter={v => v.toLocaleString()} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="الإيرادات" stroke="#6366f1" strokeWidth={2.5}
                  fill="url(#revenueGrad)" dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Chart 2 + 3 ── */}
        <div className="grid-2" style={{ marginBottom: 24 }}>

          {/* Pie — حالة الفواتير */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>
              <i className="fas fa-chart-pie" style={{ color: '#f59e0b' }}></i>
              توزيع حالات الفواتير
            </h3>
            {invoiceStatusData.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-icon"><i className="fas fa-file-invoice"></i></div>
                <p>لا توجد فواتير بعد</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={invoiceStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      paddingAngle={3} dataKey="value">
                      {invoiceStatusData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={v => <span style={{ fontFamily: 'Cairo', fontSize: 12 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  marginTop: 8, padding: '10px 14px',
                  background: 'var(--primary-bg)', borderRadius: 8,
                  display: 'flex', justifyContent: 'space-between'
                }}>
                  <span style={{ fontSize: 13, color: 'var(--primary-dark)', fontWeight: 600 }}>معدل السداد</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>{payRate}%</span>
                </div>
              </>
            )}
          </div>

          {/* Bar — حالة المهام */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>
              <i className="fas fa-chart-bar" style={{ color: '#8b5cf6' }}></i>
              توزيع المهام حسب الحالة
            </h3>
            {stats.tasks === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-icon"><i className="fas fa-tasks"></i></div>
                <p>لا توجد مهام بعد</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={taskStatusData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} barSize={40}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Cairo', fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="القيمة" radius={[6, 6, 0, 0]}>
                      {taskStatusData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{
                  marginTop: 8, padding: '10px 14px',
                  background: '#f0fdf4', borderRadius: 8,
                  display: 'flex', justifyContent: 'space-between'
                }}>
                  <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>معدل الإنجاز</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{taskRate}%</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Chart 4: أعلى المنتجات سعراً ── */}
        {topProducts.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 20 }}>
              <i className="fas fa-boxes" style={{ color: '#8b5cf6' }}></i>
              أعلى المنتجات سعراً
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={v => v.toLocaleString()} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontFamily: 'Cairo', fill: '#334155' }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="السعر" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Inventory Alert + Task Progress */}
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <div className="card">
            <h3 style={{ marginBottom: 14 }}>
              <i className="fas fa-exclamation-triangle" style={{ color: stats.lowStockProducts > 0 ? '#ef4444' : '#10b981' }}></i>
              تنبيهات المخزون
            </h3>
            <div style={{
              padding: '14px 16px', borderRadius: 10, marginBottom: 8,
              background: stats.lowStockProducts > 0 ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${stats.lowStockProducts > 0 ? '#fecaca' : '#bbf7d0'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: stats.lowStockProducts > 0 ? '#dc2626' : '#16a34a' }}>
                  {stats.lowStockProducts > 0 ? `${stats.lowStockProducts} منتج أقل من 5 وحدات` : 'جميع المنتجات بمستويات جيدة ✓'}
                </span>
                <span style={{ fontSize: 22, fontWeight: 800, color: stats.lowStockProducts > 0 ? '#dc2626' : '#16a34a' }}>
                  {stats.lowStockProducts}
                </span>
              </div>
            </div>
            {lowStock.slice(0, 4).map(p => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '7px 10px', background: 'var(--gray-50)',
                borderRadius: 6, marginBottom: 4, alignItems: 'center'
              }}>
                <span style={{ fontSize: 13, color: 'var(--gray-700)' }}>{p.name}</span>
                <span className="badge badge-expired">{p.quantity} متبقي</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 14 }}>
              <i className="fas fa-tasks" style={{ color: '#6366f1' }}></i>
              ملخص المهام
            </h3>
            {[
              { label: 'منجزة',        value: stats.completedTasks,  total: stats.tasks, color: '#10b981' },
              { label: 'جاري التنفيذ', value: stats.inProgressTasks, total: stats.tasks, color: '#6366f1' },
              { label: 'قيد الانتظار', value: stats.pendingTasks,    total: stats.tasks, color: '#f59e0b' },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)' }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>
                    {item.value} ({item.total > 0 ? Math.round(item.value / item.total * 100) : 0}%)
                  </span>
                </div>
                <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99, transition: 'width 0.8s ease',
                    width: item.total > 0 ? `${item.value / item.total * 100}%` : '0%',
                    background: item.color,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Export */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>
            <i className="fas fa-file-excel" style={{ color: '#10b981' }}></i>
            تصدير البيانات إلى Excel
          </h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {exportItems.map(item => (
              <button key={item.type} onClick={() => exportToExcel(item.type)}
                disabled={exporting === item.type} className="btn-secondary"
                style={{ borderColor: item.color + '40', color: item.color }}>
                {exporting === item.type
                  ? <i className="fas fa-spinner fa-spin"></i>
                  : <i className={item.icon}></i>}
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent Invoices Table */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-history"></i> أحدث الفواتير</h3>
            <span className="table-count">{recentInvoices.length}</span>
          </div>
          <div className="table-wrapper">
            {recentInvoices.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-file-invoice"></i>
                <p>لا توجد فواتير بعد</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>العميل</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv, i) => (
                    <tr key={inv.id}>
                      <td style={{ color: 'var(--gray-400)', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{clientsMap[inv.clientId] || 'غير محدد'}</td>
                      <td style={{ fontWeight: 700 }}>{(inv.amount || 0).toLocaleString()} ج.م</td>
                      <td>
                        <span className={`badge ${inv.status === 'paid' ? 'badge-paid' : inv.status === 'pending' ? 'badge-pending' : 'badge-overdue'}`}>
                          {inv.status === 'paid' ? '✓ مدفوعة' : inv.status === 'pending' ? '⏳ انتظار' : '⚠ متأخرة'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>
                        {inv.date ? new Date(inv.date).toLocaleDateString('ar-EG') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
