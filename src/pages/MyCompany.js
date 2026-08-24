// src/pages/MyCompany.js - مع دعم الترجمة وكودين
import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { generateInviteCode } from '../utils/companyQuery';
import Sidebar from '../components/common/Sidebar';
import { useLanguage } from '../i18n/LanguageContext';

const SUBSCRIPTION_LABELS = {
  trial: 'trial',
  active: 'active',
  expired: 'expired',
  cancelled: 'cancelled',
};

export default function MyCompany() {
  const { t } = useLanguage();
  const { userCompanyId, userRole } = useAuth();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState({ admin: false, user: false });
  const [regenerating, setRegenerating] = useState({ admin: false, user: false });
  const [error, setError] = useState('');

  const fetchAndEnsureCode = useCallback(async () => {
    if (!userCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const companyRef = doc(db, 'companies', userCompanyId);
      const snap = await getDoc(companyRef);
      if (!snap.exists()) {
        setError(t('mc.notFound'));
        setLoading(false);
        return;
      }
      const data = snap.data();
      
      // التأكد من وجود الكودين
      let updates = {};
      if (!data.adminInviteCode) {
        updates.adminInviteCode = generateInviteCode('ADMIN_' + (data.name || ''));
      }
      if (!data.userInviteCode) {
        updates.userInviteCode = generateInviteCode('USER_' + (data.name || ''));
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(companyRef, updates);
        setCompany({ id: snap.id, ...data, ...updates });
      } else {
        setCompany({ id: snap.id, ...data });
      }
    } catch (err) {
      console.error('Error fetching company:', err);
      setError(t('mc.fetchErr'));
    } finally {
      setLoading(false);
    }
  }, [userCompanyId, t]);

  useEffect(() => {
    fetchAndEnsureCode();
  }, [fetchAndEnsureCode]);

  async function handleRegenerate(type) {
    if (!userCompanyId) return;
    setRegenerating(prev => ({ ...prev, [type]: true }));
    try {
      const prefix = type === 'admin' ? 'ADMIN_' : 'USER_';
      const newCode = generateInviteCode(prefix + (company?.name || ''));
      const companyRef = doc(db, 'companies', userCompanyId);
      const field = type === 'admin' ? 'adminInviteCode' : 'userInviteCode';
      await updateDoc(companyRef, { [field]: newCode });
      setCompany((prev) => ({ ...prev, [field]: newCode }));
    } catch (err) {
      console.error('Error regenerating code:', err);
      setError(t('mc.regenErr'));
    } finally {
      setRegenerating(prev => ({ ...prev, [type]: false }));
    }
  }

  async function handleCopy(type) {
    const code = type === 'admin' ? company?.adminInviteCode : company?.userInviteCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(prev => ({ ...prev, [type]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [type]: false })), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(prev => ({ ...prev, [type]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [type]: false })), 2000);
    }
  }

  // ✅ التحقق من أن المستخدم Admin عشان يشوف قسم الأكواد
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  const subscriptionStatus = company?.subscription?.status || 'trial';
  const statusLabel = t(`status.${SUBSCRIPTION_LABELS[subscriptionStatus] || subscriptionStatus}`) || subscriptionStatus;

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{t('mc.title')}</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
              {t('mc.subtitle')}
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 20,
            color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, marginBottom: 12 }}></i>
            <p>{t('mc.loading')}</p>
          </div>
        ) : company ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Company Info Card */}
            <div className="card" style={{ padding: '24px 28px' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>
                <i className="fas fa-building" style={{ marginLeft: 8, color: '#6366f1' }}></i>
                {t('mc.title')}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{t('mc.name')}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                    {company.name || '—'}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{t('common.email')}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#334155', wordBreak: 'break-all' }}>
                    {company.email || '—'}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{t('mc.status')}</div>
                  <div>
                    <span className="badge" style={{
                      background: `${company.subscription?.status === 'active' ? '#10b981' : company.subscription?.status === 'trial' ? '#f59e0b' : '#ef4444'}22`,
                      color: company.subscription?.status === 'active' ? '#10b981' : company.subscription?.status === 'trial' ? '#f59e0b' : '#ef4444',
                      border: `1px solid ${company.subscription?.status === 'active' ? '#10b981' : company.subscription?.status === 'trial' ? '#f59e0b' : '#ef4444'}44`,
                      borderRadius: 8,
                      padding: '4px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                    }}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ Invite Codes - يظهر فقط للأدمن */}
            {isAdmin && (
              <>
                {/* Admin Code */}
                <div className="card" style={{
                  padding: '24px 28px',
                  border: '2px solid rgba(245,158,11,0.3)',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.05) 0%, rgba(245,158,11,0.02) 100%)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#475569' }}>
                      <i className="fas fa-crown" style={{ color: '#f59e0b', marginLeft: 8 }}></i>
                      كود المدير (Admin)
                    </h3>
                    <span className="badge" style={{
                      background: '#fef3c7',
                      color: '#d97706',
                      padding: '2px 12px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                    }}>
                      صلاحيات كاملة
                    </span>
                  </div>
                  <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                    استخدم هذا الكود لدعوة مديرين جدد للشركة (يتمتعون بصلاحيات كاملة)
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{
                      background: 'rgba(245,158,11,0.1)',
                      border: '2px solid rgba(245,158,11,0.3)',
                      borderRadius: 10,
                      padding: '10px 20px',
                      flex: '0 0 auto',
                    }}>
                      <span style={{
                        fontSize: 24,
                        fontFamily: '"Courier New", Courier, monospace',
                        fontWeight: 700,
                        letterSpacing: 4,
                        color: '#d97706',
                      }}>
                        {company.adminInviteCode || 'لم يتم التوليد'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy('admin')}
                      className="btn-secondary btn-sm"
                      style={{ padding: '8px 16px' }}
                    >
                      <i className={copied.admin ? 'fas fa-check' : 'fas fa-copy'}></i>
                      {copied.admin ? t('common.copied') : t('co.copyCode')}
                    </button>
                    <button
                      onClick={() => handleRegenerate('admin')}
                      className="btn-primary btn-sm"
                      disabled={regenerating.admin}
                      style={{ padding: '8px 16px' }}
                    >
                      <i className={`fas fa-sync-alt ${regenerating.admin ? 'fa-spin' : ''}`}></i>
                      {regenerating.admin ? t('mc.regening') : t('mc.regen')}
                    </button>
                  </div>
                </div>

                {/* User Code */}
                <div className="card" style={{
                  padding: '24px 28px',
                  border: '2px solid rgba(16,185,129,0.3)',
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.02) 100%)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#475569' }}>
                      <i className="fas fa-user" style={{ color: '#10b981', marginLeft: 8 }}></i>
                      كود الموظف (User)
                    </h3>
                    <span className="badge" style={{
                      background: '#d1fae5',
                      color: '#059669',
                      padding: '2px 12px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                    }}>
                      صلاحيات محدودة
                    </span>
                  </div>
                  <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                    استخدم هذا الكود لدعوة موظفين جدد (يتمتعون بصلاحيات محدودة - قراءة وإضافة فقط)
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{
                      background: 'rgba(16,185,129,0.1)',
                      border: '2px solid rgba(16,185,129,0.3)',
                      borderRadius: 10,
                      padding: '10px 20px',
                      flex: '0 0 auto',
                    }}>
                      <span style={{
                        fontSize: 24,
                        fontFamily: '"Courier New", Courier, monospace',
                        fontWeight: 700,
                        letterSpacing: 4,
                        color: '#059669',
                      }}>
                        {company.userInviteCode || 'لم يتم التوليد'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy('user')}
                      className="btn-secondary btn-sm"
                      style={{ padding: '8px 16px' }}
                    >
                      <i className={copied.user ? 'fas fa-check' : 'fas fa-copy'}></i>
                      {copied.user ? t('common.copied') : t('co.copyCode')}
                    </button>
                    <button
                      onClick={() => handleRegenerate('user')}
                      className="btn-primary btn-sm"
                      disabled={regenerating.user}
                      style={{ padding: '8px 16px' }}
                    >
                      <i className={`fas fa-sync-alt ${regenerating.user ? 'fa-spin' : ''}`}></i>
                      {regenerating.user ? t('mc.regening') : t('mc.regen')}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* إذا كان المستخدم مش Admin يعرض رسالة */}
            {!isAdmin && (
              <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <i className="fas fa-lock" style={{ fontSize: 40, color: '#94a3b8', marginBottom: 12 }}></i>
                <h3 style={{ color: '#64748b' }}>ليس لديك صلاحية لعرض أكواد الدعوة</h3>
                <p style={{ color: '#94a3b8', fontSize: 14 }}>هذه الصفحة متاحة للمديرين فقط</p>
              </div>
            )}

          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <i className="fas fa-building" style={{ fontSize: 40, marginBottom: 12 }}></i>
            <p>{t('mc.notFound')}</p>
          </div>
        )}
      </div>
    </div>
  );
}