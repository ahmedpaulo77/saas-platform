// src/pages/admin/SuperAdminDashboard.js - تصميم احترافي
import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/common/Sidebar";

export default function SuperAdminDashboard() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    expired: 0,
    trial: 0,
  });
  const { currentUser } = useAuth();

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      const snap = await getDocs(collection(db, "companies"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      let active = 0,
        expired = 0,
        trial = 0;
      data.forEach((c) => {
        const s = c.subscription?.status;
        if (s === "active") active++;
        else if (s === "expired") expired++;
        else if (s === "trial") trial++;
      });
      setCompanies(data);
      setStats({ total: data.length, active, expired, trial });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function updateSubscription(companyId, newStatus) {
    if (
      !window.confirm(
        `تغيير الحالة إلى "${newStatus === "active" ? "نشط" : newStatus === "trial" ? "تجريبي" : "منتهي"}"؟`,
      )
    )
      return;
    try {
      await updateDoc(doc(db, "companies", companyId), {
        "subscription.status": newStatus,
        "subscription.updatedAt": new Date().toISOString(),
      });
      await fetchCompanies();
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteCompany(id) {
    if (!window.confirm("حذف هذه الشركة نهائياً؟ لا يمكن التراجع.")) return;
    try {
      await deleteDoc(doc(db, "companies", id));
      await fetchCompanies();
    } catch (e) {
      console.error(e);
    }
  }

  const filtered = companies.filter((c) => {
    const matchSearch =
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      filterStatus === "all" || c.subscription?.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading)
    return (
      <div className="loading">
        <div className="spinner"></div>جاري التحميل...
      </div>
    );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg,#0f172a,#1e293b)",
            borderRadius: "var(--radius)",
            padding: "24px 28px",
            marginBottom: 28,
            color: "white",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 24 }}>👑</span>
              لوحة تحكم مدير النظام
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
              {currentUser?.email}
            </p>
          </div>
          <span
            className="badge"
            style={{
              background: "rgba(245,158,11,0.2)",
              color: "#fcd34d",
              border: "1px solid rgba(245,158,11,0.3)",
              fontSize: 12,
            }}
          >
            <i className="fas fa-shield-alt" style={{ marginLeft: 6 }}></i>
            Super Admin
          </span>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card indigo">
            <div className="stat-icon">
              <i className="fas fa-building"></i>
            </div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">إجمالي الشركات</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon">
              <i className="fas fa-check-circle"></i>
            </div>
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">اشتراك نشط</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon">
              <i className="fas fa-clock"></i>
            </div>
            <div className="stat-value">{stats.trial}</div>
            <div className="stat-label">فترة تجريبية</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon">
              <i className="fas fa-ban"></i>
            </div>
            <div className="stat-value">{stats.expired}</div>
            <div className="stat-label">اشتراك منتهي</div>
          </div>
        </div>

        {/* Filter */}
        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder="ابحث بالاسم أو البريد الإلكتروني..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="trial">تجريبي</option>
            <option value="expired">منتهي</option>
          </select>
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> قائمة الشركات
            </h3>
            <span className="table-count">{filtered.length} شركة</span>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-building"></i>
                <p>لا توجد شركات مطابقة</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الشركة</th>
                    <th>البريد الإلكتروني</th>
                    <th>الباقة</th>
                    <th>الحالة</th>
                    <th>انتهاء الاشتراك</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((company, i) => (
                    <tr key={company.id}>
                      <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>
                        {i + 1}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {company.name || "غير محدد"}
                      </td>
                      <td style={{ color: "var(--gray-500)" }}>
                        {company.email}
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {company.subscription?.plan === "professional"
                            ? "⚡ احترافي"
                            : company.subscription?.plan === "enterprise"
                              ? "🏢 مؤسسي"
                              : company.subscription?.plan === "starter"
                                ? "🚀 مبتدئ"
                                : company.plan === "monthly"
                                  ? "📅 شهري"
                                  : company.plan === "yearly"
                                    ? "📅 سنوي"
                                    : "تجريبي"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            company.subscription?.status === "active"
                              ? "badge-active"
                              : company.subscription?.status === "trial"
                                ? "badge-trial"
                                : "badge-expired"
                          }`}
                        >
                          {company.subscription?.status === "active"
                            ? "✓ نشط"
                            : company.subscription?.status === "trial"
                              ? "⏱ تجريبي"
                              : "✗ منتهي"}
                        </span>
                      </td>
                      <td style={{ color: "var(--gray-500)", fontSize: 13 }}>
                        {company.subscription?.endDate
                          ? new Date(
                              company.subscription.endDate,
                            ).toLocaleDateString()
                          : "غير محدد"}
                      </td>
                      <td>
                        <div className="table-actions">
                          <select
                            onChange={(e) =>
                              updateSubscription(company.id, e.target.value)
                            }
                            value={company.subscription?.status || "trial"}
                            style={{
                              padding: "5px 10px",
                              borderRadius: "var(--radius-xs)",
                              border: "1px solid var(--gray-200)",
                              fontSize: 12,
                              background: "white",
                              cursor: "pointer",
                              fontFamily: "Cairo, sans-serif",
                            }}
                          >
                            <option value="active">✓ تفعيل</option>
                            <option value="trial">⏱ تجريبي</option>
                            <option value="expired">✗ إلغاء</option>
                          </select>
                          <button
                            onClick={() => deleteCompany(company.id)}
                            className="btn-danger btn-sm"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
