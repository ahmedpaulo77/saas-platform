// src/pages/Setup.js - إكمال بيانات الشركة مع دعم الترجمة
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { generateInviteCode } from '../utils/companyQuery';
import { useLanguage } from '../i18n/LanguageContext';

export default function Setup() {
  const { t } = useLanguage();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!companyName.trim()) return;
    setLoading(true);
    setError('');

    try {
      const companyRef = await addDoc(collection(db, 'companies'), {
        name: companyName.trim(),
        email: currentUser.email,
        industry: industry,
        adminInviteCode: generateInviteCode('ADM'),
        userInviteCode: generateInviteCode('USR'),
        createdAt: new Date().toISOString(),
        isActive: true,
      });

      await updateDoc(doc(db, 'users', currentUser.uid), {
        companyId: companyRef.id,
        role: 'admin',
      });

      navigate('/dashboard');
    } catch (e) {
      console.error(e);
      setError(t('setup.error'));
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <div className="login-logo">
          <div className="logo-icon">
            <i className="fas fa-building"></i>
          </div>
          <h1>{t('setup.hello')}</h1>
          <p>{t('setup.subtitle')}</p>
        </div>

        {error && (
          <div className="login-error">
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label>{t('setup.company')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={t('setup.companyPh')}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                autoFocus
                style={{ paddingRight: 42 }}
              />
              <i className="fas fa-building" style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.3)', fontSize: 14,
              }}></i>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label>{t('setup.industry')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { value: 'general', label: t('industry.general'), icon: 'fas fa-building' },
                { value: 'trader', label: t('industry.trader'), icon: 'fas fa-box-open' },
                { value: 'contractor', label: t('industry.contractor'), icon: 'fas fa-hard-hat' },
                { value: 'real_estate', label: t('industry.real_estate'), icon: 'fas fa-home' },
                { value: 'services', label: t('industry.services'), icon: 'fas fa-briefcase' },
                { value: 'super_market', label: t('industry.super_market'), icon: 'fas fa-store' },
                { value: 'pharmacy', label: t('industry.pharmacy'), icon: 'fas fa-pills' },
                { value: 'restaurant', label: t('industry.restaurant'), icon: 'fas fa-utensils' },
                { value: 'clothing', label: t('industry.clothing'), icon: 'fas fa-tshirt' },
                { value: 'clinic', label: t('industry.clinic'), icon: 'fas fa-user-md' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIndustry(opt.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 12px',
                    borderRadius: 12,
                    border: industry === opt.value
                      ? '2px solid #10b981'
                      : '1px solid rgba(255,255,255,0.12)',
                    background: industry === opt.value
                      ? 'rgba(16,185,129,0.15)'
                      : 'rgba(255,255,255,0.07)',
                    color: 'white',
                    fontSize: 13,
                    fontFamily: 'Cairo, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'right',
                  }}
                >
                  <span style={{
                    fontSize: 18,
                    color: industry === opt.value ? '#10b981' : 'rgba(255,255,255,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    <i className={opt.icon}></i>
                  </span>
                  <span style={{ fontWeight: industry === opt.value ? 700 : 500 }}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
            <small style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, display: 'block', marginTop: 8 }}>
              {t('setup.industryHint')}
            </small>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin" style={{ marginLeft: 8 }}></i>{t('setup.creating')}
              </>
            ) : (
              <>
                <i className="fas fa-arrow-left" style={{ marginLeft: 8 }}></i>{t('setup.start')}
              </>
            )}
          </button>
        </form>

        <div style={{
          marginTop: 24, textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20,
        }}>
          <button onClick={async () => { await logout(); navigate('/login'); }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.3)', fontSize: 13,
            fontFamily: 'Cairo', textDecoration: 'underline',
          }}>
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}