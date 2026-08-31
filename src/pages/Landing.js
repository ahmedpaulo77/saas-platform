// src/pages/Landing.js - مع زر Login و Sign Up
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

const features = [
  { icon: 'fas fa-building',      color: '#6366f1', bg: '#eef2ff', titleKey: 'landing.f1.t', descKey: 'landing.f1.d' },
  { icon: 'fas fa-user-friends',  color: '#10b981', bg: '#d1fae5', titleKey: 'landing.f2.t', descKey: 'landing.f2.d' },
  { icon: 'fas fa-file-invoice',  color: '#f59e0b', bg: '#fef3c7', titleKey: 'landing.f3.t', descKey: 'landing.f3.d' },
  { icon: 'fas fa-boxes',         color: '#8b5cf6', bg: '#f3e8ff', titleKey: 'landing.f4.t', descKey: 'landing.f4.d' },
  { icon: 'fas fa-tasks',         color: '#ec4899', bg: '#fdf2f8', titleKey: 'landing.f5.t', descKey: 'landing.f5.d' },
  { icon: 'fas fa-chart-pie',     color: '#06b6d4', bg: '#ecfeff', titleKey: 'landing.f6.t', descKey: 'landing.f6.d' },
  { icon: 'fas fa-bell',          color: '#f97316', bg: '#fff7ed', titleKey: 'landing.f7.t', descKey: 'landing.f7.d' },
  { icon: 'fas fa-rocket',         color: '#eab308', bg: '#fefce8', titleKey: 'landing.f8.t', descKey: 'landing.f8.d' },
  { icon: 'fas fa-shield-alt',    color: '#14b8a6', bg: '#f0fdfa', titleKey: 'landing.f9.t', descKey: 'landing.f9.d' },
];

const stats = [
  { value: '500+', labelKey: 'landing.stat.companies' },
  { value: '50K+', labelKey: 'landing.stat.invoices' },
  { value: '99.9%', labelKey: 'landing.stat.uptime' },
  { value: '24/7', labelKey: 'landing.stat.support' },
];

