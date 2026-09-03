// src/pages/About.js - بيانات التواصل قابلة للتخصيص من سجل الشركة
import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/common/Sidebar';
import { useLanguage } from '../i18n/LanguageContext';

const featuresKeys = [
  { icon: 'fas fa-building', color: '#6366f1', bg: '#eef2ff', titleKey: 'ab.f1.t', descKey: 'ab.f1.d' },
  { icon: 'fas fa-user-friends', color: '#10b981', bg: '#d1fae5', titleKey: 'ab.f2.t', descKey: 'ab.f2.d' },
  { icon: 'fas fa-file-invoice', color: '#f59e0b', bg: '#fef3c7', titleKey: 'ab.f3.t', descKey: 'ab.f3.d' },
  { icon: 'fas fa-boxes', color: '#8b5cf6', bg: '#f3e8ff', titleKey: 'ab.f4.t', descKey: 'ab.f4.d' },
  { icon: 'fas fa-tasks', color: '#ec4899', bg: '#fdf2f8', titleKey: 'ab.f5.t', descKey: 'ab.f5.d' },
  { icon: 'fas fa-chart-pie', color: '#06b6d4', bg: '#ecfeff', titleKey: 'ab.f6.t', descKey: 'ab.f6.d' },
  { icon: 'fas fa-bell', color: '#f97316', bg: '#fff7ed', titleKey: 'ab.f7.t', descKey: 'ab.f7.d' },
  { icon: 'fas fa-crown', color: '#eab308', bg: '#fefce8', titleKey: 'ab.f8.t', descKey: 'ab.f8.d' },
  { icon: 'fas fa-shield-alt', color: '#14b8a6', bg: '#f0fdfa', titleKey: 'ab.f9.t', descKey: 'ab.f9.d' },
];

export default function About() {
  const { t } = useLanguage();
  const { userCompanyId } = useAuth();
  const [contact, setContact] = useState({ email: '', phone: '', name: '' });

  useEffect(() => {
    let active = true;
    async function loadContact() {
      if (!userCompanyId) return;
      try {
        const snap = await getDoc(doc(db, 'companies', userCompanyId));
        if (active && snap.exists()) {
          const d = snap.data();
          setContact({
            email: d.contactEmail || '',
            phone: d.contactPhone || '',
            name: d.contactName || '',
          });
        }
      } catch (err) {
        console.error('Error loading contact info:', err);
      }
    }
    loadContact();
    return () => { active = false; };
  }, [userCompanyId]);

  const contactItems = [
    { icon: 'fas fa-envelope', labelKey: 'ab.email', value: contact.email || '', color: '#6366f1' },
    { icon: 'fas fa-phone', labelKey: 'ab.phone', value: contact.phone || '', color: '#10b981' },
  ];

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
              {t('ab.desc')}
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)' }}>
                v1.0.0
              </span>
              <span className="badge" style={{ background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }}>
                <i className="fas fa-circle" style={{ fontSize: 7, marginLeft: 4 }}></i>
                {t('ab.stable')}
              </span>
              <span className="badge" style={{ background: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' }}>
                <i className="fas fa-language" style={{ marginLeft: 4 }}></i>
                {t('ab.langBadge')}
              </span>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div style={{ marginBottom: 16 }}>
          <div className="section-title">
            <i className="fas fa-star"></i> {t('ab.features')}
          </div>
        </div>
        <div className="grid-3">
          {featuresKeys.map(f => (
            <div key={f.titleKey} className="card hoverable">
              <div className="card-icon" style={{ background: f.bg, color: f.color, width: 48, height: 48 }}>
                <i className={f.icon}></i>
              </div>
              <h3 style={{ marginBottom: 6 }}>{t(f.titleKey)}</h3>
              <p style={{ fontSize: 13 }}>{t(f.descKey)}</p>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="card" style={{ marginTop: 8 }}>
          <h3 style={{ marginBottom: 16 }}>
            <i className="fas fa-headset" style={{ color: '#6366f1' }}></i>
            {t('ab.contact')}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
            {contactItems.map(c => (
              <div key={c.labelKey} style={{
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
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600 }}>{t(c.labelKey)}</div>
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