// src/pages/Notifications.js - مع عزل البيانات حسب الشركة
import React, { useState, useEffect, useCallback } from 'react';
import { getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { getScopedQuery } from '../utils/companyQuery';
import Sidebar from '../components/common/Sidebar';

export default function Notifications() {
  const { userRole, userCompanyId } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchNotifications = useCallback(async () => {
    try {
      const list = [];

      const productsSnap = await getDocs(getScopedQuery('inventory', userRole, userCompanyId));
      productsSnap.forEach(d => {
        const p = { id: d.id, ...d.data() };
        if (p.quantity < 5) {
          list.push({
            id: `stock-${p.id}`,
            type: 'warning',
            icon: 'fas fa-exclamation-triangle',
            title: `تنبيه مخزون: ${p.name}`,
            message: `الكمية المتبقية ${p.quantity} وحدة — أقل من الحد الأدنى (5)`,
            date: new Date().toISOString(),
          });
        }
      });

      const invoicesSnap = await getDocs(getScopedQuery('invoices', userRole, userCompanyId));
      invoicesSnap.forEach(d => {
        const inv = { id: d.id, ...d.data() };
        if (inv.status === 'overdue') {
          list.push({
            id: `inv-${inv.id}`,
            type: 'danger',
            icon: 'fas fa-file-invoice',
            title: 'فاتورة متأخرة السداد',
            message: `فاتورة بمبلغ ${inv.amount?.toLocaleString()} ج.م تحتاج إلى مراجعة`,
            date: inv.date || new Date().toISOString(),
          });
        }
      });

      const tasksSnap = await getDocs(getScopedQuery('tasks', userRole, userCompanyId));
      tasksSnap.forEach(d => {
        const task = { id: d.id, ...d.data() };
        if (task.dueDate && task.status !== 'completed') {
          const due = new Date(task.dueDate);
          const diff = Math.ceil((due - new Date()) / 86400000);
          if (diff <= 3 && diff >= 0) {
            list.push({
              id: `task-${task.id}`,
              type: 'info',
              icon: 'fas fa-tasks',
              title: `مهمة تستحق قريباً: ${task.title}`,
              message: `تاريخ الاستحقاق: ${due.toLocaleDateString('ar-EG')} — ${diff === 0 ? 'اليوم!' : `بعد ${diff} أيام`}`,
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
  }, [userRole, userCompanyId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.type === filter);

  const counts = {
    all: notifications.length,
    danger: notifications.filter(n => n.type === 'danger').length,
    warning: notifications.filter(n => n.type === 'warning').length,
    info: notifications.filter(n => n.type === 'info').length,
  };

  if (loading) return (
    <div className="loading"><div className="spinner"></div>جاري تحميل الإشعارات...</div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">

        <div className="header">
          <div>
            <h1><i className="fas fa-bell" style={{ color: '#6366f1', marginLeft: 10 }}></i>الإشعارات</h1>
            <p className="subtitle">مراقبة تنبيهات المخزون والفواتير والمهام</p>
          </div>
          <button onClick={() => { setLoading(true); fetchNotifications(); }} className="btn-secondary">
            <i className="fas fa-sync-alt"></i> تحديث
          </button>
        </div>

        {/* Stats */}
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', marginBottom: 24 }}>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-bell"></i></div>
            <div className="stat-value">{counts.all}</div>
            <div className="stat-label">إجمالي الإشعارات</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-exclamation-circle"></i></div>
            <div className="stat-value">{counts.danger}</div>
            <div className="stat-label">عاجل</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div>
            <div className="stat-value">{counts.warning}</div>
            <div className="stat-label">تنبيهات</div>
          </div>
          <div className="stat-card cyan">
            <div className="stat-icon"><i className="fas fa-info-circle"></i></div>
            <div className="stat-value">{counts.info}</div>
            <div className="stat-label">معلومات</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'الكل', icon: 'fas fa-list' },
            { key: 'danger', label: 'عاجل', icon: 'fas fa-exclamation-circle' },
            { key: 'warning', label: 'تنبيهات', icon: 'fas fa-exclamation-triangle' },
            { key: 'info', label: 'معلومات', icon: 'fas fa-info-circle' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={filter === tab.key ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
            >
              <i className={tab.icon}></i> {tab.label}
              {counts[tab.key] > 0 && (
                <span style={{
                  background: filter === tab.key ? 'rgba(255,255,255,0.25)' : 'var(--primary-bg)',
                  color: filter === tab.key ? 'white' : 'var(--primary)',
                  padding: '1px 7px', borderRadius: 60, fontSize: 10, marginRight: 4, fontWeight: 700
                }}>{counts[tab.key]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Notifications list */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
            </div>
            <h3>كل شيء هادئ!</h3>
            <p>لا توجد إشعارات في هذه الفئة</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(n => (
              <div key={n.id} className={`notification-item ${n.type}`}>
                <div className="notification-icon">
                  <i className={n.icon}></i>
                </div>
                <div className="notification-content">
                  <div className="notification-title">{n.title}</div>
                  <div className="notification-msg">{n.message}</div>
                  <div className="notification-date">
                    <i className="fas fa-clock" style={{ marginLeft: 4 }}></i>
                    {new Date(n.date).toLocaleDateString('ar-EG')}
                  </div>
                </div>
                <span className={`badge ${n.type === 'danger' ? 'badge-expired' : n.type === 'warning' ? 'badge-pending' : 'badge-info'}`}>
                  {n.type === 'danger' ? 'عاجل' : n.type === 'warning' ? 'تنبيه' : 'معلومة'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
