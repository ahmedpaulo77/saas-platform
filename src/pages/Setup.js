// src/pages/Setup.js - إكمال بيانات الشركة مع دعم الترجمة
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { createCompanyInviteCodes } from '../utils/companyQuery';
import { INDUSTRIES } from '../utils/modules';
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
      // ⚠️ الـ payload لازم يطابق allowlist الـ companies create بالظبط:
      //    ['name','email','industry','createdAt','isActive','creatorUid']
      //    الكود القديم كان بيكتب adminInviteCode/userInviteCode (مش في
      //    الـ allowlist) وبي omit الـ creatorUid (مطلوب) => permission-denied
      //    مضمون، والمستخدم يفضل محبوس في /setup.
      const companyRef = await addDoc(collection(db, 'companies'), {
        name: companyName.trim(),
        email: currentUser.email,
        industry: industry,
        createdAt: new Date().toISOString(),
        isActive: true,
        creatorUid: currentUser.uid,
      });

      // أكواد الدعوة في السبل-كولكشن — نفس المصدر اللي بيقراه Signup.js
      await createCompanyInviteCodes(companyRef.id);

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
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => setIndustry(ind.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 12px',
                    borderRadius: 12,
                  border: industry === ind.id
                    ? '2px solid #10b981'
                    : '1px solid rgba(255,255,255,0.12)',
                  background: industry === ind.id
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
                  color: industry === ind.id ? '#10b981' : 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  {ind.icon}
                </span>
                  <span style={{ fontWeight: industry === ind.id ? 700 : 500 }}>
                    {t(ind.labelKey)}
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