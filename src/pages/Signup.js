// src/pages/Signup.js - مع دعم كودين (Admin + User) وأنواع الشركات الجديدة
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { generateInviteCode } from '../utils/companyQuery';
import { INDUSTRIES } from '../utils/modules';
import { useLanguage } from '../i18n/LanguageContext';

export default function Signup() {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    companyName: '',
    industry: 'general',
    email: '',
    password: '',
    confirmPassword: '',
    inviteCode: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError(t('signup.mismatch'));
      return;
    }

    if (formData.password.length < 6) {
      setError(t('signup.shortPass'));
      return;
    }

    setLoading(true);

    try {
      let companyId = null;
      let role = 'admin';
      let joinCompanyName = '';

      if (formData.inviteCode.trim()) {
        const code = formData.inviteCode.trim().toUpperCase();
        
        // ✅ 1- جرب كود Admin أولاً
        let companiesSnap = await getDocs(
          query(collection(db, 'companies'), where('adminInviteCode', '==', code))
        );

        if (!companiesSnap.empty) {
          // ✅ ده كود Admin
          role = 'admin';
          const companyDoc = companiesSnap.docs[0];
          companyId = companyDoc.id;
          joinCompanyName = companyDoc.data().name || '';
        } else {
          // ✅ 2- جرب كود User
          companiesSnap = await getDocs(
            query(collection(db, 'companies'), where('userInviteCode', '==', code))
          );
          
          if (!companiesSnap.empty) {
            role = 'user';
            const companyDoc = companiesSnap.docs[0];
            companyId = companyDoc.id;
            joinCompanyName = companyDoc.data().name || '';
          } else {
            setError(t('signup.badCode'));
            setLoading(false);
            return;
          }
        }
      } else {
        // ✅ إنشاء شركة جديدة (أول مدير)
        const companyRef = await addDoc(collection(db, 'companies'), {
          name: formData.companyName,
          email: formData.email,
          industry: formData.industry,
          adminInviteCode: generateInviteCode('ADMIN_' + formData.companyName),
          userInviteCode: generateInviteCode('USER_' + formData.companyName),
          createdAt: new Date().toISOString(),
          isActive: true,
        });
        companyId = companyRef.id;
      }

      await signup(formData.email, formData.password, role, companyId);

      alert(role === 'admin'
        ? t('signup.okCreate') 
        : t('signup.okJoin', { name: joinCompanyName }));
      navigate('/dashboard');
    } catch (error) {
      console.error('Signup error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '480px' }}>
        <div className="login-logo">
          <div className="logo-icon">
            <i className="fas fa-cube"></i>
          </div>
          <h1>{t('signup.title')}</h1>
          <p>{t('signup.subtitle')}</p>
        </div>

        {error && (
          <div className="login-error">
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>{t('signup.invite')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={t('signup.invitePh')}
                value={formData.inviteCode}
                onChange={(e) => setFormData({ ...formData, inviteCode: e.target.value })}
                style={{ paddingRight: '42px' }}
              />
              <i className="fas fa-key" style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 14
              }}></i>
            </div>
            <small style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, display: 'block', marginTop: 4 }}>
              {t('signup.inviteHint')}
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>{t('signup.company')} {!formData.inviteCode && '*'}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={t('signup.companyPh')}
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                required={!formData.inviteCode}
                disabled={!!formData.inviteCode}
                style={{ paddingRight: '42px', opacity: formData.inviteCode ? 0.5 : 1 }}
              />
              <i className="fas fa-building" style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 14
              }}></i>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>{t('signup.industry')} {!formData.inviteCode && '*'}</label>
            <select
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              required={!formData.inviteCode}
              disabled={!!formData.inviteCode}
              style={{
                width: '100%',
                padding: '12px 42px 12px 12px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.07)',
                color: 'white',
                fontSize: 14,
                fontFamily: 'Cairo, sans-serif',
                outline: 'none',
                opacity: formData.inviteCode ? 0.5 : 1,
              }}
            >
              {INDUSTRIES.map((ind) => (
                <option key={ind.id} value={ind.id} style={{ color: '#1e293b' }}>
                  {ind.icon} {t(ind.labelKey)}
                </option>
              ))}
            </select>
            <small style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, display: 'block', marginTop: 4 }}>
              {t('signup.industryHint')}
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>{t('login.email')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                placeholder="example@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                style={{ paddingRight: '42px' }}
              />
              <i className="fas fa-envelope" style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 14
              }}></i>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>{t('login.password')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                placeholder="********"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength="6"
                style={{ paddingRight: '42px' }}
              />
              <i className="fas fa-lock" style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 14
              }}></i>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label>{t('signup.confirm')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                placeholder="********"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                style={{ paddingRight: '42px' }}
              />
              <i className="fas fa-check-circle" style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 14
              }}></i>
            </div>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin" style={{ marginLeft: 8 }}></i>
                {t('signup.creating')}
              </>
            ) : (
              <>
                <i className="fas fa-user-plus" style={{ marginLeft: 8 }}></i>
                {formData.inviteCode ? t('signup.join') : t('signup.create')}
              </>
            )}
          </button>
        </form>

        <div style={{
          marginTop: 28, textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          paddingTop: 20
        }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            {t('signup.hasAccount')} <Link to="/login" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: '600' }}>{t('login.submit')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}