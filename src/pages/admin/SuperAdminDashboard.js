// src/pages/admin/SuperAdminDashboard.js
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
import { useLanguage } from "../../i18n/LanguageContext";

export default function SuperAdminDashboard() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });
  const { currentUser } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      // جلب الشركات فقط
      const snap = await getDocs(collection(db, "companies"));
      const companiesData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      let active = 0,
        inactive = 0;

      companiesData.forEach((c) => {
        if (c.isActive) active++;
        else inactive++;
      });

      setCompanies(companiesData);
      setStats({
        total: companiesData.length,
        active,
        inactive,
      });
    } catch (e) {
      console.error("Error fetching data:", e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(companyId, currentStatus) {
    const newStatus = !currentStatus;
    if (
      !window.confirm(
        newStatus ? t("sa.confirmActivate") : t("sa.confirmDeactivate")
      )
    )
      return;
    try {
      await updateDoc(doc(db, "companies", companyId), {
        isActive: newStatus,
        // ⚠️ updatedAt كان بيتبعت هنا ومش في allowlist الـ companies update
        // ("name","email","industry","isActive","plan","subscription","logo","address","phone")
        // → permission-denied والخطأ كان متخبّي في console، يعني الزرار
        // كان بيعمل حاجة وبيبان إنه نجح. بقى موجود في الـ allowlist.
        updatedAt: new Date().toISOString(),
      });
      await fetchCompanies();
      alert(newStatus ? t("sa.activated") : t("sa.deactivated"));
    } catch (e) {
      console.error(e);
      // ⚠️ صمت؟ لأ. لازم المستخدم يعرف إن العملية **مanimeشت**
      alert(t("sa.toggleFail") + ": " + (e?.message || "permission denied"));
      await fetchCompanies();
    }
  }

  async function deleteCompany(id) {
    if (!window.confirm(t("sa.confirmDelete"))) return;
    // ⚠️ صمت؟ لأ — الحذف لازم المستخدم يعرف إنه نجح ولا لأ
    try {
      await deleteDoc(doc(db, "companies", id));
      await fetchCompanies();
      alert(t("sa.deleted"));
    } catch (e) {
      console.error(e);
      alert(t("sa.deleteFail") + ": " + (e?.message || "permission denied"));
    }
  }

  const filtered = companies.filter((c) => {
    const matchSearch =
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && c.isActive) ||
      (filterStatus === "inactive" && !c.isActive);
    return matchSearch && matchStatus;
  });

  if (loading)
    return (
      <div className="loading">
        <div className="spinner"></div>{t("common.loading")}
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
              {t("sa.title")}
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
            {t("role.superAdmin")}
          </span>
        </div>

        {/* Stats Row */}
        <div className="stats-row">
          <div className="stat-card indigo">
            <div className="stat-icon">
              <i className="fas fa-building"></i>
            </div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t("sa.total")}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon">
              <i className="fas fa-check-circle"></i>
            </div>
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">{t("sa.active")}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon">
              <i className="fas fa-ban"></i>
            </div>
            <div className="stat-value">{stats.inactive}</div>
            <div className="stat-label">{t("sa.inactive")}</div>
          </div>
        </div>

        {/* Filter */}
        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("sa.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">{t("sa.allStatus")}</option>
            <option value="active">{t("sa.statusActive")}</option>
            <option value="inactive">{t("sa.statusInactive")}</option>
          </select>
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("sa.list")}
            </h3>
            <span className="table-count">{filtered.length} {t("sa.companiesCount")}</span>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-building"></i>
                <p>{t("sa.empty")}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("sa.name")}</th>
                    <th>{t("sa.email")}</th>
                    <th>{t("sa.status")}</th>
                    <th>{t("sa.createdAt")}</th>
                    <th>{t("sa.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((company, i) => (
                    <tr key={company.id}>
                      <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>
                        {i + 1}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {company.name || t("common.unspecified")}
                      </td>
                      <td style={{ color: "var(--gray-500)" }}>
                        {company.email}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            company.isActive ? "badge-active" : "badge-expired"
                          }`}
                        >
                          {company.isActive ? t("sa.statusActive") : t("sa.statusInactive")}
                        </span>
                      </td>
                      <td style={{ color: "var(--gray-500)", fontSize: 13 }}>
                        {company.createdAt
                          ? new Date(company.createdAt).toLocaleDateString()
                          : t("common.unspecified")}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() =>
                              toggleActive(company.id, company.isActive)
                            }
                            className={`btn-sm ${
                              company.isActive
                                ? "btn-secondary"
                                : "btn-primary"
                            }`}
                          >
                            <i
                              className={`fas ${
                                company.isActive
                                  ? "fa-pause-circle"
                                  : "fa-play-circle"
                              }`}
                            ></i>
                            {company.isActive ? t("sa.deactivate") : t("sa.activate")}
                          </button>
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