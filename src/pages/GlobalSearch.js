// src/pages/GlobalSearch.js
// بحث موحّد عبر المرضى/المواعيد/الروشتات — بنفس أسلوب باقي التطبيق بالظبط
// (getDocs يجيب كل البيانات المسموحة، والفلترة بتحصل في الفرونت)
import React, { useState, useCallback, useEffect } from "react";
import { getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

export default function GlobalSearch() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const ATTACH_LABELS = { lab: "🧪 تحاليل", xray: "🩻 أشعة", ultrasound: "📡 سونار", other: "📎 أخرى" };

  // ✅ نفس نمط fetchPatients/fetchAppointments اللي عندك أصلاً في باقي الصفحات
  const fetchAll = useCallback(async () => {
    if (!userCompanyId) return;
    setLoading(true);
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [pSnap, aSnap, rSnap, iSnap, atSnap] = await Promise.all([
        getDocs(q("patients")),
        getDocs(q("appointments")),
        getDocs(q("prescriptions")),
        getDocs(q("invoices")),
        getDocs(q("medical_attachments")),
      ]);
      setPatients(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAppointments(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPrescriptions(rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setInvoices(iSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAttachments(atSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ✅ رصيد غير مدفوع وآخر زيارة لكل مريض — محسوبين من نفس البيانات، من غير حقل جديد في الداتابيز
  // (محسوبين جوّه results لكل مريض: unpaid / last)

  const s = searchTerm.trim().toLowerCase();
  const results = !s
    ? []
    : patients
        .filter((p) => {
          const matchesPatient =
            (p.name || "").toLowerCase().includes(s) ||
            (p.phone || "").includes(s);
          const matchesRx = prescriptions.some(
            (r) => r.patientId === p.id && (r.diagnosis || "").toLowerCase().includes(s)
          );
          const matchesAppt = appointments.some(
            (a) => a.patientId === p.id && ((a.doctor || "").toLowerCase().includes(s) || (a.date || "").includes(s))
          );
          const matchesAttach = attachments.some(
            (x) => x.patientId === p.id && ((x.title || "").toLowerCase().includes(s) || (x.notes || "").toLowerCase().includes(s))
          );
          return matchesPatient || matchesRx || matchesAppt || matchesAttach;
        })
        .map((p) => {
          const patAppts = appointments
            .filter((a) => a.patientId === p.id)
            .sort((a, b) => new Date((b.date || "") + "T" + (b.time || "00:00")) - new Date((a.date || "") + "T" + (a.time || "00:00")));
          const patRx = prescriptions
            .filter((r) => r.patientId === p.id)
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          const patInv = invoices
            .filter((i) => i.clientId === p.id || i.patientId === p.id)
            .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
          const patAttach = attachments
            .filter((x) => x.patientId === p.id)
            .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
          return {
            ...p,
            unpaid: patInv.reduce((sum, i) => sum + ((parseFloat(i.amount) || 0) - (parseFloat(i.paidAmount) || 0)), 0),
            paidTotal: patInv.reduce((sum, i) => sum + (parseFloat(i.paidAmount) || 0), 0),
            last: patAppts.find((a) => a.status === "done")?.date || null,
            appts: patAppts,
            rx: patRx,
            inv: patInv,
            attach: patAttach,
          };
        });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <h1>
            <i className="fas fa-search" style={{ color: "#6366f1", marginLeft: 10 }}></i>
            بحث شامل
          </h1>
          <p className="subtitle">دور بالاسم، الهاتف، التشخيص، الدكتور، أو تاريخ الموعد</p>
        </div>

        <div className="search-wrapper" style={{ marginBottom: 20 }}>
          <i className="fas fa-search search-icon"></i>
          <input
            type="text"
            placeholder="اكتب أي حاجة تعرفها عن المريض..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>

        {loading ? (
          <div className="loading"><div className="spinner"></div>{t("common.loading")}</div>
        ) : !s ? (
          <p style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>اكتب حرف واحد على الأقل للبحث</p>
        ) : results.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>مفيش نتائج</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {results.map((p) => {
              const open = expandedId === p.id;
              return (
                <div key={p.id} className="table-container" style={{ margin: 0 }}>
                  <div
                    onClick={() => setExpandedId(open ? null : p.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}
                  >
                    <i className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"}`} style={{ color: "#94a3b8" }}></i>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{p.name}</span>
                    <span style={{ direction: "ltr", color: "#64748b", fontSize: 13 }}>{p.phone}</span>
                    <span style={{ marginRight: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>آخر زيارة: <strong>{p.last || "—"}</strong></span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: p.unpaid > 0 ? "#ef4444" : "#16a34a", background: p.unpaid > 0 ? "#fef2f2" : "#f0fdf4", padding: "2px 10px", borderRadius: 12 }}>
                        {p.unpaid > 0 ? `متبقي ${p.unpaid.toLocaleString()}` : "خالص"}
                      </span>
                    </span>
                  </div>
                  {open && (
                    <div style={{ borderTop: "1px solid #f1f5f9", padding: 16, background: "#fafbff" }}>
                      {/* بيانات المريض */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, fontSize: 13, marginBottom: 14, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
                        <div>🎂 السن: <strong>{p.age || "—"}</strong></div>
                        <div>🩸 الفصيلة: <strong>{p.bloodType || "—"}</strong></div>
                        <div>📋 التاريخ المرضي: <strong>{p.medicalHistory || "—"}</strong></div>
                        <div>⚠️ الحساسية: <strong>{p.allergies || "—"}</strong></div>
                        <div>📍 العنوان: <strong>{p.address || "—"}</strong></div>
                        <div>💰 إجمالي المدفوع: <strong>{p.paidTotal.toLocaleString()} {t("currency")}</strong></div>
                      </div>
                      {/* المواعيد */}
                      <h4 style={{ fontSize: 13, margin: "0 0 6px" }}>📅 المواعيد ({p.appts.length})</h4>
                      {p.appts.length === 0 ? <p style={{ fontSize: 12, color: "#94a3b8" }}>لا توجد مواعيد</p> : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                          {p.appts.map((a) => (
                            <div key={a.id} style={{ fontSize: 12, background: "white", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", display: "flex", gap: 8 }}>
                              <strong>{a.date} {a.time || ""}</strong>
                              <span style={{ color: "#64748b" }}>{a.doctor || ""}</span>
                              <span style={{ marginRight: "auto", color: a.status === "done" ? "#16a34a" : "#b45309", fontWeight: 700 }}>{a.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* الروشتات */}
                      <h4 style={{ fontSize: 13, margin: "0 0 6px" }}>💊 الروشتات ({p.rx.length})</h4>
                      {p.rx.length === 0 ? <p style={{ fontSize: 12, color: "#94a3b8" }}>لا توجد روشتات</p> : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                          {p.rx.map((r) => (
                            <div key={r.id} style={{ fontSize: 12, background: "white", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px" }}>
                              <div><strong>{r.createdAt ? new Date(r.createdAt).toLocaleDateString("ar-EG") : "—"}</strong> <span style={{ color: "#7c3aed" }}>{r.diagnosis || ""}</span></div>
                              {(r.medicines || []).map((m, i) => (
                                <div key={i} style={{ color: "#475569" }}>• {m.name} — {m.dose} — {m.frequency} — {m.duration}</div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* الفواتير */}
                      <h4 style={{ fontSize: 13, margin: "0 0 6px" }}>🧾 الفواتير ({p.inv.length})</h4>
                      {p.inv.length === 0 ? <p style={{ fontSize: 12, color: "#94a3b8" }}>لا توجد فواتير</p> : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                          {p.inv.map((inv) => (
                            <div key={inv.id} style={{ fontSize: 12, background: "white", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", display: "flex", gap: 8 }}>
                              <strong>{inv.date ? new Date(inv.date).toLocaleDateString("ar-EG") : "—"}</strong>
                              <span>الإجمالي: {Number(inv.amount || 0).toLocaleString()}</span>
                              <span style={{ color: "#16a34a" }}>المدفوع: {Number(inv.paidAmount || 0).toLocaleString()}</span>
                              <span style={{ color: "#ef4444", fontWeight: 700 }}>المتبقي: {(Number(inv.amount || 0) - Number(inv.paidAmount || 0)).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* التحاليل والأشعة والسونار */}
                      <h4 style={{ fontSize: 13, margin: "0 0 6px" }}>🔬 التحاليل والأشعة ({p.attach.length})</h4>
                      {p.attach.length === 0 ? <p style={{ fontSize: 12, color: "#94a3b8" }}>لا توجد تحاليل مسجلة — تُسجّل من الملف الطبي في صفحة المرضى</p> : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {p.attach.map((at) => (
                            <div key={at.id} style={{ fontSize: 12, background: "white", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", display: "flex", gap: 8 }}>
                              <span style={{ fontWeight: 800, color: "#7c3aed" }}>{ATTACH_LABELS[at.type] || at.type}</span>
                              <strong>{at.title}</strong>
                              <span style={{ color: "#2563eb", fontWeight: 700 }}>{at.date ? new Date(at.date + "T00:00:00").toLocaleDateString("ar-EG") : "—"}</span>
                              {at.notes && <span style={{ color: "#64748b" }}>— {at.notes}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}