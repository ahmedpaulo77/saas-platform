// src/pages/Landing.js - Landing Page احترافية
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const features = [
  { icon: 'fas fa-building',      color: '#6366f1', bg: '#eef2ff', title: 'إدارة الشركات',       desc: 'أضف وأدر شركاتك مع نظام اشتراكات متكامل وتحكم كامل' },
  { icon: 'fas fa-user-friends',  color: '#10b981', bg: '#d1fae5', title: 'إدارة العملاء',        desc: 'قاعدة بيانات منظمة لعملائك مع ربط كامل بالشركة' },
  { icon: 'fas fa-file-invoice',  color: '#f59e0b', bg: '#fef3c7', title: 'فواتير + PDF',         desc: 'أنشئ فواتير احترافية وصدّرها PDF بضغطة واحدة' },
  { icon: 'fas fa-boxes',         color: '#8b5cf6', bg: '#f3e8ff', title: 'إدارة المخزون',        desc: 'تتبع المنتجات تلقائياً مع تحديث فوري عند كل فاتورة' },
  { icon: 'fas fa-tasks',         color: '#ec4899', bg: '#fdf2f8', title: 'إدارة المهام',         desc: 'وزّع المهام بأولويات ومواعيد وتابع إنجاز فريقك' },
  { icon: 'fas fa-chart-pie',     color: '#06b6d4', bg: '#ecfeff', title: 'تقارير بيانية',        desc: 'Charts تفاعلية وتصدير Excel لكل بياناتك' },
  { icon: 'fas fa-bell',          color: '#f97316', bg: '#fff7ed', title: 'إشعارات ذكية',         desc: 'تنبيهات تلقائية للمخزون والفواتير والمهام المتأخرة' },
  { icon: 'fas fa-crown',         color: '#eab308', bg: '#fefce8', title: 'نظام اشتراكات',        desc: '3 باقات مرنة مع دعم Stripe للدفع الآمن' },
  { icon: 'fas fa-shield-alt',    color: '#14b8a6', bg: '#f0fdfa', title: 'أمان متقدم',           desc: 'عزل كامل للبيانات — كل شركة ترى بياناتها فقط' },
];

