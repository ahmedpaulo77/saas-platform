// src/pages/About.js - تصميم احترافي
import React from 'react';
import Sidebar from '../components/common/Sidebar';

const features = [
  { icon: 'fas fa-building', color: '#6366f1', bg: '#eef2ff', title: 'إدارة الشركات', desc: 'إضافة وإدارة الشركات مع نظام اشتراكات متكامل' },
  { icon: 'fas fa-user-friends', color: '#10b981', bg: '#d1fae5', title: 'إدارة العملاء', desc: 'قاعدة بيانات كاملة للعملاء مع ربطهم بالشركات' },
  { icon: 'fas fa-file-invoice', color: '#f59e0b', bg: '#fef3c7', title: 'الفواتير + PDF', desc: 'إنشاء فواتير احترافية وتصديرها كـ PDF' },
  { icon: 'fas fa-boxes', color: '#8b5cf6', bg: '#f3e8ff', title: 'إدارة المخزون', desc: 'تتبع المنتجات مع تحديث تلقائي عند كل فاتورة' },
  { icon: 'fas fa-tasks', color: '#ec4899', bg: '#fdf2f8', title: 'إدارة المهام', desc: 'توزيع المهام وتتبعها بالأولويات والمواعيد' },
  { icon: 'fas fa-chart-pie', color: '#06b6d4', bg: '#ecfeff', title: 'التقارير', desc: 'إحصائيات شاملة وتصدير Excel لكل البيانات' },
  { icon: 'fas fa-bell', color: '#f97316', bg: '#fff7ed', title: 'الإشعارات الذكية', desc: 'تنبيهات تلقائية للمخزون والفواتير والمهام' },
  { icon: 'fas fa-crown', color: '#eab308', bg: '#fefce8', title: 'نظام الاشتراكات', desc: 'باقات مرنة مع دعم Stripe للدفع الآمن' },
  { icon: 'fas fa-shield-alt', color: '#14b8a6', bg: '#f0fdfa', title: 'أمان متقدم', desc: 'Firebase Auth مع صلاحيات متعددة المستويات' },
];

export default function About() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">

        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: '48px 40px',
          marginBottom: 28,
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -60, left: -60, width: 240, height: 240,
            background: 'radial-gradient(circle,rgba(99,102,241,0.2) 0%,transparent 70%)',
            borderRadius: '50%',
          }}></div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              width: 64, height: 64, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              borderRadius: 16, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 28, color: 'white',
              marginBottom: 20, boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
            }}>
              <i className="fas fa-cube"></i>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, letterSpacing: -1 }}>
              SaaS PRO
            </h1>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)', maxWidth: 500, lineHeight: 1.7 }}>
              منصة إدارة الأعمال المتكاملة — صُممت خصيصاً للشركات العربية الصغيرة والمتوسطة
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)' }}>
                v1.0.0
              </span>
              <span className="badge" style={{ background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }}>
                <i className="fas fa-circle" style={{ fontSize: 7, marginLeft: 4 }}></i>
                مستقر
              </span>
              <span className="badge" style={{ background: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' }}>
                <i className="fas fa-language" style={{ marginLeft: 4 }}></i>
                عربي RTL
              </span>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div style={{ marginBottom: 16 }}>
          <div className="section-title">
            <i className="fas fa-star"></i> مميزات المنصة
          </div>
        </div>
        <div className="grid-3">
          {features.map(f => (
            <div key={f.title} className="card hoverable">
              <div className="card-icon" style={{ background: f.bg, color: f.color, width: 48, height: 48 }}>
                <i className={f.icon}></i>
              </div>
              <h3 style={{ marginBottom: 6 }}>{f.title}</h3>
              <p style={{ fontSize: 13 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="card" style={{ marginTop: 8 }}>
          <h3 style={{ marginBottom: 16 }}>
            <i className="fas fa-headset" style={{ color: '#6366f1' }}></i>
            التواصل والدعم
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
            {[
              { icon: 'fas fa-envelope', label: 'البريد الإلكتروني', value: 'p638599@gmail.com', color: '#6366f1' },
              { icon: 'fas fa-phone', label: 'الهاتف', value: '01220811060', color: '#10b981' },
            ].map(c => (
              <div key={c.label} style={{
                display: 'flex', gap: 12, alignItems: 'center',
                padding: '12px 16px', background: 'var(--gray-50)',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--gray-200)'
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8,
                  background: c.color + '15', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: c.color, fontSize: 16, flexShrink: 0
                }}>
                  <i className={c.icon}></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600 }}>{c.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-700)' }}>{c.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}