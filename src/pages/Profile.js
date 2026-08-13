// src/pages/Profile.js - صفحة الملف الشخصي
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { updatePassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import Sidebar from '../components/common/Sidebar';

export default function Profile() {
  const { currentUser } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handlePasswordChange(e) {
    e.preventDefault();
    setMessage('');
    setError('');

    if (newPassword !== confirmPassword) {
      setError('كلمة المرور غير متطابقة');
      return;
    }

    if (newPassword.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    try {
      await updatePassword(auth.currentUser, newPassword);
      setMessage('✅ تم تغيير كلمة المرور بنجاح');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setError('❌ حدث خطأ: ' + error.message);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: '#333', marginBottom: '20px' }}>
          <i className="fas fa-user-circle"></i> الملف الشخصي
        </h2>

        <div className="card" style={{ maxWidth: '500px' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: '#4f46e5',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              margin: '0 auto 16px',
            }}>
              {currentUser?.email?.charAt(0).toUpperCase() || 'A'}
            </div>
            <h3>{currentUser?.email}</h3>
            <p style={{ color: '#64748b' }}>الدور: {currentUser?.role || 'مستخدم'}</p>
          </div>

          <hr style={{ margin: '20px 0' }} />

          <h4>تغيير كلمة المرور</h4>
          <form onSubmit={handlePasswordChange}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>
                كلمة المرور الجديدة
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '10px',
                  fontSize: '15px',
                }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>
                تأكيد كلمة المرور
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '10px',
                  fontSize: '15px',
                }}
              />
            </div>
            {message && <p style={{ color: '#10b981' }}>{message}</p>}
            {error && <p style={{ color: '#ef4444' }}>{error}</p>}
            <button type="submit" className="btn-primary" style={{ width: '100%' }}>
              <i className="fas fa-save"></i> تغيير كلمة المرور
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}