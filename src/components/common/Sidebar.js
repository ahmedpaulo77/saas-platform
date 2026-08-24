// src/components/common/Sidebar.js - مع دعم كامل للموبايل
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import LanguageToggle from './LanguageToggle';
import { getAvailableModules } from '../../utils/modules';

// كل الوحدات المتاحة مع بياناتها
const ALL_NAV_ITEMS = [
  { to: '/dashboard', icon: 'fas fa-th-large', labelKey: 'nav.dashboard', module: 'dashboard' },
  { to: '/pos', icon: 'fas fa-cash-register', labelKey: 'nav.pos', module: 'pos' },
  { to: '/companies', icon: 'fas fa-building', labelKey: 'nav.companies', module: 'companies' },
  { to: '/clients', icon: 'fas fa-user-friends', labelKey: 'nav.clients', module: 'clients' },
  { to: '/invoices', icon: 'fas fa-file-invoice', labelKey: 'nav.invoices', module: 'invoices' },
  { to: '/inventory', icon: 'fas fa-boxes', labelKey: 'nav.inventory', module: 'inventory' },
  { to: '/suppliers', icon: 'fas fa-truck', labelKey: 'nav.suppliers', module: 'suppliers' },
  { to: '/expiry', icon: 'fas fa-calendar-times', labelKey: 'nav.expiry', module: 'expiry' },
  { to: '/tasks', icon: 'fas fa-tasks', labelKey: 'nav.tasks', module: 'tasks' },
  { to: '/projects', icon: 'fas fa-project-diagram', labelKey: 'nav.projects', module: 'projects' },
];

const ALL_SECONDARY_ITEMS = [
  { to: '/my-company',   icon: 'fas fa-store',       labelKey: 'nav.myCompany', module: 'my-company' },
  { to: '/users',        icon: 'fas fa-users',        labelKey: 'nav.users', module: 'users' },
  { to: '/reports',      icon: 'fas fa-chart-pie',    labelKey: 'nav.reports', module: 'reports' },
  { to: '/aging',        icon: 'fas fa-clock',        labelKey: 'nav.aging', module: 'aging' },
  { to: '/notifications',icon: 'fas fa-bell',         labelKey: 'nav.notifications', module: 'notifications' },
  { to: '/subscription', icon: 'fas fa-crown',        labelKey: 'nav.subscription', module: 'subscription' },
  { to: '/profile',      icon: 'fas fa-user-circle',  labelKey: 'nav.profile', module: 'profile' },
  { to: '/about',        icon: 'fas fa-info-circle',  labelKey: 'nav.about', module: 'about' },
];

export default function Sidebar() {
  const { userRole, currentUser, userIndustry, logout } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // الوحدات المتاحة حسب المجال
  const availableModules = getAvailableModules(userIndustry, userRole);
  const navItems = ALL_NAV_ITEMS.filter((item) => availableModules.has(item.module));
  const secondaryItems = ALL_SECONDARY_ITEMS.filter((item) => availableModules.has(item.module));

  // أغلق الـ sidebar لما يتنقل لصفحة تانية
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  const isActive = (path) => location.pathname === path;

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="logo">
        <div className="logo-icon">
          <i className="fas fa-cube"></i>
        </div>
        <div className="logo-text">
          <span className="logo-name">SaaS PRO</span>
          <span className="logo-badge">Business Platform</span>
        </div>
        {/* زرار إغلاق على الموبايل */}
        <button
          onClick={() => setMobileOpen(false)}
          className="sidebar-close-btn"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      <nav>
        <div className="nav-label">{t('nav.main')}</div>
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} className={isActive(item.to) ? 'active' : ''}>
            <span className="icon"><i className={item.icon}></i></span>
            {t(item.labelKey)}
          </Link>
        ))}

        <div className="nav-label">{t('nav.settings')}</div>
        {secondaryItems.map((item) => (
          <Link key={item.to} to={item.to} className={isActive(item.to) ? 'active' : ''}>
            <span className="icon"><i className={item.icon}></i></span>
            {t(item.labelKey)}
          </Link>
        ))}

        {userRole === 'super_admin' && (
          <>
            <div className="nav-label">{t('nav.admin')}</div>
            <Link to="/admin" className={isActive('/admin') ? 'active' : ''}>
              <span className="icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <i className="fas fa-shield-alt" style={{ color: '#f59e0b' }}></i>
              </span>
              <span style={{ color: '#fcd34d' }}>{t('nav.adminPanel')}</span>
            </Link>
            <Link to="/admin/users" className={isActive('/admin/users') ? 'active' : ''}>
              <span className="icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <i className="fas fa-users-cog" style={{ color: '#f59e0b' }}></i>
              </span>
              <span style={{ color: '#fcd34d' }}>{t('nav.manageUsers')}</span>
            </Link>
          </>
        )}
      </nav>

      {/* User info */}
      <div style={{
        margin: '0 12px 10px', padding: '12px 14px',
        background: 'rgba(255,255,255,0.04)', borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 10,
        position: 'relative', zIndex: 2,
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
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {currentUser?.email}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
            {userRole === 'super_admin' ? `👑 ${t('role.superAdmin')}` : `👤 ${t('role.user')}`}
          </div>
        </div>
      </div>

      <button onClick={handleLogout} className="logout-btn">
        <i className="fas fa-sign-out-alt"></i>
        {t('nav.logout')}
      </button>
      <LanguageToggle variant="sidebar" />
    </>
  );

  return (
    <>
      {/* ── زرار الهامبرغر — موبايل فقط ── */}
      <button
        className="hamburger-btn"
        onClick={() => setMobileOpen(true)}
        aria-label={t('nav.openMenu')}
      >
        <i className="fas fa-bars"></i>
      </button>

      {/* ── Overlay — موبايل فقط ── */}
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <div className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {sidebarContent}
      </div>
    </>
  );
}
