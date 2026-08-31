// src/components/common/Sidebar.js - نسخة محسنة مع Messages
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAvailableModules } from '../../utils/modules';
import LanguageToggle from './LanguageToggle';
import { useLanguage } from '../../i18n/LanguageContext';
import './Sidebar.css';

export default function Sidebar() {
  const { t } = useLanguage();
  const { userRole, currentUser, userIndustry, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // ✅ تعريف القوائم جوه المكون (عشان الترجمة)
  const ALL_NAV_ITEMS = [
    { to: '/dashboard', icon: 'fas fa-th-large', label: t('nav.dashboard'), module: 'dashboard' },
    { to: '/pos', icon: 'fas fa-cash-register', label: t('nav.pos'), module: 'pos' },
    { to: '/companies', icon: 'fas fa-building', label: t('nav.companies'), module: 'companies' },
    { to: '/patients', icon: 'fas fa-hospital-user', label: t('nav.patients'), module: 'patients' },
    { to: '/appointments', icon: 'fas fa-calendar-alt', label: t('nav.appointments'), module: 'appointments' },
    { to: '/prescriptions', icon: 'fas fa-prescription', label: t('nav.prescriptions'), module: 'prescriptions' },
    { to: '/clients', icon: 'fas fa-user-friends', label: t('nav.clients'), module: 'clients' },
    { to: '/sellers', icon: 'fas fa-store', label: t('sellers.title'), module: 'sellers' },
    { to: '/buyers', icon: 'fas fa-user-plus', label: t('buyers.title'), module: 'buyers' },
    { to: '/messages', icon: 'fas fa-envelope', label: t('nav.messages'), module: 'messages' },
    { to: '/invoices', icon: 'fas fa-file-invoice', label: t('nav.invoices'), module: 'invoices' },
    { to: '/inventory', icon: 'fas fa-boxes', label: t('nav.inventory'), module: 'inventory' },
    { to: '/suppliers', icon: 'fas fa-truck', label: t('nav.suppliers'), module: 'suppliers' },
    { to: '/expiry', icon: 'fas fa-calendar-times', label: t('nav.expiry'), module: 'expiry' },
    { to: '/tasks', icon: 'fas fa-tasks', label: t('nav.tasks'), module: 'tasks' },
    { to: '/projects', icon: 'fas fa-project-diagram', label: t('nav.projects'), module: 'projects' },
  ];

  const ALL_SECONDARY_ITEMS = [
    { to: '/my-company', icon: 'fas fa-store', label: t('nav.myCompany'), module: 'my-company' },
    { to: '/users', icon: 'fas fa-users', label: t('nav.users'), module: 'users' },
    { to: '/reports', icon: 'fas fa-chart-pie', label: t('nav.reports'), module: 'reports' },
    { to: '/aging', icon: 'fas fa-clock', label: t('nav.aging'), module: 'aging' },
    { to: '/notifications', icon: 'fas fa-bell', label: t('nav.notifications'), module: 'notifications' },

    { to: '/profile', icon: 'fas fa-user-circle', label: t('nav.profile'), module: 'profile' },
    { to: '/about', icon: 'fas fa-info-circle', label: t('nav.about'), module: 'about' },
  ];

  const availableModules = getAvailableModules(userIndustry, userRole);
  const navItems = ALL_NAV_ITEMS.filter((item) => availableModules.has(item.module));
  const secondaryItems = ALL_SECONDARY_ITEMS.filter((item) => availableModules.has(item.module));

  // ✅ إغلاق القائمة عند تغيير المسار
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // ✅ منع التمرير في الخلفية عند فتح القائمة
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileOpen]);

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  const isActive = (path) => location.pathname === path;

  // ✅ toggle function
  const toggleSidebar = () => {
    setMobileOpen(!mobileOpen);
  };

  // ✅ close function
  const closeSidebar = () => {
    setMobileOpen(false);
  };

  const sidebarContent = (
    <>
           <div className="logo" style={{ cursor: 'pointer' }} onClick={() => { navigate('/dashboard'); closeSidebar(); }}>
        <div className="logo-icon">
          <i className="fas fa-cube"></i>
        </div>
        <div className="logo-text">
          <span className="logo-name">SaaS PRO</span>
          <span className="logo-badge">Business Platform</span>
        </div>
        <button onClick={closeSidebar} className="sidebar-close-btn" aria-label="Close menu">
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div style={{ margin: '12px 12px 4px' }}>
        <LanguageToggle variant="sidebar" />
      </div>

      <nav>
        <div className="nav-label">{t('nav.main')}</div>
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} className={isActive(item.to) ? 'active' : ''} onClick={closeSidebar}>
            <span className="icon"><i className={item.icon}></i></span>
            {item.label}
          </Link>
        ))}

        <div className="nav-label">{t('nav.settings')}</div>
        {secondaryItems.map((item) => (
          <Link key={item.to} to={item.to} className={isActive(item.to) ? 'active' : ''} onClick={closeSidebar}>
            <span className="icon"><i className={item.icon}></i></span>
            {item.label}
          </Link>
        ))}

        {userRole === 'super_admin' && (
          <>
            <div className="nav-label">{t('nav.admin')}</div>
            <Link to="/admin" className={isActive('/admin') ? 'active' : ''} onClick={closeSidebar}>
              <span className="icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <i className="fas fa-shield-alt" style={{ color: '#f59e0b' }}></i>
              </span>
              <span style={{ color: '#fcd34d' }}>{t('nav.adminPanel')}</span>
            </Link>
            <Link to="/admin/users" className={isActive('/admin/users') ? 'active' : ''} onClick={closeSidebar}>
              <span className="icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <i className="fas fa-users-cog" style={{ color: '#f59e0b' }}></i>
              </span>
              <span style={{ color: '#fcd34d' }}>{t('nav.manageUsers')}</span>
            </Link>
          </>
        )}
      </nav>

      <div className="user-info-strip">
        <div className="user-avatar">
          {currentUser?.email?.charAt(0).toUpperCase() || 'A'}
        </div>
        <div className="user-details">
          <div className="user-email">{currentUser?.email}</div>
          <div className="user-role">
            {userRole === 'super_admin' ? `👑 ${t('role.superAdmin')}` : userRole === 'admin' ? `⚡ ${t('role.admin')}` : `👤 ${t('role.user')}`}
          </div>
        </div>
      </div>

      

      <button onClick={handleLogout} className="logout-btn">
        <i className="fas fa-sign-out-alt"></i>
        {t('nav.logout')}
      </button>
    </>
  );

  return (
    <>
      {/* ✅ Hamburger Button محسن */}
      <button 
        className="hamburger-btn" 
        onClick={toggleSidebar} 
        aria-label={t('nav.openMenu')}
      >
        <i className={`fas ${mobileOpen ? 'fa-times' : 'fa-bars'}`}></i>
      </button>

      {/* ✅ Overlay محسن */}
      {mobileOpen && (
        <div className="sidebar-overlay active" onClick={closeSidebar} />
      )}

      {/* ✅ القائمة الجانبية */}
      <div className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {sidebarContent}
      </div>
    </>
  );
}