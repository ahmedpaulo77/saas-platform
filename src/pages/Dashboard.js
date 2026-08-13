// src/pages/Dashboard.js - بأيقونات Font Awesome
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';

export default function Dashboard() {
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>مرحباً بك في لوحة التحكم</h1>
            <p className="subtitle">إدارة كاملة لنظام الشركات والفواتير والعملاء والمخزون والمهام</p>
          </div>
          <div className="user-info">
            <div className="avatar">
              {currentUser?.email?.charAt(0).toUpperCase() || 'A'}
            </div>
            <span>{currentUser?.email}</span>
            <span className="role-badge">
              <i className="fas fa-shield-alt"></i> {userRole === 'super_admin' ? 'مدير النظام' : 'مستخدم'}
            </span>
            <button onClick={handleLogout} className="btn-danger" style={{ marginRight: '8px' }}>
              <i className="fas fa-sign-out-alt"></i> خروج
            </button>
          </div>
        </div>

        <div className="grid-3">
          {/* بطاقة الشركات */}
          <div className="card">
            <div>
              <span className="card-icon"><i className="fas fa-building" style={{ color: '#4f46e5' }}></i></span>
              <h3>إدارة الشركات</h3>
              <p>إضافة، عرض، وتعديل الشركات المسجلة في النظام</p>
            </div>
            <button 
              onClick={() => navigate('/companies')} 
              className="btn-primary"
            >
              <i className="fas fa-arrow-left"></i> اذهب إلى الشركات
            </button>
          </div>

          {/* بطاقة العملاء */}
          <div className="card">
            <div>
              <span className="card-icon"><i className="fas fa-user-friends" style={{ color: '#10b981' }}></i></span>
              <h3>إدارة العملاء</h3>
              <p>إدارة عملاء الشركات وإضافة عملاء جدد</p>
            </div>
            <button 
              onClick={() => navigate('/clients')} 
              className="btn-primary"
            >
              <i className="fas fa-arrow-left"></i> اذهب إلى العملاء
            </button>
          </div>

          {/* بطاقة الفواتير */}
          <div className="card">
            <div>
              <span className="card-icon"><i className="fas fa-file-invoice" style={{ color: '#f59e0b' }}></i></span>
              <h3>إدارة الفواتير</h3>
              <p>إنشاء وعرض وتتبع الفواتير المالية</p>
            </div>
            <button 
              onClick={() => navigate('/invoices')} 
              className="btn-primary"
            >
              <i className="fas fa-arrow-left"></i> اذهب إلى الفواتير
            </button>
          </div>

          {/* بطاقة المخزون */}
          <div className="card">
            <div>
              <span className="card-icon"><i className="fas fa-boxes" style={{ color: '#8b5cf6' }}></i></span>
              <h3>إدارة المخزون</h3>
              <p>تتبع المنتجات والكميات والأسعار</p>
            </div>
            <button 
              onClick={() => navigate('/inventory')} 
              className="btn-primary"
            >
              <i className="fas fa-arrow-left"></i> اذهب إلى المخزون
            </button>
          </div>

          {/* بطاقة المهام */}
          <div className="card">
            <div>
              <span className="card-icon"><i className="fas fa-tasks" style={{ color: '#ec4899' }}></i></span>
              <h3>إدارة المهام</h3>
              <p>توزيع ومتابعة المهام على الموظفين</p>
            </div>
            <button 
              onClick={() => navigate('/tasks')} 
              className="btn-primary"
            >
              <i className="fas fa-arrow-left"></i> اذهب إلى المهام
            </button>
          </div>

          {/* بطاقة التقارير */}
          <div className="card">
            <div>
              <span className="card-icon"><i className="fas fa-chart-pie" style={{ color: '#06b6d4' }}></i></span>
              <h3>التقارير والإحصائيات</h3>
              <p>عرض إحصائيات شاملة عن النظام</p>
            </div>
            <button 
              onClick={() => navigate('/reports')} 
              className="btn-primary"
            >
              <i className="fas fa-arrow-left"></i> اذهب إلى التقارير
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}