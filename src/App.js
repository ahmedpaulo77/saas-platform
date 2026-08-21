// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import Clients from './pages/Clients';
import Invoices from './pages/Invoices';
import Inventory from './pages/Inventory';
import Tasks from './pages/Tasks';
import Projects from './pages/Projects';
import Users from './pages/Users';
import Reports from './pages/Reports';
import Aging from './pages/Aging';
import POS from './pages/POS';
import Suppliers from './pages/Suppliers';
import Expiry from './pages/Expiry';
import Notifications from './pages/Notifications';
import About from './pages/About';
import Profile from './pages/Profile';
import Subscription from './pages/Subscription';
import SuperAdminDashboard from './pages/admin/SuperAdminDashboard';
import ManageUsers from './pages/admin/ManageUsers';
import ProtectedRoute from './components/common/ProtectedRoute';
import SuperAdminRoute from './components/common/SuperAdminRoute';
import { getAvailableModules } from './utils/modules';
import './App.css';

// مكون لحماية المسارات حسب مجال العمل
function IndustryRoute({ moduleKey, children }) {
  const { userRole, userIndustry } = useAuth();
  const available = getAvailableModules(userIndustry, userRole);
  
  if (!available.has(moduleKey)) {
    return <Navigate to="/dashboard" />;
  }
  return children;
}

function AppRoutes() {
  const { userRole } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/"        element={<Landing />} />
      <Route path="/login"   element={<Login />} />
      <Route path="/signup"  element={<Signup />} />
      <Route path="/setup"   element={<Setup />} />

      {/* Protected */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          {userRole === 'super_admin' ? <Navigate to="/admin" /> : <Dashboard />}
        </ProtectedRoute>
      } />
      <Route path="/companies"    element={<ProtectedRoute><IndustryRoute moduleKey="companies"><Companies /></IndustryRoute></ProtectedRoute>} />
      <Route path="/clients"      element={<ProtectedRoute><IndustryRoute moduleKey="clients"><Clients /></IndustryRoute></ProtectedRoute>} />
      <Route path="/invoices"     element={<ProtectedRoute><IndustryRoute moduleKey="invoices"><Invoices /></IndustryRoute></ProtectedRoute>} />
      <Route path="/inventory"    element={<ProtectedRoute><IndustryRoute moduleKey="inventory"><Inventory /></IndustryRoute></ProtectedRoute>} />
      <Route path="/tasks"        element={<ProtectedRoute><IndustryRoute moduleKey="tasks"><Tasks /></IndustryRoute></ProtectedRoute>} />
      <Route path="/projects"     element={<ProtectedRoute><IndustryRoute moduleKey="projects"><Projects /></IndustryRoute></ProtectedRoute>} />
      <Route path="/users"        element={<ProtectedRoute><IndustryRoute moduleKey="users"><Users /></IndustryRoute></ProtectedRoute>} />
      <Route path="/reports"      element={<ProtectedRoute><IndustryRoute moduleKey="reports"><Reports /></IndustryRoute></ProtectedRoute>} />
      <Route path="/aging"        element={<ProtectedRoute><IndustryRoute moduleKey="aging"><Aging /></IndustryRoute></ProtectedRoute>} />
      <Route path="/pos"          element={<ProtectedRoute><IndustryRoute moduleKey="pos"><POS /></IndustryRoute></ProtectedRoute>} />
      <Route path="/suppliers"    element={<ProtectedRoute><IndustryRoute moduleKey="suppliers"><Suppliers /></IndustryRoute></ProtectedRoute>} />
      <Route path="/expiry"       element={<ProtectedRoute><IndustryRoute moduleKey="expiry"><Expiry /></IndustryRoute></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><IndustryRoute moduleKey="notifications"><Notifications /></IndustryRoute></ProtectedRoute>} />
      <Route path="/about"        element={<ProtectedRoute><IndustryRoute moduleKey="about"><About /></IndustryRoute></ProtectedRoute>} />
      <Route path="/profile"      element={<ProtectedRoute><IndustryRoute moduleKey="profile"><Profile /></IndustryRoute></ProtectedRoute>} />
      <Route path="/subscription" element={<ProtectedRoute><IndustryRoute moduleKey="subscription"><Subscription /></IndustryRoute></ProtectedRoute>} />

      {/* Super Admin */}
      <Route path="/admin"       element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
      <Route path="/admin/users" element={<SuperAdminRoute><ManageUsers /></SuperAdminRoute>} />
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
