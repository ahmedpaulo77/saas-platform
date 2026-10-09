// src/pages/HrLog.jsx - سجل العمليات (موارد بشرية)
// مين غيّر إيه في الحضور والمرتبات — لشركتك فقط، بدون مبالغ
import React, { useState, useEffect, useCallback } from "react";
import { getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { HR_ENTITIES } from "../utils/hrAudit.js";

const ACTION_STYLE = {
  create: { background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac" },
  approve: { background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac" },
  checkin: { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #93c5fd" },
  checkout: { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #93c5fd" },
  save: { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #93c5fd" },
  update: { background: "#fffbeb", color: "#b45309", border: "1px solid #fcd34d" },
  reject: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" },
};

export default function HrLog() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");

  const fetchLogs = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const snap = await getDocs(
        getScopedQuery("hr_audit", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setLogs(data.slice(0, 500));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function entityLabel(entity) {
    const key = `hrlog.ent.${entity}`;
    const v = t(key);
    return v === key ? (entity || "—") : v;
  }

  function actionLabel(action) {
    const key = `hrlog.act.${action}`;
    const v = t(key);
    return v === key ? (action || "—") : v;
  }

  const filtered = logs.filter((l) => {
    if (entityFilter !== "all" && (l.entity || "") !== entityFilter) return false;
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return (
      (l.byEmail || "").toLowerCase().includes(s) ||
      (l.employeeName || "").toLowerCase().includes(s)
    );
  });

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-clock-rotate-left" style={{ color: "#0f172a", marginLeft: 10 }}></i>
              {t("hrlog.title")}
            </h1>
            <p className="subtitle">{t("hrlog.subtitle")}</p>
          </div>
          <button onClick={fetchLogs} className="btn-secondary btn-sm">
            <i className="fas fa-rotate"></i>
          </button>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("hrlog.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="all">{t("hrlog.allEntities")}</option>
            {HR_ENTITIES.map((en) => (
              <option key={en} value={en}>{entityLabel(en)}</option>
            ))}
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("hrlog.list")}
            </h3>
            <span className="table-count">{filtered.length}</span>
          </div>
          <div className="table-wrapper" style={{ overflowX: "auto" }}>
            <Pagination
              data={filtered}
              pageSize={20}
              resetKey={`${searchTerm}-${entityFilter}`}
              empty={
                <div className="table-empty">
                  <i className="fas fa-clock-rotate-left"></i>
                  <p>{t("hrlog.empty")}</p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("sa.colTime")}</th>
                      <th>{t("sa.colUser")}</th>
                      <th>{t("emp.name")}</th>
                      <th>{t("sa.colAction")}</th>
                      <th>{t("sa.colEntity")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((l, i) => (
                      <tr key={l.id}>
                        <td>{start + i + 1}</td>
                        <td style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                          {String(l.createdAt || "").slice(0, 16).replace("T", " ")}
                        </td>
                        <td style={{ fontSize: 13 }}>{l.byEmail || "—"}</td>
                        <td style={{ fontWeight: 700 }}>{l.employeeName || "—"}</td>
                        <td>
                          <span
                            className="badge"
                            style={ACTION_STYLE[l.action] || { background: "#f1f5f9", color: "#475569" }}
                          >
                            {actionLabel(l.action)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{entityLabel(l.entity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