export default function Landing() {
  const { t, lang, toggleLang } = useLanguage();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const nextLang = lang === 'ar' ? 'EN' : 'عربي';

  return (
    <div style={{ direction: 'rtl', fontFamily: 'Cairo, sans-serif', background: '#fff', overflowX: 'hidden' }}>

      {/* ── Navbar ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        padding: '0 5%',
        background: scrolled ? 'rgba(255,255,255,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid #e2e8f0' : 'none',
        transition: 'all 0.3s',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 72,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40,
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            borderRadius: 10, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'white', fontSize: 18,
          }}>
            <i className="fas fa-cube"></i>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: scrolled ? '#0f172a' : 'white' }}>
            SaaS <span style={{ color: '#6366f1' }}>PRO</span>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* زر تبديل اللغة */}
          <button
            onClick={toggleLang}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: scrolled ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.3)',
              background: scrolled ? 'white' : 'rgba(255,255,255,0.08)',
              cursor: 'pointer',
              fontFamily: 'Cairo',
              fontWeight: 600,
              fontSize: 13,
              color: scrolled ? '#334155' : 'white',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = scrolled ? '#f1f5f9' : 'rgba(255,255,255,0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = scrolled ? 'white' : 'rgba(255,255,255,0.08)';
            }}
          >
            <i className="fas fa-globe" style={{ fontSize: 14 }}></i>
            <span>{nextLang}</span>
          </button>

          {/* ✅ زرار Login */}
          <button 
            onClick={() => navigate('/login')} 
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: scrolled ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.3)',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: 'Cairo',
              fontWeight: 600,
              fontSize: 14,
              color: scrolled ? '#334155' : 'white',
              transition: 'all 0.2s',
            }}
          >
            {t('landing.ctaLogin')}
          </button>

          {/* ✅ ✅ ✅ زرار Sign Up */}
          <button 
            onClick={() => navigate('/signup')} 
            style={{
              padding: '8px 22px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              cursor: 'pointer',
              fontFamily: 'Cairo',
              fontWeight: 700,
              fontSize: 14,
              color: 'white',
              boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
              transition: 'transform 0.2s',
            }}
            onMouseOver={e => e.target.style.transform = 'scale(1.05)'}
            onMouseOut={e => e.target.style.transform = 'scale(1)'}
          >
            <i className="fas fa-user-plus" style={{ marginLeft: 8 }}></i>
            {t('signup.title')}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '100px 5% 60px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* BG circles */}
        {[
          { top: '-15%', right: '-10%', size: 500, color: 'rgba(99,102,241,0.12)' },
          { bottom: '-20%', left: '-5%',  size: 400, color: 'rgba(139,92,246,0.1)' },
        ].map((c, i) => (
          <div key={i} style={{
            position: 'absolute', width: c.size, height: c.size,
            background: `radial-gradient(circle,${c.color} 0%,transparent 70%)`,
            borderRadius: '50%', top: c.top, bottom: c.bottom, right: c.right, left: c.left,
            pointerEvents: 'none',
          }} />
        ))}

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 60, padding: '6px 18px', marginBottom: 28,
          }}>
            <i className="fas fa-star" style={{ color: '#fbbf24', fontSize: 12 }}></i>
            <span style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 600 }}>{t('landing.badge')}</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 68px)', fontWeight: 900,
            color: 'white', lineHeight: 1.15, marginBottom: 24,
            letterSpacing: '-1px',
          }}>
            {t('landing.hero1')}<br />
            <span style={{
              background: 'linear-gradient(135deg,#818cf8,#c084fc)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {t('landing.hero2')}
            </span>
          </h1>

          <p style={{
            fontSize: 18, color: 'rgba(255,255,255,0.6)',
            maxWidth: 580, margin: '0 auto 40px', lineHeight: 1.8,
          }}>
            {t('landing.heroDesc')}
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* ✅ Login */}
            <button 
              onClick={() => navigate('/login')} 
              style={{
                padding: '16px 40px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.06)',
                color: 'white',
                fontFamily: 'Cairo',
                fontWeight: 600,
                fontSize: 17,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            >
              <i className="fas fa-sign-in-alt" style={{ marginLeft: 10 }}></i>
              {t('landing.ctaLogin')}
            </button>

            {/* ✅ Sign Up */}
            <button 
              onClick={() => navigate('/signup')} 
              style={{
                padding: '16px 40px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: 'white',
                fontFamily: 'Cairo',
                fontWeight: 800,
                fontSize: 17,
                cursor: 'pointer',
                boxShadow: '0 8px 32px rgba(99,102,241,0.45)',
                transition: 'transform 0.2s',
              }}
              onMouseOver={e => e.target.style.transform = 'translateY(-2px)'}
              onMouseOut={e => e.target.style.transform = 'translateY(0)'}
            >
              <i className="fas fa-user-plus" style={{ marginLeft: 10 }}></i>
              {t('signup.title')}
            </button>
          </div>

          <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            <i className="fas fa-check-circle" style={{ color: '#10b981', marginLeft: 6 }}></i>
            {t('landing.trialNote')}
          </p>
        </div>
      </section>

      {/* ── Stats ── */}
      <section style={{
        background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
        padding: '48px 5%',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
          gap: 32, maxWidth: 900, margin: '0 auto', textAlign: 'center',
        }}>
          {stats.map(s => (
            <div key={s.labelKey}>
              <div style={{ fontSize: 36, fontWeight: 900, color: 'white', letterSpacing: -1 }}>{s.value}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{t(s.labelKey)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: '96px 5%', background: '#f8fafc' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <span style={{
              background: '#eef2ff', color: '#6366f1', padding: '4px 16px',
              borderRadius: 60, fontSize: 13, fontWeight: 700, display: 'inline-block', marginBottom: 16,
            }}>{t('landing.features')}</span>
            <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, color: '#0f172a', marginBottom: 14 }}>
              {t('landing.featuresTitle')}
            </h2>
            <p style={{ fontSize: 17, color: '#64748b', maxWidth: 520, margin: '0 auto' }}>
              {t('landing.featuresDesc')}
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
            gap: 24,
          }}>
            {features.map(f => (
              <div key={f.titleKey} style={{
                background: 'white', borderRadius: 16, padding: '28px 24px',
                border: '1px solid #e2e8f0', transition: 'all 0.3s',
                cursor: 'default',
              }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.08)'; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{
                  width: 52, height: 52, background: f.bg, color: f.color,
                  borderRadius: 12, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 22, marginBottom: 16,
                }}>
                  <i className={f.icon}></i>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t(f.titleKey)}</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>{t(f.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        padding: '96px 5%',
        background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 900, color: 'white', marginBottom: 16 }}>
            {t('landing.ctaTitle')}
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.6)', marginBottom: 36 }}>
            {t('landing.ctaDesc')}
          </p>
          <button 
            onClick={() => navigate('/signup')} 
            style={{
              padding: '18px 52px',
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: 'white',
              fontFamily: 'Cairo',
              fontWeight: 800,
              fontSize: 18,
              cursor: 'pointer',
              boxShadow: '0 8px 32px rgba(99,102,241,0.5)',
              transition: 'transform 0.2s',
            }}
            onMouseOver={e => e.target.style.transform = 'translateY(-3px)'}
            onMouseOut={e => e.target.style.transform = 'translateY(0)'}
          >
            <i className="fas fa-rocket" style={{ marginLeft: 12 }}></i>
            {t('signup.title')}
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            {t('landing.ctaFoot')}
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        background: '#0f172a', padding: '32px 5%',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: 16,
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            borderRadius: 8, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'white', fontSize: 15,
          }}>
            <i className="fas fa-cube"></i>
          </div>
          <span style={{ color: 'white', fontWeight: 700 }}>SaaS PRO</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          {t('landing.rights')}
        </p>
        <div style={{ display: 'flex', gap: 16 }}>
          {['fas fa-envelope','fab fa-twitter','fab fa-linkedin'].map(ic => (
            <i key={ic} className={ic} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, cursor: 'pointer' }}></i>
          ))}
        </div>
      </footer>

    </div>
  );
}