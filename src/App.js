// src/App.js
import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationsProvider } from "./context/NotificationsContext";
// ✅ Code-splitting: كل صفحة تتحمل عند الطلب فقط
const Purchases = lazy(() => import("./pages/Purchases"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Profits = lazy(() => import("./pages/Profits"));
const Kitchen = lazy(() => import("./pages/Kitchen"));
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Setup = lazy(() => import("./pages/Setup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Companies = lazy(() => import("./pages/Companies"));
const Clients = lazy(() => import("./pages/Clients"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Quotations = lazy(() => import("./pages/Quotations"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Projects = lazy(() => import("./pages/Projects"));
const Users = lazy(() => import("./pages/Users"));
const Reports = lazy(() => import("./pages/Reports"));
const Aging = lazy(() => import("./pages/Aging"));
const POS = lazy(() => import("./pages/POS"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Expiry = lazy(() => import("./pages/Expiry"));
const Notifications = lazy(() => import("./pages/Notifications"));
const About = lazy(() => import("./pages/About"));
const Profile = lazy(() => import("./pages/Profile"));
const DailyPrices = lazy(() => import("./pages/DailyPrices"));
const SuperAdminDashboard = lazy(() => import("./pages/admin/SuperAdminDashboard"));
const ManageUsers = lazy(() => import("./pages/admin/ManageUsers"));
const MyCompany = lazy(() => import("./pages/MyCompany"));
const Sellers = lazy(() => import("./pages/Sellers"));
const Buyers = lazy(() => import("./pages/Buyers"));
const Messages = lazy(() => import("./pages/Messages"));
const Patients = lazy(() => import("./pages/Patients"));
const Appointments = lazy(() => import("./pages/Appointments"));
const Prescriptions = lazy(() => import("./pages/Prescriptions"));
const MenuCategories = lazy(() => import("./pages/MenuCategories"));
const RawMaterials = lazy(() => import("./pages/RawMaterials"));
const Statements = lazy(() => import("./pages/Statements"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const Tickets = lazy(() => import("./pages/Tickets"));
const Attendance = lazy(() => import("./pages/Attendance"));
import ProtectedRoute from "./components/common/ProtectedRoute";
import SuperAdminRoute from "./components/common/SuperAdminRoute";
import { LanguageProvider } from "./i18n/LanguageContext";
import { getAvailableModules } from "./utils/modules";
import "./App.css";

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

  // الأدوار التشغيلية لها شاشة رئيسية خاصة (بدل لوحة التحكم المالية)
  function homeElement() {
    if (userRole === "super_admin") return <Navigate to="/admin" />;
    if (userRole === "kitchen") return <Navigate to="/kitchen" />;
    if (userRole === "cashier") return <Navigate to="/pos" />;
    return <Dashboard />;
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/setup" element={<Setup />} />

      {/* Protected */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute>{homeElement()}</ProtectedRoute>}
      />
      <Route
        path="/companies"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="companies">
              <Companies />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="clients">
              <Clients />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sellers"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="sellers">
              <Sellers />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/buyers"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="buyers">
              <Buyers />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="messages">
              <Messages />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="invoices">
              <Invoices />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quotations"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="quotations">
              <Quotations />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="inventory">
              <Inventory />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
             
      <Route
        path="/daily-prices"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="daily-prices">
              <DailyPrices />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="tasks">
              <Tasks />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="projects">
              <Projects />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/subscriptions"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="subscriptions">
              <Subscriptions />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="tickets">
              <Tickets />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="attendance">
              <Attendance />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="users">
              <Users />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="reports">
              <Reports />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/aging"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="aging">
              <Aging />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/statements"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="reports">
              <Statements />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="pos">
              <POS />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="suppliers">
              <Suppliers />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expiry"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="expiry">
              <Expiry />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="notifications">
              <Notifications />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/about"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="about">
              <About />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="profile">
              <Profile />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="purchases">
              <Purchases />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="expenses">
              <Expenses />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profits"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="profits">
              <Profits />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/patients"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="patients">
              <Patients />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/appointments"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="appointments">
              <Appointments />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/prescriptions"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="prescriptions">
              <Prescriptions />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/menu-categories"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="menu-categories">
              <MenuCategories />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/raw-materials"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="raw-materials">
              <RawMaterials />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute>
            <IndustryRoute moduleKey="kitchen">
              <Kitchen />
            </IndustryRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-company"
        element={
          <ProtectedRoute>
            <MyCompany />
          </ProtectedRoute>
        }
      />

      {/* Super Admin */}
      <Route
        path="/admin"
        element={
          <SuperAdminRoute>
            <SuperAdminDashboard />
          </SuperAdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <SuperAdminRoute>
            <ManageUsers />
          </SuperAdminRoute>
        }
      />
    </Routes>
  );
}

function AppFallback() {
  return (
    <div className="loading">
      <div className="spinner"></div> جاري التحميل...
    </div>
  );
}
function App() {
  return (
    <LanguageProvider>
      <Router>
        <AuthProvider>
          {/* ✅ NotificationsProvider لازم يكون جوه AuthProvider عشان ياخد
              userCompanyId و userRole، وبرا AppRoutes عشان Sidebar (اللي
              بيتعرض جوه أي صفحة) يقدر يقرا unreadCount في أي وقت */}
          <NotificationsProvider>
            <Suspense fallback={<AppFallback />}>
              <AppRoutes />
            </Suspense>
          </NotificationsProvider>
        </AuthProvider>
      </Router>
    </LanguageProvider>
  );
}

export default App;
