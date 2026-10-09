// src/pages/Holidays.jsx - العطلات الرسمية (موارد بشرية)
// أيام العطلات — لا تُحسب غياباً في الحضور والمرتب
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";

export default function Holidays() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  const fetchHolidays = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const snap = await getDocs(
        getScopedQuery("holidays", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
      setHolidays(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  async function addHoliday(e) {
    e.preventDefault();
    if (!name.trim() || !date) {
      alert(t("common.fillRequired"));
      return;
    }
    if (holidays.some((h) => h.date === date)) {
      alert(t("hol.exists"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "holidays"), {
        name: name.trim(),
        date,
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "holidays",
        itemId: docRef.id,
        details: `Added holiday: ${name.trim()} (${date})`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setName("");
      setDate("");
      await fetchHolidays();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteHoliday(id, label) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "holidays", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "holidays",
        itemId: id,
        details: `Deleted holiday: ${label}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchHolidays();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

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
              <i className="fas fa-flag" style={{ color: "#dc2626", marginLeft: 10 }}></i>
              {t("hol.title")}
            </h1>
            <p className="subtitle">{t("hol.subtitle")}</p>
          </div>
        </div>

        <div className="form-card" style={{ borderTop: "4px solid #dc2626" }}>
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#dc2626" }}></i>
            {" "}{t("hol.add")}
          </h3>
          <form onSubmit={addHoliday}>
            <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("hol.name")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={t("hol.namePh")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("hol.date")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <button type="submit" className="btn-primary">
                <i className="fas fa-plus"></i> {t("hol.add")}
              </button>
            </div>
          </form>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("hol.list")}
            </h3>
            <span className="table-count">{holidays.length}</span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={holidays}
              pageSize={15}
              resetKey=""
              empty={
                <div className="table-empty">
                  <i className="fas fa-flag"></i>
                  <p>{t("hol.empty")}</p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("hol.name")}</th>
                      <th>{t("hol.date")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((h, i) => (
                      <tr key={h.id}>
                        <td>{start + i + 1}</td>
                        <td style={{ fontWeight: 700 }}>🎉 {h.name}</td>
                        <td>{h.date ? new Date(h.date).toLocaleDateString(locale) : "—"}</td>
                        <td>
                          <div className="table-actions">
                            {userCanDelete && (
                              <button
                                onClick={() => deleteHoliday(h.id, `${h.name} (${h.date})`)}
                                className="btn-danger btn-sm"
                                title={t("common.delete")}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            )}
                          </div>
                        </td>
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
