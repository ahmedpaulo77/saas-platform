// src/context/NotificationsContext.js
// ✅ مصدر واحد للتنبيهات - بيستخدم onSnapshot (استماع لحظي حقيقي)
// بدل getDocs (قراءة لمرة واحدة). أي تغيير في المخزون/الفواتير/المهام
// بيوصل فورًا للـ Sidebar وصفحة الإشعارات من غير أي انتظار أو Refresh يدوي.

import React, { createContext, useState, useEffect, useMemo, useContext } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { getScopedQuery } from '../utils/companyQuery';
import { useLanguage } from '../i18n/LanguageContext';

const NotificationsContext = createContext();

export function useNotifications() {
  return useContext(NotificationsContext);
}

// ✅ لو باقي على انتهاء صلاحية الدواء الرقم ده من الأيام أو أقل → يتحول لتنبيه
const EXPIRY_WARNING_DAYS = 30;

function parseDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function NotificationsProvider({ children }) {
  const { userRole, userCompanyId, currentUser } = useAuth();
  const { t } = useLanguage();

  // ✅ كل مصدر بيانات ليه state منفصلة، وبيتجمعوا مع بعض تحت
  const [stockAlerts, setStockAlerts] = useState([]);
  const [expiryAlerts, setExpiryAlerts] = useState([]);
  const [invoiceAlerts, setInvoiceAlerts] = useState([]);
  const [taskAlerts, setTaskAlerts] = useState([]);

  const [loadedFlags, setLoadedFlags] = useState({
    inventory: false,
    invoices: false,
    tasks: false,
  });

  // ✅ استماع لحظي على المخزون: تنبيه نقص الكمية + تنبيه قرب/انتهاء الصلاحية
  useEffect(() => {
    if (!userCompanyId) {
      setStockAlerts([]);
      setExpiryAlerts([]);
      setLoadedFlags((f) => ({ ...f, inventory: true }));
      return;
    }

    const q = getScopedQuery('inventory', userRole, userCompanyId);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const stock = [];
        const expiry = [];
        const today = startOfDay(new Date());

        snap.forEach((d) => {
          const p = { id: d.id, ...d.data() };

          if (p.quantity < 5) {
            stock.push({
              id: `stock-${p.id}`,
              type: 'warning',
              icon: 'fas fa-exclamation-triangle',
              title: t('nt.stockTitle', { name: p.name }),
              message: t('nt.stockMsg', { qty: p.quantity }),
              date: new Date().toISOString(),
            });
          }

          const expDate = parseDate(p.expiryDate);
          if (expDate) {
            const daysLeft = Math.round((startOfDay(expDate) - today) / (1000 * 60 * 60 * 24));
            if (daysLeft < 0) {
              expiry.push({
                id: `exp-${p.id}`,
                type: 'danger',
                icon: 'fas fa-calendar-times',
                title: t('nt.expiredTitle', { name: p.name }),
                message: t('nt.expiredMsg', { n: Math.abs(daysLeft) }),
                date: expDate.toISOString(),
              });
            } else if (daysLeft <= EXPIRY_WARNING_DAYS) {
              expiry.push({
                id: `exp-${p.id}`,
                type: 'warning',
                icon: 'fas fa-calendar-times',
                title: t('nt.expSoonTitle', { name: p.name }),
                message: t('nt.expSoonMsg', { n: daysLeft }),
                date: expDate.toISOString(),
              });
            }
          }
        });

        setStockAlerts(stock);
        setExpiryAlerts(expiry);
        setLoadedFlags((f) => ({ ...f, inventory: true }));
      },
      (error) => {
        console.error('Error listening to inventory:', error);
        setLoadedFlags((f) => ({ ...f, inventory: true }));
      }
    );

    return () => unsubscribe();
  }, [userRole, userCompanyId, t]);

  // ✅ استماع لحظي على الفواتير: تنبيه فاتورة متأخرة السداد
  useEffect(() => {
    if (!userCompanyId) {
      setInvoiceAlerts([]);
      setLoadedFlags((f) => ({ ...f, invoices: true }));
      return;
    }

    const q = getScopedQuery('invoices', userRole, userCompanyId);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const inv = { id: d.id, ...d.data() };
          if (inv.status === 'overdue') {
            list.push({
              id: `inv-${inv.id}`,
              type: 'danger',
              icon: 'fas fa-file-invoice',
              title: t('nt.invTitle'),
              message: t('nt.invMsg', { amount: inv.amount?.toLocaleString() }),
              date: inv.date || new Date().toISOString(),
            });
          }
        });
        setInvoiceAlerts(list);
        setLoadedFlags((f) => ({ ...f, invoices: true }));
      },
      (error) => {
        console.error('Error listening to invoices:', error);
        setLoadedFlags((f) => ({ ...f, invoices: true }));
      }
    );

    return () => unsubscribe();
  }, [userRole, userCompanyId, t]);

  // ✅ استماع لحظي على المهام: تنبيه مهمة قرب موعدها
  useEffect(() => {
    if (!userCompanyId) {
      setTaskAlerts([]);
      setLoadedFlags((f) => ({ ...f, tasks: true }));
      return;
    }

    const q = getScopedQuery('tasks', userRole, userCompanyId);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const task = { id: d.id, ...d.data() };
          if (task.dueDate && task.status !== 'completed') {
            const due = new Date(task.dueDate);
            const diff = Math.ceil((due - new Date()) / 86400000);
            if (diff <= 3 && diff >= 0) {
              const when = diff === 0 ? t('nt.taskToday') : t('nt.taskDays', { n: diff });
              list.push({
                id: `task-${task.id}`,
                type: 'info',
                icon: 'fas fa-tasks',
                title: t('nt.taskTitle', { title: task.title }),
                message: t('nt.taskMsg', {
                  date: due.toLocaleDateString(),
                  when: when,
                }),
                date: task.dueDate,
              });
            }
          }
        });
        setTaskAlerts(list);
        setLoadedFlags((f) => ({ ...f, tasks: true }));
      },
      (error) => {
        console.error('Error listening to tasks:', error);
        setLoadedFlags((f) => ({ ...f, tasks: true }));
      }
    );

    return () => unsubscribe();
  }, [userRole, userCompanyId, t]);

  // ✅ تجميع كل المصادر في قائمة واحدة مرتبة بالأحدث
  const notifications = useMemo(() => {
    const all = [...stockAlerts, ...expiryAlerts, ...invoiceAlerts, ...taskAlerts];
    all.sort((a, b) => new Date(b.date) - new Date(a.date));
    return all;
  }, [stockAlerts, expiryAlerts, invoiceAlerts, taskAlerts]);

  const loading = !currentUser
    ? false
    : !(loadedFlags.inventory && loadedFlags.invoices && loadedFlags.tasks);

  // ✅ الداتا بقت لحظية أوتوماتيك، فمفيش حاجة تعملها فعليًا - لكن سايبها
  // موجودة عشان زرار "تحديث" في الصفحة يفضل شغال من غير ما يكسر حاجة
  const refresh = () => {};

  const value = {
    notifications,
    loading,
    unreadCount: notifications.length,
    refresh,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}