// src/pages/Signup.js - مع دعم كود الانضمام للشركات
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { generateInviteCode } from '../utils/companyQuery';

export default function Signup() {
  const [formData, setFormData] = useState({
    companyName: '',
    industry: 'general',
    email: '',
    password: '',
    confirmPassword: '',
    inviteCode: '', // كود الانضمام (اختياري)
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('كلمة المرور غير متطابقة');
      return;
    }

    if (formData.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setLoading(true);

    try {
      // 1. إنشاء المستخدم في Authentication
      const userCredential = await signup(formData.email, formData.password, 'user');
      const user = userCredential.user;

      // 2. التحقق من كود الانضمام (لو موجود)
      let companyId = null;
      let role = 'admin';

      if (formData.inviteCode.trim()) {
        // البحث عن الشركة بالكود
        const code = formData.inviteCode.trim().toUpperCase();
        const companiesSnap = await getDocs(
          query(collection(db, 'companies'), where('inviteCode', '==', code))
        );

        if (companiesSnap.empty) {
          // الكود غير صحيح — نحذف المستخدم ونرجع خطأ
          await user.delete();
          setError('❌ كود الانضمام غير صحيح. تأكد من الكود وحاول مرة أخرى');
          setLoading(false);
          return;
        }

        // الكود صحيح — نربط المستخدم بالشركة
        const companyDoc = companiesSnap.docs[0];
        companyId = companyDoc.id;
        role = 'user'; // الموظف المنضم بالكود يكون مستخدم عادي
      } else {
        // 3. لا يوجد كود — إنشاء شركة جديدة
        const companyRef = await addDoc(collection(db, 'companies'), {
          name: formData.companyName,
          email: formData.email,
          industry: formData.industry,
          subscription: {
            status: 'trial',
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          inviteCode: generateInviteCode(formData.companyName), // توليد كود تلقائي
          createdAt: new Date().toISOString(),
          isActive: true,
        });
        companyId = companyRef.id;
      }

      // 4. ربط المستخدم بالشركة
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        email: user.email,
        role: role,
        companyId: companyId,
        isActive: true,
        createdAt: new Date().toISOString(),
      });

      alert(role === 'admin'
        ? '✅ تم إنشاء الحساب والشركة بنجاح!'
        : '✅ تم الانضمام للشركة بنجاح!');
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
          <h1>إنشاء حساب</h1>
          <p>سجل شركتك وابدأ في إدارة أعمالك</p>
        </div>

        {error && (
          <div className="login-error">
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {/* كود الانضمام (اختياري) */}
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>كود الانضمام للشركة (اختياري)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="مثال: NGAH-9K2D"
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
              لو عندك كود من شركتك — اكتبه هنا للانضمام. لو مش عندك — سجل شركة جديدة
            </small>
          </div>

          {/* اسم الشركة (مطلوب فقط لو مفيش كود) */}
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>اسم الشركة {!formData.inviteCode && '*'}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="أدخل اسم الشركة"
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

          {/* مجال العمل (مطلوب فقط لو مفيش كود) */}
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>مجال العمل {!formData.inviteCode && '*'}</label>
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
              <option value="general" style={{ color: '#1e293b' }}>🏢 شركة / مكتب عام</option>
              <option value="super_market" style={{ color: '#1e293b' }}>🏪 سوبر ماركت</option>
              <option value="pharmacy" style={{ color: '#1e293b' }}>💊 صيدلية</option>
              <option value="restaurant" style={{ color: '#1e293b' }}>🍽️ مطعم / كافيه</option>
              <option value="clothing" style={{ color: '#1e293b' }}>👕 ملابس</option>
            </select>
            <small style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, display: 'block', marginTop: 4 }}>
              اختر مجال عملك — هتظهر ليك الوحدات المناسبة لمجالك فقط
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>البريد الإلكتروني</label>
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
            <label>كلمة المرور</label>
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
            <label>تأكيد كلمة المرور</label>
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
                جاري إنشاء الحساب...
              </>
            ) : (
              <>
                <i className="fas fa-user-plus" style={{ marginLeft: 8 }}></i>
                {formData.inviteCode ? 'انضمام للشركة' : 'إنشاء حساب'}
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
            لديك حساب بالفعل؟ <Link to="/login" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: '600' }}>تسجيل الدخول</Link>
          </p>
        </div>
      </div>
    </div>
  );
}