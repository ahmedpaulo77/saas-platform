// src/components/common/OfflineBanner.jsx — شريط حالة الاتصال
// يظهر فقط عند انقطاع النت: يطمن الكاشير إن الشغل محفوظ محليًا
// وهيتزامن تلقائيًا أول ما النت يرجع (بفضل persistent cache).
import React, { useState, useEffect } from "react";
import { useLanguage } from "../../i18n/LanguageContext.js";

export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine !== false : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export default function OfflineBanner() {
  const { t } = useLanguage();
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 3000,
        background: "#b45309",
        color: "white",
        fontFamily: "Cairo, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
      }}
    >
      <i className="fas fa-wifi" style={{ textDecoration: "line-through" }}></i>
      {t("offline.title")} — {t("offline.desc")}
    </div>
  );
}
