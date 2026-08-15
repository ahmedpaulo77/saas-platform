// src/pages/Dashboard.js
import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';

const featureCards = [
  { to: '/companies', icon: 'fas fa-building', color: '#6366f1', bg: '#eef2ff', title: 'إدارة الشركات', desc: 'إضافة وتعديل الشركات المسجلة في النظام' },
  { to: '/clients', icon: 'fas fa-user-friends', color: '#10b981', bg: '#d1fae5', title: 'إدارة العملاء', desc: 'إدارة عملاء الشركات وإضافة عملاء جدد' },
  { to: '/invoices', icon: 'fas fa-file-invoice', color: '#f59e0b', bg: '#fef3c7', title: 'إدارة الفواتير', desc: 'إنشاء وتتبع الفواتير مع تصدير PDF' },
  { to: '/inventory', icon: 'fas fa-boxes', color: '#8b5cf6', bg: '#f3e8ff', title: 'إدارة المخزون', desc: 'تتبع المنتجات والكميات والأسعار' },
  { to: '/tasks', icon: 'fas fa-tasks', color: '#ec4899', bg: '#fdf2f8', title: 'إدارة المهام', desc: 'توزيع ومتابعة المهام على الفريق' },
  { to: '/projects', icon: 'fas fa-project-diagram', color: '#f43f5e', bg: '#ffe4e6', title: 'إدارة المشاريع', desc: 'إدارة المشاريع ومتابعة التقدم' },
  { to: '/users', icon: 'fas fa-users', color: '#8b5cf6', bg: '#f3e8ff', title: 'إدارة المستخدمين', desc: 'إدارة المستخدمين والصلاحيات' },
  { to: '/reports', icon: 'fas fa-chart-pie', color: '#06b6d4', bg: '#ecfeff', title: 'التقارير والإحصائيات', desc: 'تقارير شاملة وتصدير Excel' },
];