const plans = [
  {
    id: 'standard',
    nameAr: 'الباقة الكاملة',
    emoji: '⚡',
    monthlyPrice: 1000,
    desc: 'كل المميزات — بدون قيود',
    featured: true,
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

const stats = [
  { value: '500+', label: 'شركة تستخدم المنصة' },
  { value: '50K+', label: 'فاتورة صدرت' },
  { value: '99.9%', label: 'uptime مضمون' },
  { value: '24/7', label: 'دعم فني متاح' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [billing, setBilling] = useState('monthly');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
          <button onClick={() => navigate('/login')} style={{
            padding: '8px 20px', borderRadius: 8, border: scrolled ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.3)',
            background: 'transparent', cursor: 'pointer', fontFamily: 'Cairo',
            fontWeight: 600, fontSize: 14, color: scrolled ? '#334155' : 'white',
            transition: 'all 0.2s',
          }}>
            تسجيل الدخول
          </button>
          <button onClick={() => navigate('/signup')} style={{
            padding: '8px 22px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            cursor: 'pointer', fontFamily: 'Cairo', fontWeight: 700,
            fontSize: 14, color: 'white',
            boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
          }}>
            ابدأ الآن
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
            <span style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 600 }}>منصة إدارة الأعمال الكاملة</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 68px)', fontWeight: 900,
            color: 'white', lineHeight: 1.15, marginBottom: 24,
            letterSpacing: '-1px',
          }}>
            أدر أعمالك بذكاء<br />
            <span style={{
              background: 'linear-gradient(135deg,#818cf8,#c084fc)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              في مكان واحد
            </span>
          </h1>

          <p style={{
            fontSize: 18, color: 'rgba(255,255,255,0.6)',
            maxWidth: 580, margin: '0 auto 40px', lineHeight: 1.8,
          }}>
            منصة SaaS متكاملة لإدارة الشركات والعملاء والفواتير والمخزون والمهام —
            مع تقارير بيانية وتصدير PDF بضغطة واحدة.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/signup')} style={{
              padding: '16px 40px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: 'white', fontFamily: 'Cairo', fontWeight: 800,
              fontSize: 17, cursor: 'pointer',
              boxShadow: '0 8px 32px rgba(99,102,241,0.45)',
              transition: 'transform 0.2s',
            }}
              onMouseOver={e => e.target.style.transform = 'translateY(-2px)'}
              onMouseOut={e => e.target.style.transform = 'translateY(0)'}
            >
              <i className="fas fa-rocket" style={{ marginLeft: 10 }}></i>
              ابدأ الآن
            </button>
            <button onClick={() => navigate('/login')} style={{
              padding: '16px 40px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.06)',
              color: 'white', fontFamily: 'Cairo', fontWeight: 600,
              fontSize: 17, cursor: 'pointer', transition: 'all 0.2s',
            }}
              onMouseOver={e => { e.target.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseOut={e => { e.target.style.background = 'rgba(255,255,255,0.06)'; }}
            >
              <i className="fas fa-sign-in-alt" style={{ marginLeft: 10 }}></i>
              تسجيل الدخول
            </button>
          </div>

          <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            <i className="fas fa-check-circle" style={{ color: '#10b981', marginLeft: 6 }}></i>
            اشترك الآن بباقة الاشتراك الشهري 1000 ج.م
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
            <div key={s.label}>
              <div style={{ fontSize: 36, fontWeight: 900, color: 'white', letterSpacing: -1 }}>{s.value}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{s.label}</div>
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
            }}>المميزات</span>
            <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, color: '#0f172a', marginBottom: 14 }}>
              كل ما تحتاجه في منصة واحدة
            </h2>
            <p style={{ fontSize: 17, color: '#64748b', maxWidth: 520, margin: '0 auto' }}>
              من إدارة العملاء حتى التقارير البيانية — كل شيء جاهز ومتكامل
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
            gap: 24,
          }}>
            {features.map(f => (
              <div key={f.title} style={{
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
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={{ padding: '96px 5%', background: 'white' }} id="pricing">
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span style={{
              background: '#eef2ff', color: '#6366f1', padding: '4px 16px',
              borderRadius: 60, fontSize: 13, fontWeight: 700, display: 'inline-block', marginBottom: 16,
            }}>الأسعار</span>
            <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, color: '#0f172a', marginBottom: 12 }}>
              باقات مرنة لكل حجم
            </h2>
            <p style={{ fontSize: 16, color: '#64748b', marginBottom: 28 }}>
              ادفع سنوياً ووفر حتى 17%
            </p>
            <div style={{
              display: 'inline-flex', background: '#f1f5f9',
              borderRadius: 60, padding: 4, gap: 4,
            }}>
              {['monthly','yearly'].map(b => (
                <button key={b} onClick={() => setBilling(b)} style={{
                  padding: '8px 20px', borderRadius: 60, border: 'none', cursor: 'pointer',
                  fontFamily: 'Cairo', fontWeight: 700, fontSize: 14, transition: 'all 0.2s',
                  background: billing === b ? 'white' : 'transparent',
                  color: billing === b ? '#6366f1' : '#64748b',
                  boxShadow: billing === b ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                }}>
                  {b === 'monthly' ? 'شهري' : 'سنوي'}
                  {b === 'yearly' && (
                    <span style={{ marginRight: 6, background: '#10b981', color: 'white', padding: '1px 7px', borderRadius: 60, fontSize: 10 }}>
                      وفر 17%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 24, maxWidth: 420, margin: '0 auto' }}>
            {plans.map(plan => {
              const price = billing === 'monthly' ? plan.monthlyPrice : plan.monthlyPrice * 10;
              return (
                <div key={plan.id} style={{
                  background: 'white', borderRadius: 24, padding: '36px 28px',
                  border: plan.featured ? '2px solid #6366f1' : '1px solid #e2e8f0',
                  boxShadow: plan.featured ? '0 8px 40px rgba(99,102,241,0.15)' : 'none',
                  position: 'relative', transition: 'transform 0.3s',
                  transform: plan.featured ? 'scale(1.02)' : 'scale(1)',
                  textAlign: 'center',
                }}
                  onMouseOver={e => { if (!plan.featured) e.currentTarget.style.transform = 'translateY(-4px)'; }}
                  onMouseOut={e => { if (!plan.featured) e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {plan.featured && (
                    <span style={{
                      position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                      background: '#6366f1', color: 'white', padding: '3px 18px',
                      borderRadius: 60, fontSize: 12, fontWeight: 700,
                    }}>الأكثر شيوعاً</span>
                  )}
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{plan.emoji}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{plan.nameAr}</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>{plan.desc}</div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 38, fontWeight: 900, color: '#0f172a' }}>{price.toLocaleString()}</span>
                    <span style={{ fontSize: 14, color: '#64748b' }}> ج.م</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 24 }}>/{billing === 'monthly' ? 'شهر' : 'سنة'}</div>
                  <ul style={{ listStyle: 'none', padding: 0, marginBottom: 28, textAlign: 'right' }}>
                    {plan.features.map((f, i) => (
                      <li key={i} style={{ padding: '7px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#334155' }}>
                        <i className="fas fa-check-circle" style={{ color: '#10b981', fontSize: 13, flexShrink: 0 }}></i>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => navigate('/signup')} style={{
                    width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                    background: plan.featured ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#f1f5f9',
                    color: plan.featured ? 'white' : '#334155',
                    fontFamily: 'Cairo', fontWeight: 700, fontSize: 15,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    ابدأ الآن
                  </button>
                </div>
              );
            })}
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
            جاهز تبدأ؟
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.6)', marginBottom: 36 }}>
            انضم لمئات الشركات التي تثق في SaaS PRO لإدارة أعمالها
          </p>
          <button onClick={() => navigate('/signup')} style={{
            padding: '18px 52px', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color: 'white', fontFamily: 'Cairo', fontWeight: 800,
            fontSize: 18, cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(99,102,241,0.5)',
            transition: 'transform 0.2s',
          }}
            onMouseOver={e => e.target.style.transform = 'translateY(-3px)'}
            onMouseOut={e => e.target.style.transform = 'translateY(0)'}
          >
            <i className="fas fa-rocket" style={{ marginLeft: 12 }}></i>
            ابدأ الآن
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            اشترك الآن واحصل على كل المميزات — بدون قيود
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
          © 2026 SaaS PRO — جميع الحقوق محفوظة
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
