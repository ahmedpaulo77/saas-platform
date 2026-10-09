// src/pages/HrSettings.jsx - إعدادات الحضور (موارد بشرية)
// مستند واحد لكل شركة (id = companyId): أيام الإجازة الأسبوعية + سماحية التأخير + قواعد الإضافي
// التعديل للأدمن فقط — باقي الأدوار قراءة
import React, { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";

const DEFAULTS = { weeklyOffDays: [5], lateGraceMin: 15, overtimeEnabled: true, overtimeRate: 1.5 };

export default function HrSettings() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(DEFAULTS);

  const fetchSettings = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "hr_settings", userCompanyId));
      if (snap.exists()) {
        const d = snap.data() || {};
        setForm({
          weeklyOffDays: Array.isArray(d.weeklyOffDays) ? d.weeklyOffDays.filter((x) => x >= 0 && x <= 6) : [...DEFAULTS.weeklyOffDays],
          lateGraceMin: Math.max(0, parseInt(d.lateGraceMin) || 0),
          overtimeEnabled: d.overtimeEnabled !== false,
          overtimeRate: parseFloat(d.overtimeRate) > 0 ? parseFloat(d.overtimeRate) : DEFAULTS.overtimeRate,
        });
      } else {
        setForm({ ...DEFAULTS, weeklyOffDays: [...DEFAULTS.weeklyOffDays] });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userCompanyId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function toggleDay(day) {
    setForm((prev) => ({
      ...prev,
      weeklyOffDays: prev.weeklyOffDays.includes(day)
        ? prev.weeklyOffDays.filter((d) => d !== day)
        : [...prev.weeklyOffDays, day].sort(),
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!isAdmin || !userCompanyId) return;
    setSaving(true);
    try {
      const payload = {
        weeklyOffDays: [...form.weeklyOffDays].sort(),
        lateGraceMin: Math.max(0, parseInt(form.lateGraceMin) || 0),
        overtimeEnabled: !!form.overtimeEnabled,
        overtimeRate: parseFloat(form.overtimeRate) > 0 ? parseFloat(form.overtimeRate) : 1,
        companyId: userCompanyId,
        updatedBy: currentUser?.uid || null,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "hr_settings", userCompanyId), payload, { merge: true });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "hr_settings",
        itemId: userCompanyId,
        details: "Updated attendance settings",
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      alert(t("hrset.saved"));
      await fetchSettings();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setSaving(false);
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
              <i className="fas fa-gear" style={{ color: "#0f172a", marginLeft: 10 }}></i>
              {t("hrset.title")}
            </h1>
            <p className="subtitle">{t("hrset.subtitle")}</p>
          </div>
        </div>

        {!isAdmin && (
          <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", borderRadius: 12, padding: "10px 16px", marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
            {t("hrset.adminOnly")}
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="form-card">
            <h3>
              <i className="fas fa-calendar-week" style={{ color: "#1e3a8a" }}></i>
              {" "}{t("hrset.weekoff")}
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const on = form.weeklyOffDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => toggleDay(d)}
                    style={{
                      padding: "8px 18px",
                      fontSize: 13,
                      fontWeight: 800,
                      borderRadius: 20,
                      cursor: isAdmin ? "pointer" : "default",
                      border: `2px solid ${on ? "#1e3a8a" : "#e2e8f0"}`,
                      background: on ? "#1e3a8a" : "white",
                      color: on ? "white" : "#64748b",
                    }}
                  >
                    {t(`hrset.day${d}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-card">
            <h3>
              <i className="fas fa-stopwatch" style={{ color: "#b45309" }}></i>
              {" "}{t("hrset.grace")}
            </h3>
            <input
              type="number"
              min="0"
              step="1"
              value={form.lateGraceMin}
              disabled={!isAdmin}
              onChange={(e) => setForm({ ...form, lateGraceMin: e.target.value })}
              style={{ width: 140, textAlign: "center" }}
            />
          </div>

          <div className="form-card">
            <h3>
              <i className="fas fa-business-time" style={{ color: "#059669" }}></i>
              {" "}{t("hrset.otEnabled")}
            </h3>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: isAdmin ? "pointer" : "default" }}>
                <input
                  type="checkbox"
                  checked={!!form.overtimeEnabled}
                  disabled={!isAdmin}
                  onChange={(e) => setForm({ ...form, overtimeEnabled: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: "#059669" }}
                />
                {t("hrset.otEnabled")}
              </label>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("hrset.otRate")}
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.25"
                  value={form.overtimeRate}
                  disabled={!isAdmin}
                  onChange={(e) => setForm({ ...form, overtimeRate: e.target.value })}
                  style={{ width: 120, textAlign: "center" }}
                />
              </div>
            </div>
          </div>

          {isAdmin && (
            <button type="submit" className="btn-primary" disabled={saving}>
              <i className="fas fa-save"></i> {saving ? "..." : t("common.save")}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
