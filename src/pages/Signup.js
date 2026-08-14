// src/pages/Signup.js - نسخة مصححة
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function Signup() {
  const [formData, setFormData] = useState({
    companyName: '',
    email: '',
    password: '',
    confirmPassword: '',
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
      const userCredential = await signup(formData.email, formData.password, 'admin');
      const user = userCredential.user;

      // 2. إنشاء الشركة في Firestore باستخدام addDoc
      const companyRef = await addDoc(collection(db, 'companies'), {
        name: formData.companyName,
        email: formData.email,
        subscription: {
          status: 'trial',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        createdAt: new Date().toISOString(),
        isActive: true,
      });

      // 3. ربط المستخدم بالشركة
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        email: user.email,
        role: 'admin',
        companyId: companyRef.id, // ✅ الآن companyRef.id موجود
        isActive: true,
        createdAt: new Date().toISOString(),
      });

      alert('✅ تم إنشاء الحساب والشركة بنجاح!');
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
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>اسم الشركة</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="أدخل اسم الشركة"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                required
                style={{ paddingRight: '42px' }}
              />
              <i className="fas fa-building" style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 14
              }}></i>
            </div>
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
                إنشاء حساب
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