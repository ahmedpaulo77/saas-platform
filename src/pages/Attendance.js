// src/pages/Attendance.js - الحضور والانصراف (تسجيل يومي + كشف شهري)
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function diffHours(inT, outT) {
  if (!inT || !outT) return null;
  const [h1, m1] = inT.split(":").map(Number);
  const [h2, m2] = outT.split(":").map(Number);
  return ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;
}

export default function Attendance() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empName, setEmpName] = useState("");
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [workStart, setWorkStart] = useState("09:00");

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) { setLoading(false); return; }
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [aSnap, uSnap] = await Promise.all([getDocs(q("attendance")), getDocs(q("users"))]);
      const data = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.date || "") > (a.date || "") ? 1 : -1);
      setRecords(data.slice(0, 500));
      setUsers(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const today = todayStr();

  async function checkInOut(e) {
    e.preventDefault();
    const name = empName.trim();
    if (!name) { alert(t("common.fillRequired")); return; }
    setSaving(true);
    try {
      const existing = records.find((r) => r.date === today && r.employeeName === name);
      const time = nowTime();
      if (!existing) {
        const docRef = await addDoc(collection(db, "attendance"), {
          employeeName: name,
          date: today,
          checkIn: time,
          checkOut: "",
          companyId: userCompanyId,
          createdBy: currentUser?.uid || null,
          createdAt: new Date().toISOString(),
        });
        await logActivity({
          actionType: "CREATE", collectionName: "attendance", itemId: docRef.id,
          details: `Check-in: ${name} at ${time}`,
          user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
        });
      } else if (!existing.checkOut) {
        await updateDoc(doc(db, "attendance", existing.id), { checkOut: time });
        await logActivity({
          actionType: "UPDATE", collectionName: "attendance", itemId: existing.id,
          details: `Check-out: ${name} at ${time}`,
          user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
        });
      } else {
        alert("مسجل حضور وانصراف النهاردة خلاص");
        setSaving(false);
        return;
      }
      setEmpName("");
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setSaving(false);
  }

  async function deleteRecord(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "attendance", id));
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  const monthRecords = useMemo(
    () => records.filter((r) => (r.date || "").startsWith(month)),
    [records, month]
  );

  const summary = useMemo(() => {
    const map = {};
    monthRecords.forEach((r) => {
      const m = map[r.employeeName] || { days: 0, late: 0, hours: 0 };
      m.days++;
      if (r.checkIn && r.checkIn > workStart) m.late++;
      const h = diffHours(r.checkIn, r.checkOut);
      if (h != null && h > 0) m.hours += h;
      map[r.employeeName] = m;
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.days - a.days);
  }, [monthRecords, workStart]);

  const todayRecords = useMemo(() => records.filter((r) => r.date === today), [records, today]);

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content"><div className="loading"><div className="spinner"></div>{t("common.loading")}</div></div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1><i className="fas fa-clock" style={{ color: "#2563eb", marginLeft: 10 }}></i>الحضور والانصراف</h1>
            <p className="subtitle">تسجيل يومي — الزرار بيتغير حسب الحالة (حضور ثم انصراف)</p>
          </div>
        </div>

        {/* تسجيل سريع */}
        <div className="form-card">
          <form onSubmit={checkInOut} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>الموظف *</label>
              <input type="text" list="emp-list" placeholder="اكتب الاسم أو اختر..."
                value={empName} onChange={(e) => setEmpName(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
              <datalist id="emp-list">
                {users.map((u) => <option key={u.id} value={u.email} />)}
              </datalist>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              <i className="fas fa-fingerprint"></i> {saving ? "..." : "تسجيل حضور / انصراف"}
            </button>
          </form>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>أول دوسة في اليوم = حضور، التانية = انصراف. الوقت من جهاز الكاشير.</div>
        </div>

        {/* النهاردة */}
        <div className="table-container" style={{ marginBottom: 20 }}>
          <div className="table-header"><h3>النهاردة ({today})</h3><span>{todayRecords.length}</span></div>
          {todayRecords.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}><p>محدش سجل النهاردة لسه</p></div>
          ) : (
            <table>
              <thead><tr><th>الموظف</th><th>حضور</th><th>انصراف</th><th>ساعات</th><th></th></tr></thead>
              <tbody>
                {todayRecords.map((r) => {
                  const h = diffHours(r.checkIn, r.checkOut);
                  const late = r.checkIn && r.checkIn > workStart;
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700 }}>{r.employeeName}</td>
                      <td style={{ fontWeight: 700, color: late ? "#dc2626" : "#16a34a" }}>{r.checkIn || "—"}{late && " ⏰"}</td>
                      <td style={{ fontWeight: 700 }}>{r.checkOut || "—"}</td>
                      <td>{h != null ? h.toFixed(1) : "—"}</td>
                      <td>{userCanDelete && <button onClick={() => deleteRecord(r.id)} className="btn-danger btn-sm"><i className="fas fa-trash"></i></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* الكشف الشهري */}
        <div className="table-container">
          <div className="table-header">
            <h3>الكشف الشهري</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <label style={{ fontSize: 12, color: "#64748b" }}>بداية الدوام:</label>
              <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
            </div>
          </div>
          {summary.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}><p>لا توجد سجلات في الشهر</p></div>
          ) : (
            <table>
              <thead><tr><th>الموظف</th><th>أيام الحضور</th><th>تأخير</th><th>إجمالي الساعات</th></tr></thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td>{s.days}</td>
                    <td style={{ fontWeight: 700, color: s.late > 0 ? "#dc2626" : "#16a34a" }}>{s.late}</td>
                    <td style={{ fontWeight: 700 }}>{s.hours.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
