// src/pages/Setup.js - إكمال بيانات الشركة بعد التسجيل
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { generateInviteCode } from '../utils/companyQuery';

export default function Setup() {
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
      // إنشاء الشركة
      const companyRef = await addDoc(collection(db, 'companies'), {
        name: companyName.trim(),
        email: currentUser.email,
        industry: industry,
        subscription: {
          status: 'trial',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        inviteCode: generateInviteCode(companyName.trim()), // توليد كود تلقائي
        createdAt: new Date().toISOString(),
        isActive: true,
      });

      // ربط المستخدم بالشركة (فقط تحديث companyId — role يبقى كما هو)
      await updateDoc(doc(db, 'users', currentUser.uid), {
        companyId: companyRef.id,
      });

      // إعادة تحميل عشان الـ AuthContext ياخد الـ companyId الجديد
      window.location.href = '/dashboard';
    } catch (e) {
      console.error(e);
      setError('حدث خطأ، حاول مرة أخرى');
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
          <h1>أهلاً بك!</h1>
          <p>خطوة أخيرة — أدخل اسم شركتك لتبدأ</p>
        </div>

        {/* عرض كود الانضمام (لو موجود) */}
        {companyName && (
          <div style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '10px 16px', marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <i className="fas fa-key" style={{ color: '#10b981', fontSize: 18 }}></i>
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>كود انضمام الشركة</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'white', letterSpacing: 1 }}>
                {companyName.trim().substring(0, 4).toUpperCase()}-{Math.random().toString(36).substring(2, 6).toUpperCase()}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="login-error">
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label>اسم الشركة *</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="مثال: شركة النجاح للتجارة"
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

          {/* مجال العمل */}
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label>مجال العمل *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { value: 'general', label: 'شركة / مكتب عام', icon: 'fas fa-building' },
                { value: 'super_market', label: 'سوبر ماركت', icon: 'fas fa-store' },
                { value: 'pharmacy', label: 'صيدلية', icon: 'fas fa-pills' },
                { value: 'restaurant', label: 'مطعم / كافيه', icon: 'fas fa-utensils' },
                { value: 'clothing', label: 'ملابس', icon: 'fas fa-tshirt' },
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
              اختر مجال عملك — هتظهر ليك الوحدات المناسبة لمجالك فقط
            </small>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin" style={{ marginLeft: 8 }}></i>جاري الإنشاء...
              </>
            ) : (
              <>
                <i className="fas fa-arrow-left" style={{ marginLeft: 8 }}></i>ابدأ الآن
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
            تسجيل خروج
          </button>
        </div>
      </div>
    </div>
  );
}