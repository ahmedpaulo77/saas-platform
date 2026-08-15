// src/pages/Dashboard.js - بدون تحذيرات
import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
  const [stats, setStats] = useState({ companies: 0, clients: 0, invoices: 0, tasks: 0, projects: 0, users: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    // لو مش super_admin ومفيش companyId — استنى
    if (userRole !== 'super_admin' && !userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      let compQuery, cliQuery, invQuery, taskQuery, projQuery, usersQuery;

      if (userRole === 'super_admin') {
        compQuery  = collection(db, 'companies');
        cliQuery   = collection(db, 'clients');
        invQuery   = collection(db, 'invoices');
        taskQuery  = collection(db, 'tasks');
        projQuery  = collection(db, 'projects');
        usersQuery = collection(db, 'users');
      } else {
        compQuery  = query(collection(db, 'companies'), where('__name__', '==', userCompanyId));
        cliQuery   = query(collection(db, 'clients'),   where('companyId', '==', userCompanyId));
        invQuery   = query(collection(db, 'invoices'),  where('companyId', '==', userCompanyId));
        taskQuery  = query(collection(db, 'tasks'),     where('companyId', '==', userCompanyId));
        projQuery  = query(collection(db, 'projects'),  where('companyId', '==', userCompanyId));
        usersQuery = query(collection(db, 'users'),     where('companyId', '==', userCompanyId));
      }

      const [compSnap, cliSnap, invSnap, taskSnap, projSnap, usersSnap] = await Promise.all([
        getDocs(compQuery), getDocs(cliQuery), getDocs(invQuery),
        getDocs(taskQuery), getDocs(projQuery), getDocs(usersQuery),
      ]);

      let revenue = 0;
      invSnap.forEach(d => { revenue += d.data().amount || 0; });

      setStats({
        companies: compSnap.size, clients: cliSnap.size,
        invoices:  invSnap.size,  tasks:   taskSnap.size,
        projects:  projSnap.size, users:   usersSnap.size,
        revenue,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [userRole, userCompanyId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>{currentUser?.email}</span>
            <span className="role-badge">{userRole === 'super_admin' ? '👑 أدمن' : '👤 مستخدم'}</span>
            <button onClick={async () => { await logout(); navigate('/login'); }} className="btn-danger btn-sm">
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-building"></i></div>
            <div className="stat-value">{loading ? '—' : stats.companies}</div>
            <div className="stat-label">الشركات</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-user-friends"></i></div>
            <div className="stat-value">{loading ? '—' : stats.clients}</div>
            <div className="stat-label">العملاء</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-file-invoice"></i></div>
            <div className="stat-value">{loading ? '—' : stats.invoices}</div>
            <div className="stat-label">الفواتير</div>
          </div>
          <div className="stat-card pink">
            <div className="stat-icon"><i className="fas fa-tasks"></i></div>
            <div className="stat-value">{loading ? '—' : stats.tasks}</div>
            <div className="stat-label">المهام</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-project-diagram"></i></div>
            <div className="stat-value">{loading ? '—' : stats.projects}</div>
            <div className="stat-label">المشاريع</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-icon"><i className="fas fa-users"></i></div>
            <div className="stat-value">{loading ? '—' : stats.users}</div>
            <div className="stat-label">المستخدمين</div>
          </div>
          <div className="stat-card cyan">
            <div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div>
            <div className="stat-value" style={{ fontSize: 22, letterSpacing: -0.5 }}>
              {loading ? '—' : stats.revenue.toLocaleString('ar-EG')}
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
                <h3 style={{ color: 'var(--gray-800)' }}>{card.title}</h3>
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