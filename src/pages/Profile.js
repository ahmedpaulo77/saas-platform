// src/pages/Profile.js - مع دعم الترجمة
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { updatePassword } from "firebase/auth";
import { auth } from "../firebase/config";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import PasswordStrengthMeter, { getPasswordStrength } from "../components/common/PasswordStrengthMeter";

export default function Profile() {
  const { t } = useLanguage();
  const { currentUser, userRole } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordChange(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmPassword) {
      setError(t("pf.mismatch"));
      return;
    }
    if (newPassword.length < 6) {
      setError(t("pf.short"));
      return;
    }
    const { checks } = getPasswordStrength(newPassword);
    if (!checks.uppercase) {
      setError(t("signup.needUppercase"));
      return;
    }
    if (!checks.symbol) {
      setError(t("signup.needSymbol"));
      return;
    }

    setLoading(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      setMessage(t("pf.ok"));
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(t("pf.err", { msg: e.message }));
    }
    setLoading(false);
  }

  const joinDate = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString(
        undefined,
        { year: "numeric", month: "long", day: "numeric" }
      )
    : t("common.unspecified");

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i
                className="fas fa-user-circle"
                style={{ color: "#6366f1", marginLeft: 10 }}
              ></i>
              {t("pf.title")}
            </h1>
            <p className="subtitle">{t("pf.subtitle")}</p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Profile Card */}
          <div
            className="card"
            style={{ textAlign: "center", padding: "36px 28px" }}
          >
            <div
              style={{
                width: 90,
                height: 90,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 900,
                fontSize: 38,
                margin: "0 auto 20px",
                boxShadow: "0 8px 32px rgba(99,102,241,0.35)",
              }}
            >
              {currentUser?.email?.charAt(0).toUpperCase() || "A"}
            </div>

            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {currentUser?.displayName || currentUser?.email?.split("@")[0]}
            </h2>
            <p
              style={{
                color: "var(--gray-500)",
                fontSize: 14,
                marginBottom: 20,
              }}
            >
              {currentUser?.email}
            </p>

            <div style={{ display: "inline-flex", gap: 8, marginBottom: 24 }}>
              <span
                className={`badge ${userRole === "super_admin" ? "badge-purple" : "badge-info"}`}
              >
                <i
                  className={`fas ${userRole === "super_admin" ? "fa-crown" : "fa-user"}`}
                ></i>
                {userRole === "super_admin" ? t("role.superAdmin") : t("role.user")}
              </span>
              <span className="badge badge-active">
                <i className="fas fa-circle" style={{ fontSize: 7 }}></i>
                {t("status.active")}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                textAlign: "right",
              }}
            >
              {[
                {
                  icon: "fas fa-envelope",
                  label: t("common.email"),
                  value: currentUser?.email,
                },
                {
                  icon: "fas fa-calendar-alt",
                  label: t("pf.join"),
                  value: joinDate,
                },
                {
                  icon: "fas fa-shield-alt",
                  label: t("pf.verified"),
                  value: currentUser?.emailVerified ? t("pf.yes") : t("pf.no"),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "var(--gray-50)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--gray-200)",
                  }}
                >
                  <i
                    className={item.icon}
                    style={{
                      color: "var(--primary)",
                      width: 16,
                      textAlign: "center",
                    }}
                  ></i>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--gray-400)",
                        fontWeight: 600,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--gray-700)",
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Password Change */}
          <div className="card">
            <h3 style={{ marginBottom: 20 }}>
              <i className="fas fa-lock" style={{ color: "#6366f1" }}></i>
              {t("pf.newPass")}
            </h3>

            {message && (
              <div className="alert alert-success">
                <i className="fas fa-check-circle"></i> {message}
              </div>
            )}
            {error && (
              <div className="alert alert-error">
                <i className="fas fa-exclamation-circle"></i> {error}
              </div>
            )}

            <form onSubmit={handlePasswordChange}>
              <div className="form-group">
                <label>{t("pf.newPass")}</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{ paddingLeft: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--gray-400)",
                      padding: 4,
                    }}
                  >
                    <i
                      className={`fas fa-${showNew ? "eye-slash" : "eye"}`}
                    ></i>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>{t("pf.confirm")}</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{ paddingLeft: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--gray-400)",
                      padding: 4,
                    }}
                  >
                    <i
                      className={`fas fa-${showConfirm ? "eye-slash" : "eye"}`}
                    ></i>
                  </button>
                </div>
              </div>

              {newPassword.length > 0 && (
                <PasswordStrengthMeter password={newPassword} />
              )}

              <button
                type="submit"
                className="btn-primary btn-block"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> {t("pf.saving")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-save"></i> {t("pf.savePass")}
                  </>
                )}
              </button>
            </form>

            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: "var(--info-bg)",
                borderRadius: 8,
              }}
            >
              <p style={{ fontSize: 12, color: "var(--info-dark)", margin: 0 }}>
                <i className="fas fa-shield-alt" style={{ marginLeft: 6 }}></i>
                {t("pf.tip")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}