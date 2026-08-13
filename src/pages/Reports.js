// src/pages/Reports.js - تصميم احترافي
import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import Sidebar from '../components/common/Sidebar';
import * as XLSX from 'xlsx';

const exportItems = [
  { type: 'companies', label: 'الشركات', icon: 'fas fa-building', color: '#6366f1' },
  { type: 'clients', label: 'العملاء', icon: 'fas fa-user-friends', color: '#10b981' },
  { type: 'invoices', label: 'الفواتير', icon: 'fas fa-file-invoice', color: '#f59e0b' },
  { type: 'products', label: 'المنتجات', icon: 'fas fa-boxes', color: '#8b5cf6' },
  { type: 'tasks', label: 'المهام', icon: 'fas fa-tasks', color: '#ec4899' },
];

export default function Reports() {
  const [stats, setStats] = useState({
    companies: 0, clients: 0, invoices: 0, products: 0, tasks: 0,
    totalRevenue: 0, paidInvoices: 0, pendingInvoices: 0, overdueInvoices: 0,
    lowStockProducts: 0, completedTasks: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [allData, setAllData] = useState({});
  const [exporting, setExporting] = useState(null);
  const [clientsMap, setClientsMap] = useState({});

  useEffect(() => { fetchAllData(); }, []);

  async function fetchAllData() {
    try {
      const [cSnap, clSnap, iSnap, pSnap, tSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'invoices')),
        getDocs(collection(db, 'inventory')),
        getDocs(collection(db, 'tasks')),
      ]);

      const companiesData = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const clientsData = clSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const invoicesData = iSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const productsData = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const tasksData = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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

      const lowStockList = productsData.filter(p => p.quantity < 5);
      const completed = tasksData.filter(t => t.status === 'completed').length;

      setStats({
        companies: companiesData.length,
        clients: clientsData.length,
        invoices: invoicesData.length,
        products: productsData.length,
        tasks: tasksData.length,
        totalRevenue: revenue,
        paidInvoices: paid,
        pendingInvoices: pending,
        overdueInvoices: overdue,
        lowStockProducts: lowStockList.length,
        completedTasks: completed,
      });

      setRecentInvoices([...invoicesData].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5));
      setLowStock(lowStockList);
      setAllData({ companiesData, clientsData, invoicesData, productsData, tasksData });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function exportToExcel(type) {
    setExporting(type);
    await new Promise(r => setTimeout(r, 300));

    const map = {
      companies: { data: allData.companiesData, file: 'الشركات.xlsx' },
      clients: { data: allData.clientsData, file: 'العملاء.xlsx' },
      invoices: { data: allData.invoicesData, file: 'الفواتير.xlsx' },
      products: { data: allData.productsData, file: 'المنتجات.xlsx' },
      tasks: { data: allData.tasksData, file: 'المهام.xlsx' },
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

  const payRate = stats.invoices > 0 ? Math.round((stats.paidInvoices / stats.invoices) * 100) : 0;
  const taskRate = stats.tasks > 0 ? Math.round((stats.completedTasks / stats.tasks) * 100) : 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">

        <div className="header">
          <div>
            <h1><i className="fas fa-chart-pie" style={{ color: '#6366f1', marginLeft: 10 }}></i>التقارير والإحصائيات</h1>
            <p className="subtitle">نظرة شاملة على أداء أعمالك</p>
          </div>
          <button onClick={() => { setLoading(true); fetchAllData(); }} className="btn-secondary">
            <i className="fas fa-sync-alt"></i> تحديث
          </button>
        </div>

        {/* Main Stats */}
        <div className="stats-row">
          {[
            { label: 'الشركات', value: stats.companies, icon: 'fas fa-building', cls: 'indigo' },
            { label: 'العملاء', value: stats.clients, icon: 'fas fa-user-friends', cls: 'green' },
            { label: 'الفواتير', value: stats.invoices, icon: 'fas fa-file-invoice', cls: 'amber' },
            { label: 'المنتجات', value: stats.products, icon: 'fas fa-boxes', cls: 'purple' },
            { label: 'المهام', value: stats.tasks, icon: 'fas fa-tasks', cls: 'pink' },
            { label: 'الإيرادات', value: stats.totalRevenue.toLocaleString() + ' ج', icon: 'fas fa-money-bill-wave', cls: 'cyan' },
          ].map(s => (
            <div key={s.label} className={`stat-card ${s.cls}`}>
              <div className="stat-icon"><i className={s.icon}></i></div>
              <div className="stat-value" style={{ fontSize: s.label === 'الإيرادات' ? 18 : 30 }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid-2" style={{ marginBottom: 24 }}>

          {/* Invoice Status */}
          <div className="card">
            <h3 style={{ marginBottom: 20 }}>
              <i className="fas fa-chart-donut" style={{ color: '#f59e0b' }}></i>
              حالة الفواتير
            </h3>
            {[
              { label: 'مدفوعة', count: stats.paidInvoices, color: '#10b981', bg: '#d1fae5' },
              { label: 'قيد الانتظار', count: stats.pendingInvoices, color: '#f59e0b', bg: '#fef3c7' },
              { label: 'متأخرة', count: stats.overdueInvoices, color: '#ef4444', bg: '#fee2e2' },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)' }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>
                    {item.count} ({stats.invoices > 0 ? Math.round(item.count / stats.invoices * 100) : 0}%)
                  </span>
                </div>
                <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: stats.invoices > 0 ? `${item.count / stats.invoices * 100}%` : '0%',
                    background: item.color,
                    borderRadius: 99,
                    transition: 'width 0.8s ease',
                  }}></div>
                </div>
              </div>
            ))}
            <div style={{
              marginTop: 16, padding: '10px 14px',
              background: 'var(--primary-bg)', borderRadius: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ fontSize: 13, color: 'var(--primary-dark)', fontWeight: 600 }}>معدل السداد</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{payRate}%</span>
            </div>
          </div>

          {/* Inventory & Tasks */}
          <div className="card">
            <h3 style={{ marginBottom: 20 }}>
              <i className="fas fa-chart-bar" style={{ color: '#8b5cf6' }}></i>
              مؤشرات الأداء
            </h3>

            <div style={{
              padding: '14px 16px', background: stats.lowStockProducts > 0 ? '#fef2f2' : '#f0fdf4',
              borderRadius: 10, marginBottom: 12,
              border: `1px solid ${stats.lowStockProducts > 0 ? '#fecaca' : '#bbf7d0'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: stats.lowStockProducts > 0 ? '#dc2626' : '#16a34a', marginBottom: 2 }}>
                    <i className={`fas fa-${stats.lowStockProducts > 0 ? 'exclamation-triangle' : 'check-circle'}`} style={{ marginLeft: 6 }}></i>
                    تنبيهات المخزون
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                    {stats.lowStockProducts > 0 ? `${stats.lowStockProducts} منتج أقل من 5 وحدات` : 'جميع المنتجات بمستويات جيدة'}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: stats.lowStockProducts > 0 ? '#dc2626' : '#16a34a' }}>
                  {stats.lowStockProducts}
                </div>
              </div>
            </div>

            <div style={{
              padding: '14px 16px', background: 'var(--primary-bg)',
              borderRadius: 10, border: '1px solid var(--primary-light)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-dark)' }}>
                  <i className="fas fa-tasks" style={{ marginLeft: 6 }}></i>
                  إنجاز المهام
                </span>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{taskRate}%</span>
              </div>
              <div style={{ height: 10, background: 'var(--gray-200)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${taskRate}%`,
                  background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                  borderRadius: 99, transition: 'width 0.8s ease',
                }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{stats.completedTasks} منجزة</span>
                <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{stats.tasks - stats.completedTasks} متبقية</span>
              </div>
            </div>

            {lowStock.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', marginBottom: 6 }}>المنتجات الحرجة:</div>
                {lowStock.slice(0, 3).map(p => (
                  <div key={p.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', background: 'var(--gray-50)', borderRadius: 6, marginBottom: 4
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--gray-700)' }}>{p.name}</span>
                    <span className="badge badge-expired">{p.quantity} متبقي</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Export Section */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>
            <i className="fas fa-file-excel" style={{ color: '#10b981' }}></i>
            تصدير البيانات إلى Excel
          </h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {exportItems.map(item => (
              <button
                key={item.type}
                onClick={() => exportToExcel(item.type)}
                disabled={exporting === item.type}
                className="btn-secondary"
                style={{ borderColor: item.color + '40', color: item.color }}
              >
                {exporting === item.type
                  ? <i className="fas fa-spinner fa-spin"></i>
                  : <i className={item.icon}></i>}
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent Invoices */}
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
                    <th>#</th>
                    <th>العميل</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
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
