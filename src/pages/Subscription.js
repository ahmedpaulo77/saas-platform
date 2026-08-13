// src/pages/Subscription.js - نظام الاشتراكات مع Stripe
// eslint-disable-next-line no-unused-vars
import { loadStripe } from '@stripe/stripe-js';
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/common/Sidebar';

// ─── ضع هنا مفتاح Stripe الـ Publishable key بتاعك عند التفعيل ───
// eslint-disable-next-line no-unused-vars
const STRIPE_PUBLIC_KEY = 'pk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    nameAr: 'المبتدئ',
    monthlyPrice: 99,
    yearlyPrice: 990,
    color: '#6366f1',
    description: 'مثالي للشركات الصغيرة',
    features: [
      'حتى 5 مستخدمين',
      'إدارة 50 عميل',
      'فواتير غير محدودة',
      'تصدير PDF',
      'دعم بالبريد الإلكتروني',
    ],
    stripePriceMonthly: 'price_starter_monthly',
    stripePriceYearly: 'price_starter_yearly',
  },
  {
    id: 'professional',
    name: 'Professional',
    nameAr: 'الاحترافي',
    monthlyPrice: 249,
    yearlyPrice: 2490,
    color: '#6366f1',
    featured: true,
    description: 'للشركات المتوسطة والنامية',
    features: [
      'مستخدمين غير محدودين',
      'عملاء غير محدودين',
      'كل مميزات Starter',
      'تقارير متقدمة',
      'إدارة مخزون كاملة',
      'دعم أولوية 24/7',
    ],
    stripePriceMonthly: 'price_pro_monthly',
    stripePriceYearly: 'price_pro_yearly',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    nameAr: 'المؤسسي',
    monthlyPrice: 599,
    yearlyPrice: 5990,
    color: '#7c3aed',
    description: 'للشركات الكبيرة والمؤسسات',
    features: [
      'كل مميزات Professional',
      'Multi-tenant كامل',
      'API مخصص',
      'تخصيص كامل',
      'مدير حساب مخصص',
      'SLA 99.9% uptime',
    ],
    stripePriceMonthly: 'price_enterprise_monthly',
    stripePriceYearly: 'price_enterprise_yearly',
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
      // ── في حالة Stripe حقيقي ──
      // const stripe = await loadStripe(STRIPE_PUBLIC_KEY);
      // const priceId = billing === 'monthly' ? plan.stripePriceMonthly : plan.stripePriceYearly;
      // const { error } = await stripe.redirectToCheckout({
      //   lineItems: [{ price: priceId, quantity: 1 }],
      //   mode: 'subscription',
      //   successUrl: `${window.location.origin}/dashboard?success=true`,
      //   cancelUrl: `${window.location.origin}/subscription`,
      //   clientReferenceId: userCompanyId,
      // });
      // if (error) console.error(error);

      // ── Simulation (Demo) ──
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
        alert('✅ في التطبيق الحقيقي سيتم تحويلك لـ Stripe لإتمام الدفع.\n\nباقة: ' + plan.nameAr + '\nالسعر: ' + (billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice) + ' ج.م/' + (billing === 'monthly' ? 'شهر' : 'سنة'));
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
            borderRadius: 'var(--radius)',
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
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 6 }}>
            اختر باقتك
          </h2>
          <p style={{ color: 'var(--gray-500)', marginBottom: 20 }}>
            ادفع سنوياً ووفر حتى 17%
          </p>
          <div style={{
            display: 'inline-flex',
            background: 'var(--gray-100)',
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
                  color: billing === b ? 'var(--primary)' : 'var(--gray-500)',
                  boxShadow: billing === b ? 'var(--shadow-sm)' : 'none',
                }}>
                {b === 'monthly' ? 'شهري' : 'سنوي'}
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
        <div className="pricing-grid">
          {PLANS.map(plan => {
            const price = billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            const isActive = currentPlan === plan.id;
            const isLoading = loadingPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`pricing-card ${plan.featured ? 'featured' : ''}`}
                style={{ position: 'relative', overflow: 'hidden' }}
              >
                {plan.featured && (
                  <div className="plan-badge">الأكثر شيوعاً</div>
                )}

                {isActive && (
                  <div style={{
                    position: 'absolute', top: 12, left: 12,
                    background: '#10b981', color: 'white',
                    padding: '3px 10px', borderRadius: 60,
                    fontSize: 10, fontWeight: 700
                  }}>
                    ✓ مفعّل
                  </div>
                )}

                <div style={{ fontSize: 28, marginBottom: 8 }}>
                  {plan.id === 'starter' ? '🚀' : plan.id === 'professional' ? '⚡' : '🏢'}
                </div>

                <div className="plan-name">{plan.nameAr}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>{plan.description}</div>

                <div className="plan-price">
                  {price.toLocaleString()}
                  <span> ج.م</span>
                </div>
                <div className="plan-period">/{billing === 'monthly' ? 'شهر' : 'سنة'}</div>

                <ul className="plan-features">
                  {plan.features.map((f, i) => (
                    <li key={i}>
                      <i className="fas fa-check-circle"></i>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  className={`btn-primary btn-block ${isActive ? 'btn-success' : ''}`}
                  onClick={() => handleSubscribe(plan)}
                  disabled={isLoading}
                  style={{
                    background: isActive
                      ? '#10b981'
                      : plan.featured
                        ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                        : 'var(--primary)',
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
          marginTop: 8
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
          <h3 style={{ color: 'var(--gray-800)', marginBottom: 6, justifyContent: 'center' }}>
            دفع آمن بـ Stripe
          </h3>
          <p style={{ color: 'var(--gray-500)', fontSize: 14, maxWidth: 480, margin: '0 auto' }}>
            جميع المعاملات المالية مشفرة ومحمية بأعلى معايير الأمان.
            نقبل بطاقات Visa وMastercard والمحافظ الإلكترونية.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            {['fab fa-cc-visa','fab fa-cc-mastercard','fab fa-cc-stripe'].map(ic => (
              <i key={ic} className={ic} style={{ fontSize: 28, color: 'var(--gray-400)' }}></i>
            ))}
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-400)' }}>
            * لتفعيل الدفع الحقيقي أضف Stripe Secret Key في الـ Backend
          </p>
        </div>
      </div>
    </div>
  );
}