export default function Dashboard() {
  const { currentUser, userRole, userCompanyId, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    companies: 0,
    clients: 0,
    invoices: 0,
    tasks: 0,
    projects: 0,
    users: 0,
    revenue: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // التأكد من جاهزية صفتك وصلاحياتك قبل تنفيذ الاستعلام
    if (!currentUser) return;
    if (userRole !== 'super_admin' && !userCompanyId) return;

    setLoading(true);

    // بناء الاستعلامات حسب نوع المستخدم
    const compRef = collection(db, 'companies');
    const cliRef = collection(db, 'clients');
    const invRef = collection(db, 'invoices');
    const taskRef = collection(db, 'tasks');
    const projRef = collection(db, 'projects');
    const usersRef = collection(db, 'users');

    const isSuper = userRole === 'super_admin';

    const compQ = isSuper ? compRef : query(compRef, where('__name__', '==', userCompanyId));
    const cliQ = isSuper ? cliRef : query(cliRef, where('companyId', '==', userCompanyId));
    const invQ = isSuper ? invRef : query(invRef, where('companyId', '==', userCompanyId));
    const taskQ = isSuper ? taskRef : query(taskRef, where('companyId', '==', userCompanyId));
    const projQ = isSuper ? projRef : query(projRef, where('companyId', '==', userCompanyId));
    const usersQ = isSuper ? usersRef : query(usersRef, where('companyId', '==', userCompanyId));

    // إعداد المشرفين اللحظيين (Listeners)
    const unsubComp = onSnapshot(compQ, (snap) => setStats(prev => ({ ...prev, companies: snap.size })));
    const unsubCli = onSnapshot(cliQ, (snap) => setStats(prev => ({ ...prev, clients: snap.size })));
    const unsubTask = onSnapshot(taskQ, (snap) => setStats(prev => ({ ...prev, tasks: snap.size })));
    const unsubProj = onSnapshot(projQ, (snap) => setStats(prev => ({ ...prev, projects: snap.size })));
    const unsubUsers = onSnapshot(usersQ, (snap) => setStats(prev => ({ ...prev, users: snap.size })));
    
    const unsubInv = onSnapshot(invQ, (snap) => {
      let totalRevenue = 0;
      snap.forEach((doc) => {
        const amount = parseFloat(doc.data().amount) || 0;
        totalRevenue += amount;
      });
      setStats(prev => ({
        ...prev,
        invoices: snap.size,
        revenue: totalRevenue
      }));
      setLoading(false);
    });

    // إغلاق الاستماع عند مغادرة الصفحة لتجنب استهلاك الذاكرة
    return () => {
      unsubComp();
      unsubCli();
      unsubInv();
      unsubTask();
      unsubProj();
      unsubUsers();
    };
  }, [currentUser, userRole, userCompanyId]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>مرحباً بك 👋</h1>
            <p className="subtitle">لوحة تحكم SaaS PRO — نظرة عامة على أعمالك</p>
          </div>
          <div className="user-info">
            <div className="avatar">{currentUser?.email?.charAt(0).toUpperCase() || 'A'}</div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>{currentUser?.email}</span>
            <span className="role-badge">{userRole === 'super_admin' ? '👑 أدمن' : '👤 مستخدم'}</span>
            <button onClick={async () => { await logout(); navigate('/login'); }} className="btn-danger btn-sm">
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-building"></i></div>
            <div className="stat-value">{loading ? '...' : stats.companies}</div>
            <div className="stat-label">الشركات</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-user-friends"></i></div>
            <div className="stat-value">{loading ? '...' : stats.clients}</div>
            <div className="stat-label">العملاء</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-file-invoice"></i></div>
            <div className="stat-value">{loading ? '...' : stats.invoices}</div>
            <div className="stat-label">الفواتير</div>
          </div>
          <div className="stat-card pink">
            <div className="stat-icon"><i className="fas fa-tasks"></i></div>
            <div className="stat-value">{loading ? '...' : stats.tasks}</div>
            <div className="stat-label">المهام</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-project-diagram"></i></div>
            <div className="stat-value">{loading ? '...' : stats.projects}</div>
            <div className="stat-label">المشاريع</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-icon"><i className="fas fa-users"></i></div>
            <div className="stat-value">{loading ? '...' : stats.users}</div>
            <div className="stat-label">المستخدمين</div>
          </div>
          <div className="stat-card cyan">
            <div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div>
            <div className="stat-value" style={{ fontSize: 22 }}>
              {loading ? '...' : stats.revenue.toLocaleString('ar-EG')}
            </div>
            <div className="stat-label">إجمالي الإيرادات (ج.م)</div>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}><div className="section-title"><i className="fas fa-th-large"></i> الوحدات الرئيسية</div></div>
        <div className="grid-3">
          {featureCards.map(card => (
            <div key={card.to} className="card hoverable feature-card">
              <div className="card-icon" style={{ background: card.bg, color: card.color, width: 52, height: 52 }}>
                <i className={card.icon}></i>
              </div>
              <div className="card-body">
                <h3 style={{ color: '#1e293b' }}>{card.title}</h3>
                <p>{card.desc}</p>
              </div>
              <button onClick={() => navigate(card.to)} className="btn-primary btn-block">
                <i className="fas fa-arrow-left"></i> الانتقال
              </button>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginTop: 4 }}>
          <div className="card" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', border: 'none' }}>
            <h3 style={{ color: 'white', marginBottom: 8 }}><i className="fas fa-crown"></i> ترقية الاشتراك</h3>
            <p style={{ color: 'rgba(255,255,255,0.75)', marginBottom: 20 }}>استفد من جميع الميزات المتقدمة — فواتير PDF، تقارير مفصلة، دعم أولوية</p>
            <button onClick={() => navigate('/subscription')} style={{ background: 'white', color: '#6366f1', border: 'none', padding: '10px 22px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'Cairo, sans-serif', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-arrow-left"></i> عرض الباقات
            </button>
          </div>
          <div className="card" style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', color: 'white', border: 'none' }}>
            <h3 style={{ color: 'white', marginBottom: 8 }}><i className="fas fa-chart-line"></i> التقارير والإحصائيات</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>تصدير بياناتك إلى Excel وعرض تحليلات مفصلة عن أداء أعمالك</p>
            <button onClick={() => navigate('/reports')} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '10px 22px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'Cairo, sans-serif', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-arrow-left"></i> عرض التقارير
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}