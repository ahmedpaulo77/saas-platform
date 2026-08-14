// src/pages/Subscription.js - نسخة مصححة (مع تحسين المظهر والنصوص)
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/common/Sidebar';

const PLANS = [
  {
    id: 'standard',
    name: 'Standard',
    nameAr: 'الباقة الكاملة',
    monthlyPrice: 500,
    yearlyPrice: 5000,
    color: '#6366f1',
    featured: true,
    description: 'كل المميزات — بدون قيود',
    features: [
      'مستخدمون غير محدودون',
      'عملاء غير محدودون',
      'فواتير + تصدير PDF',
      'إدارة مخزون كاملة',
      'إدارة المهام',
      'تقارير بيانية متقدمة',
      'تصدير Excel',
      'إشعارات ذكية',
      'دعم فني 24/7',
    ],
  },
];

export default function Subscription() {
  const { userCompanyId } = useAuth();
  const [billing, setBilling] = useState('monthly');
  const [currentPlan, setCurrentPlan] = useState(null);
  const [subStatus, setSubStatus] = useState('trial');
  const [subEndDate, setSubEndDate] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [fetching, setFetching] = useState(true);

  const fetchCurrentSubscription = useCallback(async () => {
    try {
      const companyRef = doc(db, 'companies', userCompanyId);
      const snap = await getDoc(companyRef);
      if (snap.exists()) {
        const data = snap.data();
        setCurrentPlan(data.subscription?.plan || null);
        setSubStatus(data.subscription?.status || 'trial');
        setSubEndDate(data.subscription?.endDate || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFetching(false);
    }
  }, [userCompanyId]);

  useEffect(() => {
    if (userCompanyId) fetchCurrentSubscription();
    else setFetching(false);
  }, [userCompanyId, fetchCurrentSubscription]);

  async function handleSubscribe(plan) {
    setLoadingPlan(plan.id);
    try {
      // Simulation (Demo)
      await new Promise(r => setTimeout(r, 1500));

      if (userCompanyId) {
        const companyRef = doc(db, 'companies', userCompanyId);
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + (billing === 'yearly' ? 12 : 1));

        await updateDoc(companyRef, {
          'subscription.plan': plan.id,
          'subscription.status': 'active',
          'subscription.billing': billing,
          'subscription.startDate': new Date().toISOString(),
          'subscription.endDate': endDate.toISOString(),
          'subscription.updatedAt': new Date().toISOString(),
        });

        setCurrentPlan(plan.id);
        setSubStatus('active');
        setSubEndDate(endDate.toISOString());
        alert(`✅ تم تفعيل باقة ${plan.nameAr} بنجاح!`);
      } else {
        alert('✅ سيتم تحويلك لـ Stripe لإتمام الدفع.\n\nباقة: ' + plan.nameAr + '\nالسعر: ' + (billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice) + ' ج.م/' + (billing === 'monthly' ? 'شهر' : 'سنة'));
      }
    } catch (e) {
      console.error(e);
      alert('حدث خطأ. حاول مرة أخرى.');
    } finally {
      setLoadingPlan(null);
    }
  }

  const activePlan = PLANS.find(p => p.id === currentPlan);
  const daysLeft = subEndDate
    ? Math.max(0, Math.ceil((new Date(subEndDate) - new Date()) / 86400000))
    : null;

  if (fetching) return (
    <div className="loading"><div className="spinner"></div>جاري التحميل...</div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">

        {/* Header */}
        <div className="header">
          <div>
            <h1><i className="fas fa-crown" style={{ color: '#f59e0b', marginLeft: 10 }}></i>إدارة الاشتراك</h1>
            <p className="subtitle">اختر الباقة المناسبة لأعمالك</p>
          </div>
        </div>

        {/* Current plan banner */}
        {currentPlan && (
          <div style={{
            background: subStatus === 'active'
              ? 'linear-gradient(135deg,#10b981,#059669)'
              : 'linear-gradient(135deg,#f59e0b,#d97706)',
            borderRadius: '16px',
            padding: '20px 28px',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            color: 'white',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 52, height: 52, background: 'rgba(255,255,255,0.2)',
                borderRadius: 12, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 24
              }}>
                <i className="fas fa-crown"></i>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>
                  الباقة الحالية: {activePlan?.nameAr || currentPlan}
                </div>
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  {subStatus === 'active' ? '✓ نشط' : subStatus === 'trial' ? '⏱ تجريبي' : '✗ منتهي'}
                  {daysLeft !== null && ` · ${daysLeft} يوم متبقي`}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 4 }}>تاريخ الانتهاء</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {subEndDate ? new Date(subEndDate).toLocaleDateString('ar-EG') : 'غير محدد'}
              </div>
            </div>
          </div>
        )}

        {/* Billing Toggle */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
            اختر باقتك
          </h2>
          <p style={{ color: '#64748b', marginBottom: 20 }}>
            ادفع سنوياً ووفر حتى <strong style={{ color: '#4f46e5' }}>17%</strong>
          </p>
          <div style={{
            display: 'inline-flex',
            background: '#f1f5f9',
            borderRadius: 60,
            padding: 4,
            gap: 4,
          }}>
            {['monthly', 'yearly'].map(b => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                style={{
                  padding: '9px 22px',
                  borderRadius: 60,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Cairo, sans-serif',
                  fontWeight: 700,
                  fontSize: 14,
                  transition: 'all 0.2s',
                  background: billing === b ? 'white' : 'transparent',
                  color: billing === b ? '#4f46e5' : '#64748b',
                  boxShadow: billing === b ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                }}>
                {b === 'monthly' ? 'شهرية' : 'سنوية'}
                {b === 'yearly' && (
                  <span style={{
                    marginRight: 6,
                    background: '#10b981',
                    color: 'white',
                    padding: '1px 7px',
                    borderRadius: 60,
                    fontSize: 10,
                  }}>وفر 17%</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}>
          {PLANS.map(plan => {
            const price = billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            const isActive = currentPlan === plan.id;
            const isLoading = loadingPlan === plan.id;

            return (
              <div
                key={plan.id}
                style={{
                  background: 'white',
                  borderRadius: '24px',
                  padding: '32px 24px',
                  boxShadow: plan.featured
                    ? '0 8px 30px rgba(79, 70, 229, 0.15)'
                    : '0 4px 12px rgba(0,0,0,0.05)',
                  border: plan.featured ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                  transform: plan.featured ? 'scale(1.02)' : 'scale(1)',
                  transition: 'all 0.3s',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                {plan.featured && (
                  <span style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#4f46e5',
                    color: 'white',
                    padding: '4px 16px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                    letterSpacing: '0.5px',
                  }}>
                    الأكثر شيوعاً
                  </span>
                )}

                {isActive && (
                  <div style={{
                    position: 'absolute', top: 12, left: 12,
                    background: '#10b981', color: 'white',
                    padding: '3px 10px', borderRadius: 60,
                    fontSize: 10, fontWeight: 700,
                  }}>
                    ✓ مفعّل
                  </div>
                )}

                <div style={{ fontSize: 28, marginBottom: 8 }}>
                  {plan.id === 'starter' ? '🚀' : plan.id === 'professional' ? '⚡' : '🏢'}
                </div>

                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                  {plan.nameAr}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{plan.description}</div>

                <div style={{ margin: '16px 0' }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: '#0f172a' }}>
                    {price.toLocaleString()}
                  </span>
                  <span style={{ color: '#64748b', fontSize: 14 }}> ج.م</span>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                  /{billing === 'monthly' ? 'شهر' : 'سنة'}
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0', flex: 1 }}>
                  {plan.features.map((f, i) => (
                    <li key={i} style={{
                      padding: '6px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#334155',
                      fontSize: 14,
                    }}>
                      <i className="fas fa-check-circle" style={{ color: '#4f46e5' }}></i>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 16,
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    background: isActive
                      ? '#10b981'
                      : plan.featured
                        ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                        : '#4f46e5',
                    color: 'white',
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  {isLoading ? (
                    <><i className="fas fa-spinner fa-spin"></i> جاري المعالجة...</>
                  ) : isActive ? (
                    <><i className="fas fa-check"></i> الباقة الحالية</>
                  ) : (
                    <><i className="fas fa-arrow-left"></i> اشترك الآن</>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Stripe Notice */}
        <div className="card" style={{
          background: 'linear-gradient(135deg,#f8faff,#eef2ff)',
          border: '1px solid #e0e7ff',
          textAlign: 'center',
          padding: '24px 32px',
          marginTop: 8,
          borderRadius: '16px',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
          <h3 style={{ color: '#0f172a', marginBottom: 6 }}>دفع آمن بـ Stripe</h3>
          <p style={{ color: '#64748b', fontSize: 14, maxWidth: 480, margin: '0 auto' }}>
            جميع المعاملات المالية مشفرة ومحمية بأعلى معايير الأمان.
            نقبل بطاقات Visa وMastercard والمحافظ الإلكترونية.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            {['fab fa-cc-visa','fab fa-cc-mastercard','fab fa-cc-stripe'].map(ic => (
              <i key={ic} className={ic} style={{ fontSize: 28, color: '#94a3b8' }}></i>
            ))}
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
            * لتفعيل الدفع الحقيقي أضف Stripe Secret Key في الـ Backend
          </p>
        </div>
      </div>
    </div>
  );
}