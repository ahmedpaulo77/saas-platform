// src/pages/Reports.js - صفحة التقارير والإحصائيات (بأيقونات Font Awesome)
import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import Sidebar from '../components/common/Sidebar';

export default function Reports() {
  const [stats, setStats] = useState({
    companies: 0,
    clients: 0,
    invoices: 0,
    products: 0,
    tasks: 0,
    totalRevenue: 0,
    paidInvoices: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    lowStockProducts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [lowStock, setLowStock] = useState([]);

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    try {
      const companiesSnapshot = await getDocs(collection(db, 'companies'));
      const companiesCount = companiesSnapshot.size;

      const clientsSnapshot = await getDocs(collection(db, 'clients'));
      const clientsCount = clientsSnapshot.size;

      const invoicesSnapshot = await getDocs(collection(db, 'invoices'));
      const invoicesData = [];
      let totalRevenue = 0;
      let paid = 0,
        pending = 0,
        overdue = 0;

      invoicesSnapshot.forEach((doc) => {
        const data = { id: doc.id, ...doc.data() };
        invoicesData.push(data);
        totalRevenue += data.amount || 0;

        if (data.status === 'paid') paid++;
        else if (data.status === 'pending') pending++;
        else if (data.status === 'overdue') overdue++;
      });

      const sortedInvoices = invoicesData
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

      const productsSnapshot = await getDocs(collection(db, 'inventory'));
      const productsData = [];
      productsSnapshot.forEach((doc) => {
        productsData.push({ id: doc.id, ...doc.data() });
      });
      const productsCount = productsData.length;

      const lowStockProducts = productsData.filter((p) => p.quantity < 5);

      const tasksSnapshot = await getDocs(collection(db, 'tasks'));
      const tasksCount = tasksSnapshot.size;

      setStats({
        companies: companiesCount,
        clients: clientsCount,
        invoices: invoicesData.length,
        products: productsCount,
        tasks: tasksCount,
        totalRevenue: totalRevenue,
        paidInvoices: paid,
        pendingInvoices: pending,
        overdueInvoices: overdue,
        lowStockProducts: lowStockProducts.length,
      });

      setRecentInvoices(sortedInvoices);
      setLowStock(lowStockProducts);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('حدث خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="loading">جاري تحميل التقارير...</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: '#333', marginBottom: '20px' }}>
          <i className="fas fa-chart-pie" style={{ color: '#4f46e5' }}></i> التقارير والإحصائيات
        </h2>

        <div className="grid-3">
          <div className="card" style={{ borderRight: '4px solid #4f46e5' }}>
            <h3><i className="fas fa-building" style={{ color: '#4f46e5' }}></i> الشركات</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#4f46e5' }}>
              {stats.companies}
            </p>
          </div>

          <div className="card" style={{ borderRight: '4px solid #10b981' }}>
            <h3><i className="fas fa-user-friends" style={{ color: '#10b981' }}></i> العملاء</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
              {stats.clients}
            </p>
          </div>

          <div className="card" style={{ borderRight: '4px solid #f59e0b' }}>
            <h3><i className="fas fa-file-invoice" style={{ color: '#f59e0b' }}></i> الفواتير</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>
              {stats.invoices}
            </p>
          </div>

          <div className="card" style={{ borderRight: '4px solid #8b5cf6' }}>
            <h3><i className="fas fa-boxes" style={{ color: '#8b5cf6' }}></i> المنتجات</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>
              {stats.products}
            </p>
          </div>

          <div className="card" style={{ borderRight: '4px solid #ec4899' }}>
            <h3><i className="fas fa-tasks" style={{ color: '#ec4899' }}></i> المهام</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#ec4899' }}>
              {stats.tasks}
            </p>
          </div>

          <div className="card" style={{ borderRight: '4px solid #06b6d4' }}>
            <h3><i className="fas fa-money-bill-wave" style={{ color: '#06b6d4' }}></i> إجمالي الإيرادات</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#06b6d4' }}>
              {stats.totalRevenue.toFixed(2)} ج.م
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
          <div className="card">
            <h3><i className="fas fa-chart-bar" style={{ color: '#f59e0b' }}></i> حالة الفواتير</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                <span><i className="fas fa-check-circle" style={{ color: '#10b981' }}></i> مدفوعة</span>
                <span style={{ fontWeight: 'bold', color: '#10b981' }}>{stats.paidInvoices}</span>
              </li>
              <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                <span><i className="fas fa-clock" style={{ color: '#f59e0b' }}></i> قيد الانتظار</span>
                <span style={{ fontWeight: 'bold', color: '#f59e0b' }}>{stats.pendingInvoices}</span>
              </li>
              <li style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span><i className="fas fa-exclamation-triangle" style={{ color: '#ef4444' }}></i> متأخرة</span>
                <span style={{ fontWeight: 'bold', color: '#ef4444' }}>{stats.overdueInvoices}</span>
              </li>
            </ul>
          </div>

          <div className="card">
            <h3><i className="fas fa-exclamation-circle" style={{ color: '#ef4444' }}></i> تنبيهات المخزون</h3>
            {stats.lowStockProducts === 0 ? (
              <p style={{ color: '#10b981' }}><i className="fas fa-check-circle"></i> جميع المنتجات متوفرة بكميات جيدة</p>
            ) : (
              <p style={{ color: '#ef4444' }}>
                <i className="fas fa-exclamation-triangle"></i> {stats.lowStockProducts} منتج (منتجات) أقل من 5 في المخزون
              </p>
            )}
            {lowStock.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, marginTop: '10px' }}>
                {lowStock.map((product) => (
                  <li key={product.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>{product.name}</span>
                    <span style={{ color: '#ef4444' }}>{product.quantity} متبقي</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-history" style={{ color: '#4f46e5' }}></i> أحدث الفواتير</h3>
          </div>
          {recentInvoices.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#999' }}>لا توجد فواتير مسجلة</p>
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
                {recentInvoices.map((invoice, index) => (
                  <tr key={invoice.id}>
                    <td>{index + 1}</td>
                    <td>{invoice.clientId || 'غير محدد'}</td>
                    <td>{invoice.amount} ج.م</td>
                    <td>
                      <span className={`badge ${
                        invoice.status === 'paid' ? 'badge-paid' :
                        invoice.status === 'pending' ? 'badge-pending' : 'badge-overdue'
                      }`}>
                        {invoice.status === 'paid' ? 'مدفوعة' :
                         invoice.status === 'pending' ? 'قيد الانتظار' : 'متأخرة'}
                      </span>
                    </td>
                    <td>{new Date(invoice.date).toLocaleDateString('ar-EG')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}