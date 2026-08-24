// src/pages/MyCompany.js - مع دعم الترجمة
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
  const { userCompanyId } = useAuth();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
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
      if (!data.inviteCode) {
        const newCode = generateInviteCode(data.name || '');
        await updateDoc(companyRef, { inviteCode: newCode });
        setCompany({ id: snap.id, ...data, inviteCode: newCode });
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

  async function handleRegenerate() {
    if (!userCompanyId) return;
    setRegenerating(true);
    try {
      const newCode = generateInviteCode(company?.name || '');
      const companyRef = doc(db, 'companies', userCompanyId);
      await updateDoc(companyRef, { inviteCode: newCode });
      setCompany((prev) => ({ ...prev, inviteCode: newCode }));
    } catch (err) {
      console.error('Error regenerating code:', err);
      setError(t('mc.regenErr'));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopy() {
    if (!company?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(company.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = company.inviteCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

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

            {/* Invite Code Card */}
            <div className="card" style={{
              padding: '28px 32px',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%)',
              border: '1px solid rgba(99,102,241,0.25)',
            }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>
                <i className="fas fa-key" style={{ marginLeft: 8, color: '#6366f1' }}></i>
                {t('co.invite')}
              </h2>
              <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 13 }}>
                شارك هذا الكود مع أي شخص تريده للانضمام لشركتك
              </p>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                flexWrap: 'wrap',
              }}>
                <div style={{
                  background: 'rgba(99,102,241,0.1)',
                  border: '2px solid rgba(99,102,241,0.4)',
                  borderRadius: 14,
                  padding: '14px 28px',
                  display: 'flex', alignItems: 'center', gap: 16,
                  flex: '0 0 auto',
                }}>
                  <span style={{
                    fontSize: 28,
                    fontFamily: '"Courier New", Courier, monospace',
                    fontWeight: 800,
                    letterSpacing: 6,
                    color: '#4f46e5',
                    userSelect: 'all',
                  }}>
                    {company.inviteCode}
                  </span>
                </div>

                <button
                  className="btn-primary"
                  onClick={handleCopy}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 20px', fontSize: 14,
                    background: copied ? 'rgba(16,185,129,0.15)' : undefined,
                    border: copied ? '1px solid rgba(16,185,129,0.5)' : undefined,
                    color: copied ? '#047857' : undefined,
                    transition: 'all 0.2s',
                  }}
                >
                  <i className={copied ? 'fas fa-check' : 'fas fa-copy'}></i>
                  {copied ? t('common.copied') : t('co.copyCode')}
                </button>

                <button
                  className="btn-secondary"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', fontSize: 14 }}
                >
                  <i className={`fas fa-sync-alt ${regenerating ? 'fa-spin' : ''}`}></i>
                  {regenerating ? t('mc.regening') : t('mc.regen')}
                </button>
              </div>

              <p style={{ margin: '20px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                <i className="fas fa-info-circle" style={{ marginLeft: 6, color: '#6366f1' }}></i>
                عند توليد كود جديد، الكود القديم يصبح غير صالح. تأكد من مشاركة الكود الجديد مع من تريد.
              </p>
            </div>

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