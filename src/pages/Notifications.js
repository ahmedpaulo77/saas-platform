// src/pages/Notifications.js - نظام الإشعارات
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import Sidebar from '../components/common/Sidebar';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  async function fetchNotifications() {
    try {
      const notificationsList = [];

      // 1. إشعارات المخزون (منتجات أقل من 5)
      const productsSnapshot = await getDocs(collection(db, 'inventory'));
      productsSnapshot.forEach((doc) => {
        const product = { id: doc.id, ...doc.data() };
        if (product.quantity < 5) {
          notificationsList.push({
            id: `stock-${product.id}`,
            type: 'warning',
            title: `⚠️ تنبيه مخزون: ${product.name}`,
            message: `الكمية المتبقية: ${product.quantity} (أقل من 5)`,
            date: new Date().toISOString(),
            read: false,
          });
        }
      });

      // 2. إشعارات الفواتير المتأخرة
      const invoicesSnapshot = await getDocs(collection(db, 'invoices'));
      invoicesSnapshot.forEach((doc) => {
        const invoice = { id: doc.id, ...doc.data() };
        if (invoice.status === 'overdue') {
          notificationsList.push({
            id: `invoice-${invoice.id}`,
            type: 'danger',
            title: `⚠️ فاتورة متأخرة`,
            message: `الفاتورة رقم ${invoice.id} متأخرة`,
            date: invoice.date || new Date().toISOString(),
            read: false,
          });
        }
      });

      // 3. إشعارات المهام (الاستحقاق خلال 3 أيام)
      const tasksSnapshot = await getDocs(collection(db, 'tasks'));
      tasksSnapshot.forEach((doc) => {
        const task = { id: doc.id, ...doc.data() };
        const dueDate = new Date(task.dueDate);
        const today = new Date();
        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays <= 3 && diffDays >= 0 && task.status !== 'completed') {
          notificationsList.push({
            id: `task-${task.id}`,
            type: 'info',
            title: `📋 مهمة قريبة: ${task.title}`,
            message: `تاريخ الاستحقاق: ${dueDate.toLocaleDateString('ar-EG')}`,
            date: task.dueDate,
            read: false,
          });
        }
      });

      // ترتيب الإشعارات من الأحدث
      notificationsList.sort((a, b) => new Date(b.date) - new Date(a.date));

      setNotifications(notificationsList);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="loading">جاري تحميل الإشعارات...</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: '#333', marginBottom: '20px' }}>
          <i className="fas fa-bell" style={{ color: '#4f46e5' }}></i> الإشعارات
          <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#64748b', marginRight: '10px' }}>
            ({notifications.length} إشعار)
          </span>
        </h2>

        {notifications.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <i className="fas fa-check-circle" style={{ fontSize: '48px', color: '#10b981' }}></i>
            <h3 style={{ marginTop: '16px' }}>كل شيء هادئ!</h3>
            <p style={{ color: '#64748b' }}>لا توجد إشعارات جديدة في الوقت الحالي</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="card"
                style={{
                  borderRight: `4px solid ${
                    notification.type === 'danger' ? '#ef4444' :
                    notification.type === 'warning' ? '#f59e0b' : '#4f46e5'
                  }`,
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ marginBottom: '4px' }}>{notification.title}</h4>
                    <p style={{ color: '#64748b', margin: 0 }}>{notification.message}</p>
                    <small style={{ color: '#94a3b8' }}>
                      {new Date(notification.date).toLocaleDateString('ar-EG')}
                    </small>
                  </div>
                  <span
                    className={`badge ${
                      notification.type === 'danger' ? 'badge-expired' :
                      notification.type === 'warning' ? 'badge-pending' : 'badge-active'
                    }`}
                  >
                    {notification.type === 'danger' ? 'عاجل' :
                     notification.type === 'warning' ? 'تنبيه' : 'معلومة'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}