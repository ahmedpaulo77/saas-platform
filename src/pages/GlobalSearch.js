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
  const [loading, setLoading] = useState(true);

  // ✅ نفس نمط fetchPatients/fetchAppointments اللي عندك أصلاً في باقي الصفحات
  const fetchAll = useCallback(async () => {
    if (!userCompanyId) return;
    setLoading(true);
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [pSnap, aSnap, rSnap, iSnap] = await Promise.all([
        getDocs(q("patients")),
        getDocs(q("appointments")),
        getDocs(q("prescriptions")),
        getDocs(q("invoices")),
      ]);
      setPatients(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAppointments(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPrescriptions(rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setInvoices(iSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
  function unpaidBalance(patientId) {
    return invoices
      .filter((i) => i.clientId === patientId || i.patientId === patientId)
      .reduce((s, i) => s + ((parseFloat(i.amount) || 0) - (parseFloat(i.paidAmount) || 0)), 0);
  }
  function lastVisit(patientId) {
    const apps = appointments
      .filter((a) => a.patientId === patientId && a.status === "done")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return apps[0]?.date || null;
  }

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
          return matchesPatient || matchesRx || matchesAppt;
        })
        .map((p) => ({
          ...p,
          unpaid: unpaidBalance(p.id),
          last: lastVisit(p.id),
        }));

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
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>المريض</th>
                  <th>الهاتف</th>
                  <th>آخر زيارة</th>
                  <th>رصيد غير مدفوع</th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{p.name}</td>
                    <td style={{ direction: "ltr" }}>{p.phone}</td>
                    <td>{p.last || "—"}</td>
                    <td style={{ color: p.unpaid > 0 ? "#ef4444" : "#16a34a", fontWeight: 700 }}>
                      {p.unpaid.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}