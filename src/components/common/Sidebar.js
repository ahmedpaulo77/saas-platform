// src/components/common/Sidebar.js - كامل (مع إضافة Users)
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: 'fas fa-th-large', label: 'الرئيسية' },
  { to: '/companies', icon: 'fas fa-building', label: 'الشركات' },
  { to: '/clients', icon: 'fas fa-user-friends', label: 'العملاء' },
  { to: '/invoices', icon: 'fas fa-file-invoice', label: 'الفواتير' },
  { to: '/inventory', icon: 'fas fa-boxes', label: 'المخزون' },
  { to: '/tasks', icon: 'fas fa-tasks', label: 'المهام' },
  { to: '/projects', icon: 'fas fa-project-diagram', label: 'المشاريع' },
];

const secondaryItems = [
  { to: '/users', icon: 'fas fa-users', label: 'المستخدمين' },
  { to: '/reports', icon: 'fas fa-chart-pie', label: 'التقارير' },
  { to: '/notifications', icon: 'fas fa-bell', label: 'الإشعارات' },
  { to: '/subscription', icon: 'fas fa-crown', label: 'الاشتراك' },
  { to: '/profile', icon: 'fas fa-user-circle', label: 'الملف الشخصي' },
  { to: '/about', icon: 'fas fa-info-circle', label: 'حول النظام' },
];

export default function Sidebar() {
  const { userRole, currentUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  const isActive = (path) => location.pathname === path;

  return (
    <div className="sidebar">
      {/* Logo */}
      <div className="logo">
        <div className="logo-icon">
          <i className="fas fa-cube"></i>
        </div>
        <div className="logo-text">
          <span className="logo-name">SaaS PRO</span>
          <span className="logo-badge">Business Platform</span>
        </div>
      </div>

      <nav>
        {/* Main nav */}
        <div className="nav-label">القائمة الرئيسية</div>
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={isActive(item.to) ? 'active' : ''}
          >
            <span className="icon"><i className={item.icon}></i></span>
            {item.label}
          </Link>
        ))}

        {/* Secondary nav */}
        <div className="nav-label">الإعدادات والتقارير</div>
        {secondaryItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={isActive(item.to) ? 'active' : ''}
          >
            <span className="icon"><i className={item.icon}></i></span>
            {item.label}
          </Link>
        ))}

        {/* Admin link */}
        {userRole === 'super_admin' && (
          <>
            <div className="nav-label">مدير النظام</div>
            <Link to="/admin" className={isActive('/admin') ? 'active' : ''}>
              <span className="icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <i className="fas fa-shield-alt" style={{ color: '#f59e0b' }}></i>
              </span>
              <span style={{ color: '#fcd34d' }}>لوحة الأدمن</span>
            </Link>
            <Link to="/admin/users" className={isActive('/admin/users') ? 'active' : ''}>
              <span className="icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <i className="fas fa-users-cog" style={{ color: '#f59e0b' }}></i>
              </span>
              <span style={{ color: '#fcd34d' }}>إدارة المستخدمين</span>
            </Link>
          </>
        )}
      </nav>

      {/* User info strip */}
      <div style={{
        margin: '0 12px 10px',
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 800, fontSize: 14, flexShrink: 0,
        }}>
          {currentUser?.email?.charAt(0).toUpperCase() || 'A'}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {currentUser?.email}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
            {userRole === 'super_admin' ? '👑 مدير النظام' : '👤 مستخدم'}
          </div>
        </div>
      </div>

      {/* Logout */}
      <button onClick={handleLogout} className="logout-btn">
        <i className="fas fa-sign-out-alt"></i>
        تسجيل الخروج
      </button>
    </div>
  );
}