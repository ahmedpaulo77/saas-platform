// src/pages/Login.js - مع إضافة رابط التسجيل ونسيت كلمة المرور
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase/config';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // نسيت كلمة المرور
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }
    setLoading(false);
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    setResetMessage('');
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage('✅ تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني');
      setTimeout(() => {
        setShowResetModal(false);
        setResetEmail('');
        setResetMessage('');
      }, 3000);
    } catch (err) {
      setResetMessage('❌ حدث خطأ. تأكد من صحة البريد الإلكتروني');
    }
    setResetLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="logo-icon">
            <i className="fas fa-cube"></i>
          </div>
          <h1>SaaS PRO</h1>
          <p>منصة إدارة الأعمال المتكاملة</p>
        </div>

        {/* Error */}
        {error && (
          <div className="login-error">
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>البريد الإلكتروني</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@company.com"
                required
                style={{ paddingRight: '42px' }}
              />
              <i className="fas fa-envelope" style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 14
              }}></i>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>كلمة المرور</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ paddingRight: '42px', paddingLeft: '42px' }}
              />
              <i className="fas fa-lock" style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 14
              }}></i>
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: 4
              }}>
                <i className={`fas fa-${showPassword ? 'eye-slash' : 'eye'}`}></i>
              </button>
            </div>
          </div>

          {/* نسيت كلمة المرور */}
          <div style={{ textAlign: 'left', marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => {
                setResetEmail(email);
                setResetMessage('');
                setShowResetModal(true);
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#818cf8', fontSize: 13, fontWeight: 600,
                fontFamily: 'Cairo', textDecoration: 'underline',
              }}
            >
              نسيت كلمة المرور؟
            </button>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin" style={{ marginLeft: 8 }}></i>
                جاري الدخول...
              </>
            ) : (
              <>
                <i className="fas fa-sign-in-alt" style={{ marginLeft: 8 }}></i>
                تسجيل الدخول
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div style={{
          marginTop: 28, textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          paddingTop: 20
        }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
            <i className="fas fa-shield-alt" style={{ marginLeft: 6 }}></i>
            جميع البيانات مشفرة ومحمية بالكامل
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
            ليس لديك حساب؟ <Link to="/signup" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: '600' }}>إنشاء حساب جديد</Link>
          </p>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-key" style={{ color: '#6366f1' }}></i>{" "}
                استعادة كلمة المرور
              </h3>
              <button
                className="modal-close"
                onClick={() => setShowResetModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
                  أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور
                </p>
                <div className="form-group">
                  <label>البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="example@company.com"
                    required
                    autoFocus
                  />
                </div>
                {resetMessage && (
                  <div style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    background: resetMessage.startsWith('✅') ? '#f0fdf4' : '#fef2f2',
                    color: resetMessage.startsWith('✅') ? '#16a34a' : '#dc2626',
                    border: `1px solid ${resetMessage.startsWith('✅') ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    {resetMessage}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowResetModal(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="btn-primary" disabled={resetLoading}>
                  {resetLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane"></i> إرسال الرابط
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}