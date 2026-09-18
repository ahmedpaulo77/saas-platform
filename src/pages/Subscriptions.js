// src/pages/Subscriptions.js - الاشتراكات المتكررة (خدمات/عام/مقاولات) + توليد الفواتير المستحقة
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

const STATUS = {
  active: { label: "🟢 نشط", color: "#16a34a", bg: "#f0fdf4" },
  paused: { label: "⏸️ موقوف", color: "#d97706", bg: "#fffbeb" },
  cancelled: { label: "⛔ ملغي", color: "#dc2626", bg: "#fef2f2" },
};

function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

export default function Subscriptions() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [subs, setSubs] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newSub, setNewSub] = useState({ clientId: "", title: "", amount: "", startDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [adding, setAdding] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) { setLoading(false); return; }
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [sSnap, cSnap] = await Promise.all([getDocs(q("subscriptions")), getDocs(q("clients"))]);
      const data = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.nextDueDate || "") < (b.nextDueDate || "") ? -1 : 1);
      setSubs(data);
      setClients(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function addSubscription(e) {
    e.preventDefault();
    if (!newSub.clientId || !newSub.title.trim() || !newSub.amount || !newSub.startDate) {
      alert(t("common.fillRequired"));
      return;
    }
    setAdding(true);
    try {
      const client = clients.find((c) => c.id === newSub.clientId);
      const docRef = await addDoc(collection(db, "subscriptions"), {
        clientId: newSub.clientId,
        clientName: client?.name || "",
        title: newSub.title.trim(),
        amount: parseFloat(newSub.amount) || 0,
        frequency: "monthly",
        startDate: newSub.startDate,
        nextDueDate: newSub.startDate,
        status: "active",
        notes: newSub.notes || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE", collectionName: "subscriptions", itemId: docRef.id,
        details: `Subscription: ${newSub.title} for ${client?.name || ""}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewSub({ clientId: "", title: "", amount: "", startDate: new Date().toISOString().slice(0, 10), notes: "" });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setAdding(false);
  }

  async function setStatus(sub, status) {
    try {
      await updateDoc(doc(db, "subscriptions", sub.id), { status });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteSub(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "subscriptions", id));
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  // توليد فاتورة للدفعة المستحقة وتقديم الاستحقاق شهر
  async function generateInvoice(sub) {
    setGeneratingId(sub.id);
    try {
      const invRef = await addDoc(collection(db, "invoices"), {
        clientId: sub.clientId,
        products: [],
        amount: parseFloat(sub.amount) || 0,
        paidAmount: 0,
        quantity: 0,
        status: "pending",
        description: `اشتراك: ${sub.title} — استحقاق ${sub.nextDueDate}`,
        dueDate: sub.nextDueDate,
        subscriptionId: sub.id,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "subscriptions", sub.id), {
        nextDueDate: addMonths(sub.nextDueDate, 1),
        lastInvoiceId: invRef.id,
      });
      await logActivity({
        actionType: "CREATE", collectionName: "invoices", itemId: invRef.id,
        details: `Invoice from subscription ${sub.title} (${sub.clientName})`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchAll();
      alert("تم إنشاء الفاتورة وتقديم الاستحقاق شهر");
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setGeneratingId(null);
  }

  const today = new Date().toISOString().slice(0, 10);
  const dueSubs = subs.filter((s) => s.status === "active" && s.nextDueDate <= today);

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
            <h1><i className="fas fa-repeat" style={{ color: "#6366f1", marginLeft: 10 }}></i>الاشتراكات المتكررة</h1>
            <p className="subtitle">عقود شهرية — ولّد الفاتورة بضغطة لما يحين الاستحقاق</p>
          </div>
        </div>

        <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", marginBottom: 20 }}>
          <div className="stat-card green"><div className="stat-icon"><i className="fas fa-check-circle"></i></div><div className="stat-value">{subs.filter((s) => s.status === "active").length}</div><div className="stat-label">نشطة</div></div>
          <div className="stat-card amber"><div className="stat-icon"><i className="fas fa-bell"></i></div><div className="stat-value">{dueSubs.length}</div><div className="stat-label">مستحقة الآن</div></div>
          <div className="stat-card indigo"><div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div><div className="stat-value" style={{ fontSize: 17 }}>{subs.filter((s) => s.status === "active").reduce((s, x) => s + (parseFloat(x.amount) || 0), 0).toLocaleString()}</div><div className="stat-label">إيراد شهري متوقع ({t("currency")})</div></div>
        </div>

        <div className="form-card">
          <h3><i className="fas fa-plus-circle" style={{ color: "#6366f1" }}></i> اشتراك جديد</h3>
          <form onSubmit={addSubscription}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>العميل *</label>
                <select value={newSub.clientId} onChange={(e) => setNewSub({ ...newSub, clientId: e.target.value })} required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white", boxSizing: "border-box" }}>
                  <option value="">— اختر العميل —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>اسم الاشتراك *</label>
                <input type="text" placeholder="مثال: عقد صيانة شهري" value={newSub.title} onChange={(e) => setNewSub({ ...newSub, title: e.target.value })} required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>القيمة الشهرية ({t("currency")}) *</label>
                <input type="number" min="0" step="0.01" placeholder="0" value={newSub.amount} onChange={(e) => setNewSub({ ...newSub, amount: e.target.value })} required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>أول استحقاق *</label>
                <input type="date" value={newSub.startDate} onChange={(e) => setNewSub({ ...newSub, startDate: e.target.value })} required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>
            <input type="text" placeholder="ملاحظات (اختياري)" value={newSub.notes} onChange={(e) => setNewSub({ ...newSub, notes: e.target.value })}
              style={{ width: "100%", marginTop: 12, padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="btn-primary" disabled={adding}>{adding ? "..." : "إضافة الاشتراك"}</button>
            </div>
          </form>
        </div>

        <div className="table-container">
          <div className="table-header"><h3><i className="fas fa-list"></i> الاشتراكات</h3><span>{subs.length}</span></div>
          {subs.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px" }}><p>لا توجد اشتراكات بعد</p></div>
          ) : (
            <table>
              <thead><tr><th>العميل</th><th>الاشتراك</th><th>شهرياً</th><th>الاستحقاق القادم</th><th>الحالة</th><th></th></tr></thead>
              <tbody>
                {subs.map((s) => {
                  const st = STATUS[s.status] || STATUS.active;
                  const isDue = s.status === "active" && s.nextDueDate <= today;
                  return (
                    <tr key={s.id} style={{ background: isDue ? "#fffbeb" : "white" }}>
                      <td style={{ fontWeight: 700 }}>{s.clientName}</td>
                      <td>{s.title}{s.notes && <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.notes}</div>}</td>
                      <td style={{ fontWeight: 700 }}>{Number(s.amount || 0).toLocaleString()} {t("currency")}</td>
                      <td style={{ fontWeight: 700, color: isDue ? "#d97706" : "#475569" }}>{s.nextDueDate || "—"}{isDue && " ⏰"}</td>
                      <td>
                        <select value={s.status} onChange={(e) => setStatus(s, e.target.value)}
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}44`, borderRadius: 12, padding: "4px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          <option value="active">🟢 نشط</option>
                          <option value="paused">⏸️ موقوف</option>
                          <option value="cancelled">⛔ ملغي</option>
                        </select>
                      </td>
                      <td>
                        <div className="table-actions">
                          {isDue && (
                            <button onClick={() => generateInvoice(s)} className="btn-primary btn-sm" disabled={generatingId === s.id} title="إنشاء فاتورة">
                              <i className="fas fa-file-invoice"></i> {generatingId === s.id ? "..." : "فوترة"}
                            </button>
                          )}
                          {userCanDelete && (
                            <button onClick={() => deleteSub(s.id)} className="btn-danger btn-sm"><i className="fas fa-trash"></i></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
