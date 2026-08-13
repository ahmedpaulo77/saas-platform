// src/components/common/SuperAdminRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function SuperAdminRoute({ children }) {
  const { currentUser, userRole, loading } = useAuth();

  if (loading) {
    return <div style={styles.loading}>جاري التحميل...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (userRole !== 'super_admin') {
    return <Navigate to="/dashboard" />;
  }

  return children;
}

const styles = {
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontSize: '1.2rem',
    color: '#666'
  }
};