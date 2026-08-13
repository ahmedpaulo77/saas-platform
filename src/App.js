// src/App.js - النسخة النهائية (مع إضافة About)
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import Clients from './pages/Clients';
import Invoices from './pages/Invoices';
import Inventory from './pages/Inventory';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import About from './pages/About';
import Profile from './pages/Profile';
import SuperAdminDashboard from './pages/admin/SuperAdminDashboard';
import ProtectedRoute from './components/common/ProtectedRoute';
import SuperAdminRoute from './components/common/SuperAdminRoute';

import './App.css';

function AppRoutes() {
  const { userRole } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          {userRole === 'super_admin' ? <Navigate to="/admin" /> : <Dashboard />}
        </ProtectedRoute>
      } />
      <Route path="/companies" element={
        <ProtectedRoute>
          <Companies />
        </ProtectedRoute>
      } />
      <Route path="/clients" element={
        <ProtectedRoute>
          <Clients />
        </ProtectedRoute>
      } />
      <Route path="/invoices" element={
        <ProtectedRoute>
          <Invoices />
        </ProtectedRoute>
      } />
      <Route path="/inventory" element={
        <ProtectedRoute>
          <Inventory />
        </ProtectedRoute>
      } />
      <Route path="/tasks" element={
        <ProtectedRoute>
          <Tasks />
        </ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute>
          <Reports />
        </ProtectedRoute>
      } />
      <Route path="/notifications" element={
        <ProtectedRoute>
          <Notifications />
        </ProtectedRoute>
      } />
      <Route path="/about" element={
        <ProtectedRoute>
          <About />
        </ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <SuperAdminRoute>
          <SuperAdminDashboard />
        </SuperAdminRoute>
      } />
      <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;