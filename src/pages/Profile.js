// src/pages/Profile.js - تصميم احترافي
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { updatePassword } from "firebase/auth";
import { auth } from "../firebase/config";
import Sidebar from "../components/common/Sidebar";

export default function Profile() {
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
      setError("كلمات المرور غير متطابقة");
      return;
    }
    if (newPassword.length < 6) {
      setError("يجب أن تكون كلمة المرور 6 أحرف على الأقل");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      setMessage("تم تغيير كلمة المرور بنجاح");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError("حدث خطأ: " + e.message);
    }
    setLoading(false);
  }

  const joinDate = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString(
        undefined,
        { year: "numeric", month: "long", day: "numeric" },
      )
    : "غير محدد";

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
              الملف الشخصي
            </h1>
            <p className="subtitle">إدارة معلومات حسابك وأمان كلمة المرور</p>
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
                {userRole === "super_admin" ? "مدير النظام" : "مستخدم"}
              </span>
              <span className="badge badge-active">
                <i className="fas fa-circle" style={{ fontSize: 7 }}></i>
                نشط
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
                  label: "البريد الإلكتروني",
                  value: currentUser?.email,
                },
                {
                  icon: "fas fa-calendar-alt",
                  label: "تاريخ التسجيل",
                  value: joinDate,
                },
                {
                  icon: "fas fa-shield-alt",
                  label: "التحقق من البريد",
                  value: currentUser?.emailVerified ? "مؤكد ✓" : "غير مؤكد",
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
              تغيير كلمة المرور
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
                <label>كلمة المرور الجديدة</label>
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
                <label>تأكيد كلمة المرور</label>
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

              {/* Password strength */}
              {newPassword.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--gray-500)",
                      marginBottom: 6,
                    }}
                  >
                    قوة كلمة المرور:
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          background:
                            newPassword.length >= i * 3
                              ? i <= 1
                                ? "#ef4444"
                                : i === 2
                                  ? "#f59e0b"
                                  : i === 3
                                    ? "#10b981"
                                    : "#6366f1"
                              : "var(--gray-200)",
                          transition: "background 0.3s",
                        }}
                      ></div>
                    ))}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--gray-400)",
                      marginTop: 4,
                    }}
                  >
                    {newPassword.length < 3
                      ? "ضعيفة جداً"
                      : newPassword.length < 6
                        ? "ضعيفة"
                        : newPassword.length < 9
                          ? "متوسطة"
                          : "قوية"}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="btn-primary btn-block"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> جاري الحفظ...
                  </>
                ) : (
                  <>
                    <i className="fas fa-save"></i> حفظ كلمة المرور
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
                تأكد من استخدام كلمة مرور قوية تحتوي على أحرف وأرقام ورموز
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
