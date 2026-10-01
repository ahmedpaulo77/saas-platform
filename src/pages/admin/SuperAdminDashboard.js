// src/pages/admin/SuperAdminDashboard.js
import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../firebase/config.js";
import { useAuth } from "../../context/AuthContext.js";
import Sidebar from "../../components/common/Sidebar.js";
import { useLanguage } from "../../i18n/LanguageContext.js";
import { seatStatus, tallyCompany, parseLimitInput } from "../../utils/limits.js";
import { logActivity } from "../../utils/auditLogger.js";
import { fmtDate } from "../../utils/fmt.js";

export default function SuperAdminDashboard() {
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });
  const { currentUser, userRole } = useAuth();
  const { t, locale } = useLanguage();

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      // جلب الشركات + المستخدمين مع بعض: العدّادات على الشاشة بتتحسب من
      // مستندات المستخدمين الحقيقية (مش من العدّاد المخزّن) عشان لو
      // العدّاد اتلخبط نقدر نصحّحه بضغطة.
      const [coSnap, usSnap] = await Promise.all([
        getDocs(collection(db, "companies")),
        getDocs(collection(db, "users")),
      ]);
      const companiesData = coSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const usersData = usSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      let active = 0,
        inactive = 0;

      companiesData.forEach((c) => {
        if (c.isActive) active++;
        else inactive++;
      });

      setCompanies(companiesData);
      setUsers(usersData);
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

  // كل مستخدمي شركة واحدة
  const usersOf = (companyId) =>
    users.filter((u) => u.companyId === companyId && u.role !== "super_admin");

  // ⏳ طلبات الانضمام المعلقة: حسابات عملت شركة جديدة ولسه متوافقش عليها
  // الأحدث أولاً — عشان الجديد يبان فوق
  const pendingUsers = users
    .filter((u) => u.status === "pending")
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const companyNameOf = (companyId) =>
    companies.find((c) => c.id === companyId)?.name || t("common.unspecified");

  // ✅ قبول: تفعيل الحساب — الإيميل "يتعمل" ويقدر يدخل
  async function approveUser(u) {
    if (!window.confirm(t("sa.confirmApprove", { email: u.email }))) return;
    const key = u.id + ":approve";
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await updateDoc(doc(db, "users", u.id), {
        isActive: true,
        status: "approved",
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "users",
        itemId: u.id,
        details: `Approved pending signup: ${u.email}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole },
      });
      await fetchCompanies();
      alert(t("sa.approvedOk"));
    } catch (e) {
      console.error("approve failed:", e);
      alert(t("sa.approveFail") + ": " + (e?.message || "permission denied"));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  // ❌ رفض: مسح نهائي للحساب + مسح شركته لو مفيهاش حد غيره
  // (حساب Firebase Auth نفسه مش بيتمسح من الـ client — بس من غير مستند
  // المستخدم الحساب ميت: لا دخول ولا بيانات، ولو حاول يسجل تاني هيرجع pending)
  async function rejectUser(u) {
    if (!window.confirm(t("sa.confirmReject", { email: u.email }))) return;
    const key = u.id + ":reject";
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const others = users.filter(
        (x) => x.id !== u.id && x.companyId === u.companyId && x.role !== "super_admin"
      );
      await deleteDoc(doc(db, "users", u.id));
      // الشركة دي اتعملت مع الحساب المرفوض ومفيهاش حد تاني → امسحها هي كمان
      if (u.companyId && others.length === 0) {
        await deleteDoc(doc(db, "companies", u.companyId));
      }
      await logActivity({
        actionType: "DELETE",
        collectionName: "users",
        itemId: u.id,
        details: `Rejected pending signup: ${u.email}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole },
      });
      await fetchCompanies();
      alert(t("sa.rejectedOk"));
    } catch (e) {
      console.error("reject failed:", e);
      alert(t("sa.rejectFail") + ": " + (e?.message || "permission denied"));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  /**
   * حفظ سقف واحد.
   * غيّرنا العدّاد المخزّن كمان في نفس الكتابة (batch) — الـ rules بتطلب
   * إن العدّاد يبقى متطابق مع الواقع، وعند lowering السقف تحت العدد الحالي
   * السقف الجديد بيبقى "مكسور" لحد ما ينقص مستخدمين، وده مقصود: بيظهر
   * بالأحمر في الجدول بدل ما نخفي الكسر.
   */
  async function saveLimit(company, role, rawValue) {
    const field = role === "admin" ? "maxAdmins" : "maxUsers";
    const value = parseLimitInput(rawValue);
    const key = company.id + ":" + field;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const live = tallyCompany(company.id, users);
      const patch = { [field]: value, updatedAt: new Date().toISOString() };
      // لو company's counter drifted, fix it while we are here.
      if (live.adminsCount !== company.adminsCount) patch.adminsCount = live.adminsCount;
      if (live.usersCount !== company.usersCount) patch.usersCount = live.usersCount;
      await updateDoc(doc(db, "companies", company.id), patch);
      await logActivity({
        actionType: "UPDATE",
        collectionName: "companies",
        itemId: company.id,
        details: `Set ${field} = ${value} (was ${company[field] || 0}) for ${company.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole },
      });
      setCompanies((prev) =>
        prev.map((c) => (c.id === company.id ? { ...c, ...patch } : c))
      );
    } catch (e) {
      console.error("saveLimit failed:", e);
      alert(t("limits.saveFailed") + ": " + (e.message || e));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  /**
   * إعادة حساب العدّادات من مستندات المستخدمين. مستخدمين إنت أضفتهم
   * من مكان تاني (أو اتحذفوا) العدّاد المخزّن بيكون قديم.
   */
  async function resyncCounters(company) {
    const key = company.id + ":resync";
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const live = tallyCompany(company.id, users);
      await updateDoc(doc(db, "companies", company.id), {
        adminsCount: live.adminsCount,
        usersCount: live.usersCount,
        updatedAt: new Date().toISOString(),
      });
      setCompanies((prev) =>
        prev.map((c) => (c.id === company.id ? { ...c, ...live } : c))
      );
    } catch (e) {
      console.error("resync failed:", e);
      alert(t("limits.saveFailed") + ": " + (e.message || e));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
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

  // 🆕 الترتيب: الأحدث إنشاءً فوق. قبل كند كان getDocs بيرجع بترتيب
  // المستند (doc id) وده عشوائي، فمش كان حد يعرف إيه الجديد.
  // مقارنة ISO strings نصوصية كفاية، وندفع اللي مالهوش تاريخ لآخر
  // القائمة (مش في الأول عشان ما يغطّوش الشركات الجديدة).
  const filtered = companies
    .filter((c) => {
      const matchSearch =
        (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.email || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && c.isActive) ||
        (filterStatus === "inactive" && !c.isActive);
      return matchSearch && matchStatus;
    })
    .slice()
    .sort((a, b) => {
      const at = a.createdAt ? String(a.createdAt) : "";
      const bt = b.createdAt ? String(b.createdAt) : "";
      if (at && bt) return bt.localeCompare(at); // تنازلي = الأحدث فوق
      if (at) return -1; // اللي ليه تاريخ قبل اللي معندوش
      if (bt) return 1;
      return b.id.localeCompare(a.id);
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

        {/* ⏳ طلبات الانضمام المعلقة — حسابات جديدة مستنية قبولك */}
        <div className="table-container" style={{ border: pendingUsers.length > 0 ? "2px solid #f59e0b" : undefined, marginBottom: 28 }}>
          <div className="table-header">
            <h3>
              <i className="fas fa-user-clock" style={{ color: "#f59e0b" }}></i>{" "}
              {t("sa.pendingTitle")}
            </h3>
            <span className="table-count">
              {pendingUsers.length} {t("sa.pendingCount")}
            </span>
          </div>
          <div className="table-wrapper">
            {pendingUsers.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-check-circle"></i>
                <p>{t("sa.noPending")}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("sa.email")}</th>
                    <th>{t("sa.name")}</th>
                    <th>{t("sa.createdAt")}</th>
                    <th>{t("sa.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.map((u, i) => (
                    <tr key={u.id}>
                      <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ fontWeight: 700 }}>{u.email}</td>
                      <td style={{ color: "var(--gray-500)" }}>{companyNameOf(u.companyId)}</td>
                      <td style={{ color: "var(--gray-500)", fontSize: 13, whiteSpace: "nowrap" }}>
                        {u.createdAt ? fmtDate(u.createdAt, locale) : t("common.unspecified")}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => approveUser(u)}
                            disabled={!!saving[u.id + ":approve"] || !!saving[u.id + ":reject"]}
                            className="btn-primary btn-sm"
                          >
                            <i className="fas fa-check"></i> {t("sa.approve")}
                          </button>
                          <button
                            onClick={() => rejectUser(u)}
                            disabled={!!saving[u.id + ":approve"] || !!saving[u.id + ":reject"]}
                            className="btn-danger btn-sm"
                          >
                            <i className="fas fa-times"></i> {t("sa.reject")}
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
                    <th>{t("limits.adminsCol")}</th>
                    <th>{t("limits.usersCol")}</th>
                    <th>{t("sa.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((company, i) => {
                    const live = tallyCompany(company.id, users);
                    const aSeats = seatStatus(company, "admin", live.adminsCount);
                    const uSeats = seatStatus(company, "user", live.usersCount);
                    const drifted =
                      live.adminsCount !== company.adminsCount ||
                      live.usersCount !== company.usersCount;
                    const isOpen = expanded === company.id;
                    return (
                      <React.Fragment key={company.id}>
                        <tr
                          onClick={() => setExpanded(isOpen ? null : company.id)}
                          style={{
                            cursor: "pointer",
                            background: isOpen ? "var(--gray-50, #f8fafc)" : undefined,
                          }}
                        >
                          <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>
                            {i + 1}
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            <i
                              className={`fas ${isOpen ? "fa-chevron-down" : "fa-chevron-left"}`}
                              style={{ marginInlineEnd: 6, fontSize: 11, color: "var(--gray-400)" }}
                            ></i>
                            {company.name || t("common.unspecified")}
                            <div style={{ fontSize: 11, color: "var(--gray-500)", fontWeight: 500 }}>
                              {usersOf(company.id).length} {t("limits.people")}
                            </div>
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
                          <td style={{ color: "var(--gray-500)", fontSize: 13, whiteSpace: "nowrap" }}>
                            {company.createdAt
                              ? fmtDate(company.createdAt, locale)
                              : t("common.unspecified")}
                          </td>

                          {/* ── عمود سقف الأدمن ── */}
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                style={{
                                  fontWeight: 800,
                                  fontSize: 13,
                                  minWidth: 42,
                                  textAlign: "center",
                                  color: aSeats.over
                                    ? "#dc2626"
                                    : aSeats.unlimited
                                    ? "var(--gray-500)"
                                    : aSeats.left === 0
                                    ? "#d97706"
                                    : "#059669",
                                }}
                                title={aSeats.unlimited ? t("limits.unlimited") : `${aSeats.used} / ${aSeats.cap}`}
                              >
                                {aSeats.used}
                                <span style={{ color: "var(--gray-400)" }}> / </span>
                                {aSeats.unlimited ? "∞" : aSeats.cap}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                defaultValue={company.maxAdmins || 0}
                                onBlur={(e) => saveLimit(company, "admin", e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                                placeholder={t("limits.unlimited")}
                                style={{
                                  width: 74,
                                  padding: "5px 8px",
                                  border: "2px solid #e2e8f0",
                                  borderRadius: 7,
                                  fontSize: 13,
                                }}
                              />
                            </div>
                          </td>

                          {/* ── عمود سقف اليوزرز ── */}
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                style={{
                                  fontWeight: 800,
                                  fontSize: 13,
                                  minWidth: 42,
                                  textAlign: "center",
                                  color: uSeats.over
                                    ? "#dc2626"
                                    : uSeats.unlimited
                                    ? "var(--gray-500)"
                                    : uSeats.left === 0
                                    ? "#d97706"
                                    : "#059669",
                                }}
                                title={uSeats.unlimited ? t("limits.unlimited") : `${uSeats.used} / ${uSeats.cap}`}
                              >
                                {uSeats.used}
                                <span style={{ color: "var(--gray-400)" }}> / </span>
                                {uSeats.unlimited ? "∞" : uSeats.cap}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                defaultValue={company.maxUsers || 0}
                                onBlur={(e) => saveLimit(company, "user", e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                                placeholder={t("limits.unlimited")}
                                style={{
                                  width: 74,
                                  padding: "5px 8px",
                                  border: "2px solid #e2e8f0",
                                  borderRadius: 7,
                                  fontSize: 13,
                                }}
                              />
                            </div>
                          </td>

                          <td onClick={(e) => e.stopPropagation()}>
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

                        {/* ── سطر اليوزرز: يظهر لما تدوس على الشركة ── */}
                        {isOpen && (
                          <tr>
                            <td colSpan={8} style={{ background: "#f8fafc", padding: 0 }}>
                              <div style={{ padding: "12px 16px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: 8,
                                    flexWrap: "wrap",
                                    gap: 8,
                                  }}
                                >
                                  <strong style={{ fontSize: 13 }}>
                                    <i className="fas fa-users" style={{ marginInlineEnd: 6 }}></i>
                                    {t("limits.membersOf", { name: company.name || "—" })}
                                  </strong>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    {drifted && (
                                      <button
                                        onClick={() => resyncCounters(company)}
                                        disabled={saving[company.id + ":resync"]}
                                        className="btn-sm"
                                        style={{
                                          background: "#fef3c7",
                                          color: "#92400e",
                                          border: "1px solid #fcd34d",
                                          borderRadius: 7,
                                          fontWeight: 700,
                                          cursor: "pointer",
                                        }}
                                      >
                                        <i className="fas fa-sync-alt"></i> {t("limits.resync")}
                                      </button>
                                    )}
                                    <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
                                      {t("limits.hint")}
                                    </span>
                                  </div>
                                </div>

                                {usersOf(company.id).length === 0 ? (
                                  <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
                                    {t("limits.noMembers")}
                                  </div>
                                ) : (
                                  <table style={{ fontSize: 13 }}>
                                    <thead>
                                      <tr>
                                        <th>{t("common.email")}</th>
                                        <th>{t("limits.role")}</th>
                                        <th>{t("common.date")}</th>
                                        <th>{t("common.status")}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {usersOf(company.id)
                                        .slice()
                                        .sort((a, b) =>
                                          String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
                                        )
                                        .map((u) => (
                                          <tr key={u.id}>
                                            <td style={{ fontWeight: 600 }}>{u.email}</td>
                                            <td>
                                              <span className="badge" style={{ fontSize: 11 }}>
                                                {u.role === "admin"
                                                  ? t("role.admin")
                                                  : u.role === "cashier"
                                                  ? t("role.cashier")
                                                  : u.role === "kitchen"
                                                  ? t("role.kitchen")
                                                  : t("role.user")}
                                              </span>
                                            </td>
                                            <td style={{ color: "var(--gray-500)", fontSize: 12 }}>
                                              {u.createdAt
                                                ? fmtDate(u.createdAt, locale)
                                                : "—"}
                                            </td>
                                            <td>
                                              <span
                                                className={`badge ${
                                                  u.isActive === false ? "badge-expired" : "badge-active"
                                                }`}
                                                style={{ fontSize: 11 }}
                                              >
                                                {u.isActive === false
                                                  ? t("limits.disabled")
                                                  : t("limits.active")}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}