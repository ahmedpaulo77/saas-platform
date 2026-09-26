// src/pages/MyCompany.js - مع دعم الترجمة وكودين
import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { getCompanyInviteCodes, regenerateCompanyInviteCode } from '../utils/companyQuery';
import Sidebar from '../components/common/Sidebar';
import { useLanguage } from '../i18n/LanguageContext';

export default function MyCompany() {
  const { t } = useLanguage();
  const { userCompanyId, userRole } = useAuth();
  const [company, setCompany] = useState(null);
  const [codes, setCodes] = useState({ adminCode: '', userCode: '' });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState({ admin: false, user: false });
  const [regenerating, setRegenerating] = useState({ admin: false, user: false });
  const [error, setError] = useState('');

  // ✅ التحقق من أن المستخدم Admin عشان يشوف قسم الأكواد
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  const fetchCompanyAndCodes = useCallback(async () => {
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
      setCompany({ id: snap.id, ...snap.data() });

      // الأكواد في السبل-كولكشن companies/{id}/codes/current
      // (المصدر الرسمي للتحقق هو invite_codes — انظر utils/companyQuery.js)
      if (isAdmin) {
        try {
          const c = await getCompanyInviteCodes(userCompanyId);
          setCodes({ adminCode: c.adminCode, userCode: c.userCode });
        } catch (e) {
          console.error('Error loading invite codes:', e);
          setError(t('mc.fetchErr'));
        }
      }
    } catch (err) {
      console.error('Error fetching company:', err);
      setError(t('mc.fetchErr'));
    } finally {
      setLoading(false);
    }
  }, [userCompanyId, isAdmin, t]);

  useEffect(() => {
    fetchCompanyAndCodes();
  }, [fetchCompanyAndCodes]);

  async function handleRegenerate(type) {
    if (!userCompanyId) return;
    const role = type === 'admin' ? 'admin' : 'user';
    if (!window.confirm(t('mc.regenConfirm'))) return;
    setRegenerating(prev => ({ ...prev, [type]: true }));
    setError('');
    try {
      const newCode = await regenerateCompanyInviteCode(userCompanyId, role);
      setCodes(prev => ({ ...prev, [type === 'admin' ? 'adminCode' : 'userCode']: newCode }));
      alert(t('mc.regenOk'));
    } catch (err) {
      console.error('Error regenerating code:', err);
      setError(t('mc.regenErr'));
    } finally {
      setRegenerating(prev => ({ ...prev, [type]: false }));
    }
  }

  async function handleCopy(type) {
    const code = type === 'admin' ? codes.adminCode : codes.userCode;
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


  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{t('mc.myTitle')}</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
              {t('mc.mySubtitle')}
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
                {t('mc.myTitle')}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{t('mc.companyName')}</div>
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
                      background: `${company.isActive ? '#10b981' : '#ef4444'}22`,
                      color: company.isActive ? '#10b981' : '#ef4444',
                      border: `1px solid ${company.isActive ? '#10b981' : '#ef4444'}44`,
                      borderRadius: 8,
                      padding: '4px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                    }}>
                      {company.isActive ? t('status.active') : t('status.expired')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ دعوة - يظهر فقط للأدمن */}
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
                        {codes.adminCode || t('mc.notGenerated')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy('admin')}
                      className="btn-secondary btn-sm"
                      disabled={!codes.adminCode}
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
                        {codes.userCode || t('mc.notGenerated')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy('user')}
                      className="btn-secondary btn-sm"
                      disabled={!codes.userCode}
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