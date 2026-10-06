// src/pages/Tables.jsx - إدارة الطاولات للمطاعم/الكافيهات
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/PaginationV2.js";
import { useLanguage } from "../i18n/LanguageContext.js";

const STATUS_OPTIONS = [
  { value: "available", label: "🟢 متاح", color: "#16a34a", bg: "#f0fdf4" },
  { value: "occupied", label: "🔴 مشغول", color: "#dc2626", bg: "#fef2f2" },
  { value: "reserved", label: "🟡 محجوز", color: "#d97706", bg: "#fffbeb" },
];

function getStatusConfig(val) {
  return STATUS_OPTIONS.find((s) => s.value === val) || STATUS_OPTIONS[0];
}

export default function Tables() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [newTable, setNewTable] = useState({ number: "", capacity: "", status: "available", location: "" });
  const [editingTable, setEditingTable] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchTables = useCallback(async () => {
    if (!userCompanyId) { setLoading(false); return; }
    try {
      const snap = await getDocs(getScopedQuery("tables", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
      setTables(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  async function addTable(e) {
    e.preventDefault();
    if (!newTable.number.toString().trim()) { alert(t("common.fillRequired")); return; }
    const numStr = String(newTable.number).trim();
    if (tables.some((tb) => String(tb.number) === numStr)) { alert(t("tables.numberExists")); return; }
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, "tables"), {
        number: numStr,
        capacity: parseInt(newTable.capacity) || 0,
        status: newTable.status || "available",
        location: newTable.location.trim() || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({ actionType: "CREATE", collectionName: "tables", itemId: docRef.id, details: `Created table number ${numStr}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      setNewTable({ number: "", capacity: "", status: "available", location: "" });
      await fetchTables();
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
    setSubmitting(false);
  }

  async function updateTable(e) {
    e.preventDefault();
    if (!editingTable.number.toString().trim()) { alert(t("common.fillRequired")); return; }
    const numStr = String(editingTable.number).trim();
    if (tables.some((tb) => String(tb.number) === numStr && tb.id !== editingTable.id)) { alert(t("tables.numberExists")); return; }
    try {
      await updateDoc(doc(db, "tables", editingTable.id), {
        number: numStr,
        capacity: parseInt(editingTable.capacity) || 0,
        status: editingTable.status || "available",
        location: (editingTable.location || "").trim(),
      });
      await logActivity({ actionType: "UPDATE", collectionName: "tables", itemId: editingTable.id, details: `Updated table number ${numStr}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      setShowEditModal(false);
      setEditingTable(null);
      await fetchTables();
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
  }

  async function deleteTable(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      const tb = tables.find((x) => x.id === id);
      const name = tb?.number || id;
      // منع حذف طاولة عليها طلبات نشطة (صالة شغالة)
      if (tb && tb.status === "occupied") {
        const snap = await getDocs(getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid));
        const busy = snap.docs.some((d) => {
          const o = d.data() || {};
          return String(o.tableNumber ?? "") === String(tb.number) &&
            ["new", "preparing", "ready"].includes(o.orderStatus || "new");
        });
        if (busy) { alert(t("tables.deleteBlockedBusy")); return; }
      }
      await deleteDoc(doc(db, "tables", id));
      await logActivity({ actionType: "DELETE", collectionName: "tables", itemId: id, details: `Deleted table number ${name}`, user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId } });
      await fetchTables();
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
  }

  const filtered = tables.filter((tb) => {
    const term = searchTerm.toLowerCase();
    const matchSearch = String(tb.number).toLowerCase().includes(term) || (tb.location && tb.location.toLowerCase().includes(term));
    const matchStatus = filterStatus === "all" || tb.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusCounts = STATUS_OPTIONS.reduce((acc, s) => { acc[s.value] = tables.filter((tb) => tb.status === s.value).length; return acc; }, {});

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
            <h1><i className="fas fa-chair" style={{ color: "#7c3aed", marginLeft: 10 }}></i>{t("tables.title")}</h1>
            <p className="subtitle">{t("tables.subtitle")}</p>
          </div>
        </div>

        <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", marginBottom: 24 }}>
          <div className="stat-card indigo"><div className="stat-icon"><i className="fas fa-chair"></i></div><div className="stat-value">{tables.length}</div><div className="stat-label">{t("tables.title")}</div></div>
          <div className="stat-card green"><div className="stat-icon"><i className="fas fa-check-circle"></i></div><div className="stat-value">{statusCounts.available || 0}</div><div className="stat-label">{STATUS_OPTIONS[0].label}</div></div>
          <div className="stat-card red"><div className="stat-icon"><i className="fas fa-times-circle"></i></div><div className="stat-value">{statusCounts.occupied || 0}</div><div className="stat-label">{STATUS_OPTIONS[1].label}</div></div>
          <div className="stat-card amber"><div className="stat-icon"><i className="fas fa-clock"></i></div><div className="stat-value">{statusCounts.reserved || 0}</div><div className="stat-label">{STATUS_OPTIONS[2].label}</div></div>
        </div>

        <div className="form-card">
          <h3><i className="fas fa-plus-circle" style={{ color: "#7c3aed" }}></i> {t("tables.add")}</h3>
          <form onSubmit={addTable}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("tables.number")} <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="number" min="1" placeholder={t("in.tableNumberPh")} value={newTable.number} onChange={(e) => setNewTable({ ...newTable, number: e.target.value })} required style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("tables.capacity")}</label>
                <input type="number" min="1" placeholder="مثال: 4" value={newTable.capacity} onChange={(e) => setNewTable({ ...newTable, capacity: e.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("common.status")}</label>
                <select value={newTable.status} onChange={(e) => setNewTable({ ...newTable, status: e.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white" }}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("tables.location")}</label>
                <input type="text" placeholder={t("tables.locationPh")} value={newTable.location} onChange={(e) => setNewTable({ ...newTable, location: e.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14 }} />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? t("common.adding") : <><i className="fas fa-plus"></i> {t("tables.add")}</>}</button>
            </div>
          </form>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input type="text" placeholder={t("tables.search")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">{t("common.status")} - الكل</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t("tables.title")}</h3>
            <span>{filtered.length} {t("tables.title")}</span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filtered}
              loading={loading}
              loadingMore={false}
              hasMore={false}
              onLoadMore={() => {}}
              onRefresh={fetchTables}
              pageSize={12}
              empty={<div className="table-empty"><i className="fas fa-chair"></i><p>{searchTerm || filterStatus !== "all" ? t("common.noResults") : t("tables.empty")}</p></div>}
              render={(pageItems) => (
                <table>
                  <thead><tr><th>#</th><th>{t("tables.number")}</th><th>{t("tables.capacity")}</th><th>{t("tables.location")}</th><th>{t("common.status")}</th><th>{t("common.actions")}</th></tr></thead>
                  <tbody>
                    {pageItems.map((tb, idx) => {
                      const st = getStatusConfig(tb.status);
                      return (
                        <tr key={tb.id}>
                          <td style={{ color: "#94a3b8", fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ fontWeight: 800, fontSize: 16 }}><i className="fas fa-chair" style={{ color: "#7c3aed", marginLeft: 6 }}></i>{tb.number}</td>
                          <td>{tb.capacity ? `${tb.capacity} أفراد` : "—"}</td>
                          <td style={{ color: "#64748b" }}>{tb.location || "—"}</td>
                          <td><span style={{ background: st.bg, color: st.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{st.label}</span></td>
                          <td>
                            <div className="table-actions">
                              <button onClick={() => { setEditingTable({ ...tb }); setShowEditModal(true); }} className="btn-secondary btn-sm" title={t("common.edit")}><i className="fas fa-edit"></i></button>
                              {userCanDelete && <button onClick={() => deleteTable(tb.id)} className="btn-danger btn-sm" title={t("common.delete")}><i className="fas fa-trash"></i></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            />
          </div>
        </div>

        {showEditModal && editingTable && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-edit" style={{ color: "#7c3aed" }}></i> {t("tables.editTitle")}</h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
              </div>
              <form onSubmit={updateTable}>
                <div className="modal-body">
                  <div className="form-group"><label>{t("tables.number")} *</label><input type="number" min="1" value={editingTable.number} onChange={(e) => setEditingTable({ ...editingTable, number: e.target.value })} required /></div>
                  <div className="form-group"><label>{t("tables.capacity")}</label><input type="number" min="1" value={editingTable.capacity || ""} onChange={(e) => setEditingTable({ ...editingTable, capacity: e.target.value })} /></div>
                  <div className="form-group"><label>{t("common.status")}</label><select value={editingTable.status} onChange={(e) => setEditingTable({ ...editingTable, status: e.target.value })}><option value="available">🟢 متاح</option><option value="occupied">🔴 مشغول</option><option value="reserved">🟡 محجوز</option></select></div>
                  <div className="form-group"><label>{t("tables.location")}</label><input type="text" value={editingTable.location || ""} onChange={(e) => setEditingTable({ ...editingTable, location: e.target.value })} /></div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>{t("common.cancel")}</button>
                  <button type="submit" className="btn-primary"><i className="fas fa-save"></i> {t("common.save")}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
