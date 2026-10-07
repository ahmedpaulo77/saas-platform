// src/components/common/PinModal.jsx - مودال طلب البين كود قبل الإجراءات الحساسة
// يتحقق من PIN المستخدم الحالي نفسه (مقارنة hash) — لا يقبل PIN حد تاني.
import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config.js";
import { useAuth } from "../../context/AuthContext.js";
import { useLanguage } from "../../i18n/LanguageContext.js";
import { verifyPin } from "../../utils/pin.js";

export default function PinModal({ show, title, onClose, onVerified }) {
  const { t } = useLanguage();
  const { currentUser, userCompanyId } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (show) {
      setPin("");
      setError("");
      setChecking(false);
    }
  }, [show]);

  if (!show) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const value = pin.trim();
    if (!value) {
      setError(t("pin.enter"));
      return;
    }
    if (!currentUser?.uid) {
      setError(t("common.errorGeneric"));
      return;
    }
    setChecking(true);
    setError("");
    try {
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      const storedHash = snap.exists() ? snap.data()?.pinHash || "" : "";
      if (!storedHash) {
        setError(t("pin.notSet"));
        setChecking(false);
        return;
      }
      const ok = await verifyPin(value, storedHash, `${userCompanyId}|${currentUser.uid}`);
      if (!ok) {
        setError(t("pin.wrong"));
        setChecking(false);
        return;
      }
      setChecking(false);
      onVerified();
    } catch (err) {
      console.error(err);
      setError(t("common.errorGeneric"));
      setChecking(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-key" style={{ color: "#1e3a8a" }}></i>{" "}
            {title || t("pin.title")}
          </h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: 13 }}>
              {t("pin.hint")}
            </p>
            <div className="form-group">
              <label>
                {t("pin.label")} <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={6}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                style={{ textAlign: "center", fontSize: 22, letterSpacing: 8, fontFamily: "monospace", direction: "ltr" }}
              />
            </div>
            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>
                {error}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={checking}>
              <i className="fas fa-check"></i> {checking ? "..." : t("pin.confirm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
