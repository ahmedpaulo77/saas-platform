// src/pages/Tickets.js - تذاكر الدعم والمتابعة (مرتبطة بالعميل)
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

const STATUS = {
  open: { label: "🔴 مفتوحة", color: "#dc2626", bg: "#fef2f2" },
  in_progress: { label: "🟡 جارية", color: "#d97706", bg: "#fffbeb" },
  resolved: { label: "🟢 محلولة", color: "#16a34a", bg: "#f0fdf4" },
  closed: { label: "⚪ مغلقة", color: "#64748b", bg: "#f1f5f9" },
};

const PRIORITY = {
  high: { label: "عالية", color: "#dc2626" },
  medium: { label: "متوسطة", color: "#d97706" },
  low: { label: "منخفضة", color: "#64748b" },
};

export default function Tickets() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [tickets, setTickets] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("open_all");
  const [newTicket, setNewTicket] = useState({ clientId: "", subject: "", description: "", priority: "medium" });
  const [adding, setAdding] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) { setLoading(false); return; }
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [tSnap, cSnap] = await Promise.all([getDocs(q("tickets")), getDocs(q("clients"))]);
      const data = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setTickets(data);
      setClients(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function addTicket(e) {
    e.preventDefault();
    if (!newTicket.clientId || !newTicket.subject.trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    setAdding(true);
    try {
      const client = clients.find((c) => c.id === newTicket.clientId);
      const docRef = await addDoc(collection(db, "tickets"), {
        clientId: newTicket.clientId,
        clientName: client?.name || "",
        subject: newTicket.subject.trim(),
        description: newTicket.description || "",
        priority: newTicket.priority || "medium",
        status: "open",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE", collectionName: "tickets", itemId: docRef.id,
        details: `Ticket: ${newTicket.subject} for ${client?.name || ""}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewTicket({ clientId: "", subject: "", description: "", priority: "medium" });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setAdding(false);
  }

  async function setStatus(ticket, status) {
    try {
      await updateDoc(doc(db, "tickets", ticket.id), { status });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteTicket(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "tickets", id));
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  const filtered = tickets.filter((tk) => {
    const term = searchTerm.toLowerCase();
    const matchSearch = !term ||
      (tk.subject || "").toLowerCase().includes(term) ||
      (tk.clientName || "").toLowerCase().includes(term);
    let matchStatus = true;
    if (filterStatus === "open_all") matchStatus = tk.status === "open" || tk.status === "in_progress";
    else if (filterStatus !== "all") matchStatus = tk.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const openCount = tickets.filter((x) => x.status === "open").length;
  const progressCount = tickets.filter((x) => x.status === "in_progress").length;

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
            <h1><i className="fas fa-headset" style={{ color: "#7c3aed", marginLeft: 10 }}></i>تذاكر الدعم</h1>
            <p className="subtitle">شكاوى وطلبات العملاء — من الفتح للحل</p>
          </div>
        </div>

        <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", marginBottom: 20 }}>
          <div className="stat-card red"><div className="stat-icon"><i className="fas fa-exclamation-circle"></i></div><div className="stat-value">{openCount}</div><div className="stat-label">مفتوحة</div></div>
          <div className="stat-card amber"><div className="stat-icon"><i className="fas fa-spinner"></i></div><div className="stat-value">{progressCount}</div><div className="stat-label">جارية</div></div>
          <div className="stat-card green"><div className="stat-icon"><i className="fas fa-check-circle"></i></div><div className="stat-value">{tickets.filter((x) => x.status === "resolved").length}</div><div className="stat-label">محلولة</div></div>
        </div>

        <div className="form-card">
          <h3><i className="fas fa-plus-circle" style={{ color: "#7c3aed" }}></i> تذكرة جديدة</h3>
          <form onSubmit={addTicket}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>العميل *</label>
                <select value={newTicket.clientId} onChange={(e) => setNewTicket({ ...newTicket, clientId: e.target.value })} required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white", boxSizing: "border-box" }}>
                  <option value="">— اختر العميل —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>الأولوية</label>
                <select value={newTicket.priority} onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white", boxSizing: "border-box" }}>
                  <option value="high">عالية</option>
                  <option value="medium">متوسطة</option>
                  <option value="low">منخفضة</option>
                </select>
              </div>
            </div>
            <input type="text" placeholder="عنوان التذكرة * (مثال: عطل في السيستم)" value={newTicket.subject} onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })} required
              style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box", marginBottom: 12 }} />
            <input type="text" placeholder="التفاصيل (اختياري)" value={newTicket.description} onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
              style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="btn-primary" disabled={adding}>{adding ? "..." : "فتح التذكرة"}</button>
            </div>
          </form>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input type="text" placeholder="ابحث بالعنوان أو العميل..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="open_all">المفتوحة والجارية</option>
            <option value="all">الكل</option>
            <option value="open">مفتوحة</option>
            <option value="in_progress">جارية</option>
            <option value="resolved">محلولة</option>
            <option value="closed">مغلقة</option>
          </select>
        </div>

        <div className="table-container">
          <div className="table-header"><h3><i className="fas fa-list"></i> التذاكر</h3><span>{filtered.length}</span></div>
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px" }}><p>{t("common.noResults")}</p></div>
          ) : (
            <table>
              <thead><tr><th>العميل</th><th>الموضوع</th><th>الأولوية</th><th>الحالة</th><th>التاريخ</th><th></th></tr></thead>
              <tbody>
                {filtered.map((tk) => {
                  const st = STATUS[tk.status] || STATUS.open;
                  const pr = PRIORITY[tk.priority] || PRIORITY.medium;
                  return (
                    <tr key={tk.id}>
                      <td style={{ fontWeight: 700 }}>{tk.clientName}</td>
                      <td>{tk.subject}{tk.description && <div style={{ fontSize: 11, color: "#94a3b8" }}>{tk.description}</div>}</td>
                      <td style={{ fontWeight: 700, color: pr.color }}>{pr.label}</td>
                      <td>
                        <select value={tk.status} onChange={(e) => setStatus(tk, e.target.value)}
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}44`, borderRadius: 12, padding: "4px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          <option value="open">🔴 مفتوحة</option>
                          <option value="in_progress">🟡 جارية</option>
                          <option value="resolved">🟢 محلولة</option>
                          <option value="closed">⚪ مغلقة</option>
                        </select>
                      </td>
                      <td style={{ fontSize: 12, color: "#64748b" }}>{tk.createdAt ? new Date(tk.createdAt).toLocaleDateString("ar-EG") : "—"}</td>
                      <td>
                        {userCanDelete && (
                          <button onClick={() => deleteTicket(tk.id)} className="btn-danger btn-sm"><i className="fas fa-trash"></i></button>
                        )}
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
