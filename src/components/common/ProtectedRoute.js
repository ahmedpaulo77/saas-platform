// src/components/common/ProtectedRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { currentUser, userRole, userCompanyId, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: 16,
        fontFamily: 'Cairo, sans-serif', color: '#64748b', fontSize: 16,
      }}>
        <div style={{
          width: 36, height: 36,
          border: '3px solid #e2e8f0',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        جاري التحميل...
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // مش مسجل — روح للـ login
  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  // super_admin — يدخل دايماً بدون قيود
  if (userRole === 'super_admin') {
    return children;
  }

  // userRole لسه null (بيتحمل) — استنى
  if (userRole === null && currentUser) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: 16,
        fontFamily: 'Cairo, sans-serif', color: '#64748b', fontSize: 16,
      }}>
        <div style={{
          width: 36, height: 36,
          border: '3px solid #e2e8f0',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        جاري التحميل...
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // مسجل بس مش عنده شركة — روح للـ setup
  if (!userCompanyId) {
    return <Navigate to="/setup" />;
  }

  return children;
}
