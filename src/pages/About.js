// src/pages/About.js - صفحة حول النظام
import React from 'react';
import Sidebar from '../components/common/Sidebar';

export default function About() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: '#333', marginBottom: '20px' }}>
          <i className="fas fa-info-circle" style={{ color: '#4f46e5' }}></i> حول النظام
        </h2>

        <div className="card" style={{ marginBottom: '30px' }}>
          <h3>📊 نظام إدارة الشركات (SaaS)</h3>
          <p style={{ color: '#64748b', lineHeight: '1.8' }}>
            نظام متكامل لإدارة الشركات والعملاء والفواتير والمخزون والمهام.
            صمم ليكون سهل الاستخدام ومناسب للشركات الصغيرة والمتوسطة.
          </p>
        </div>

        <div className="grid-3">
          <div className="card">
            <i className="fas fa-building" style={{ fontSize: '32px', color: '#4f46e5' }}></i>
            <h3>إدارة الشركات</h3>
            <p>إضافة، عرض، وتعديل الشركات المسجلة في النظام</p>
          </div>

          <div className="card">
            <i className="fas fa-user-friends" style={{ fontSize: '32px', color: '#10b981' }}></i>
            <h3>إدارة العملاء</h3>
            <p>إدارة عملاء الشركات وإضافة عملاء جدد</p>
          </div>

          <div className="card">
            <i className="fas fa-file-invoice" style={{ fontSize: '32px', color: '#f59e0b' }}></i>
            <h3>إدارة الفواتير</h3>
            <p>إنشاء وعرض وتتبع الفواتير المالية</p>
          </div>

          <div className="card">
            <i className="fas fa-boxes" style={{ fontSize: '32px', color: '#8b5cf6' }}></i>
            <h3>إدارة المخزون</h3>
            <p>تتبع المنتجات والكميات والأسعار</p>
          </div>

          <div className="card">
            <i className="fas fa-tasks" style={{ fontSize: '32px', color: '#ec4899' }}></i>
            <h3>إدارة المهام</h3>
            <p>توزيع ومتابعة المهام على الموظفين</p>
          </div>

          <div className="card">
            <i className="fas fa-chart-pie" style={{ fontSize: '32px', color: '#06b6d4' }}></i>
            <h3>التقارير والإحصائيات</h3>
            <p>عرض إحصائيات شاملة عن النظام</p>
          </div>
        </div>

        <div className="card" style={{ marginTop: '30px' }}>
          <h3>📞 اتصل بنا</h3>
          <p style={{ color: '#64748b' }}>
            <i className="fas fa-envelope"></i> البريد الإلكتروني: support@saas.com
          </p>
          <p style={{ color: '#64748b' }}>
            <i className="fas fa-phone"></i> الهاتف: 01234567890
          </p>
        </div>
      </div>
    </div>
  );
}