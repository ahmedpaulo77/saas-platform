// src/pages/Login.js - تصميم احترافي
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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

          <div className="form-group" style={{ marginBottom: 24 }}>
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
        </div>
      </div>
    </div>
  );
}
