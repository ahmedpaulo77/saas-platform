// src/components/common/Sidebar.js - بأيقونات Font Awesome
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar() {
  const { userRole, logout } = useAuth();
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
    <div className="sidebar">
      <div className="logo">
        <i className="fas fa-cube" style={{ color: '#4f46e5' }}></i>
        SaaS
        <span>PRO</span>
      </div>
      <nav>
        <Link to="/dashboard">
          <span className="icon"><i className="fas fa-th-large"></i></span>
          الرئيسية
        </Link>
        <Link to="/companies">
          <span className="icon"><i className="fas fa-building"></i></span>
          الشركات
        </Link>
        <Link to="/clients">
          <span className="icon"><i className="fas fa-user-friends"></i></span>
          العملاء
        </Link>
        <Link to="/invoices">
          <span className="icon"><i className="fas fa-file-invoice"></i></span>
          الفواتير
        </Link>
        <Link to="/inventory">
          <span className="icon"><i className="fas fa-boxes"></i></span>
          المخزون
        </Link>
        <Link to="/tasks">
          <span className="icon"><i className="fas fa-tasks"></i></span>
          المهام
        </Link>
        <Link to="/reports">
          <span className="icon"><i className="fas fa-chart-pie"></i></span>
          التقارير
        </Link>
        <Link to="/profile">
          <span className="icon"><i className="fas fa-user"></i></span>
          الملف الشخصي
        </Link>
        {userRole === 'super_admin' && (
          <Link to="/admin">
            <span className="icon"><i className="fas fa-crown"></i></span>
            الأدمن
          </Link>
        )}
      </nav>
      <button onClick={handleLogout} className="logout-btn">
        <i className="fas fa-sign-out-alt"></i>
        تسجيل خروج
      </button>
    </div>
  );
}