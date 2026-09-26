// src/pages/Buyers.js
import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import { buildViewing, normalizeViewing } from "../utils/contracts";
import Sidebar from "../components/common/Sidebar";
import Pagination from "../components/common/Pagination";
import { useLanguage } from "../i18n/LanguageContext";
import AddBuyerModal from "../components/buyers/AddBuyerModal";

const VIEWING_STATUS = {
  scheduled: { label: "📅 مجدولة", color: "#2563eb", bg: "#eff6ff" },
  done: { label: "✅ تمت", color: "#16a34a", bg: "#f0fdf4" },
  cancelled: { label: "❌ ملغية", color: "#dc2626", bg: "#fef2f2" },
};

export default function Buyers() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // المعاينات
  const [units, setUnits] = useState([]);
  const [viewings, setViewings] = useState([]);
  const [showViewingModal, setShowViewingModal] = useState(false);
  const [viewingBuyer, setViewingBuyer] = useState(null);
  const [viewingForm, setViewingForm] = useState({ sellerId: "", date: "", notes: "" });
  const [addingViewing, setAddingViewing] = useState(false);

  const fetchBuyers = useCallback(async () => {
    try {
      const q = getScopedQuery("buyers", userRole, userCompanyId, currentUser?.uid);
      const snapshot = await getDocs(q);
      setBuyers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching buyers:", error);
      alert(t("errors.fetchBuyers"));
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid, t]);

  const fetchUnitsAndViewings = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const [uSnap, vSnap] = await Promise.all([
        getDocs(getScopedQuery("sellers", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("viewings", userRole, userCompanyId, currentUser?.uid)),
      ]);
      setUnits(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const vData = vSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      vData.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
      setViewings(vData);
    } catch (e) { console.error(e); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchBuyers();
    fetchUnitsAndViewings();
  }, [fetchBuyers, fetchUnitsAndViewings]);

  async function addViewing(e) {
    e.preventDefault();
    if (!viewingBuyer || !viewingForm.sellerId || !viewingForm.date) {
      alert(t("common.fillRequired"));
      return;
    }
    setAddingViewing(true);
    try {
      const unit = units.find((u) => u.id === viewingForm.sellerId);
      const docRef = await addDoc(collection(db, "viewings"), buildViewing({
        buyerId: viewingBuyer.id,
        buyerName: viewingBuyer.name || "",
        // ⚠️ sellerId = الوحدة. وpropertyId = نفس الوحدة عشان صفحة
        //    المعاينات تشوف العقار — قبل كده المستند من هنا كان بيتعرض
        //    في /viewings بعمود عقار فاضي.
        propertyId: unit?.id || "",
        propertyName: unit ? `${unit.name}${unit.project ? ` — ${unit.project}` : ""}` : "",
        unitName: unit ? `${unit.name}${unit.project ? ` — ${unit.project}` : ""}` : "",
        date: viewingForm.date,
        time: viewingForm.time || "00:00",
        status: "scheduled",
        notes: viewingForm.notes || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
      }));
      await logActivity({
        actionType: "CREATE", collectionName: "viewings", itemId: docRef.id,
        details: `Viewing for ${viewingBuyer.name} → ${unit?.name || ""} on ${viewingForm.date}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setShowViewingModal(false);
      setViewingForm({ sellerId: "", date: "", notes: "" });
      setExpandedId(viewingBuyer.id);
      await fetchUnitsAndViewings();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setAddingViewing(false);
  }

  async function setViewingStatus(viewing, status) {
    try {
      await updateDoc(doc(db, "viewings", viewing.id), { status });
      await fetchUnitsAndViewings();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteViewing(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "viewings", id));
      await fetchUnitsAndViewings();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  const handleAdd = async (data) => {
    try {
      await addDoc(collection(db, "buyers"), {
        ...data,
        companyId: userCompanyId,
        createdBy: currentUser?.uid, // ✅ إضافة createdBy
        createdAt: new Date().toISOString(),
      });
      await fetchBuyers();
      alert(t("success.buyerAdded"));
      setShowAddModal(false);
    } catch (error) {
      console.error("Error adding buyer:", error);
      alert(t("errors.addBuyer"));
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      await updateDoc(doc(db, "buyers", id), data);
      await fetchBuyers();
      alert(t("success.buyerUpdated"));
      setEditingBuyer(null);
    } catch (error) {
      console.error("Error updating buyer:", error);
      alert(t("errors.updateBuyer"));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("buyers.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "buyers", id));
      await fetchBuyers();
      alert(t("success.buyerDeleted"));
    } catch (error) {
      console.error("Error deleting buyer:", error);
      alert(t("errors.deleteBuyer"));
    }
  };

  const filtered = buyers.filter(
    (b) =>
      b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.phone?.includes(searchTerm) ||
      b.interest?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.agent?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ✅ التحقق من صلاحية الحذف
  const userCanDelete = canDelete(userRole);

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-users" style={{ color: "#10b981", marginLeft: 10 }}></i>
              {t("buyers.title")}
            </h1>
            <p className="subtitle">{t("buyers.subtitle")}</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <i className="fas fa-plus"></i> {t("buyers.add")}
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder={t("buyers.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "2px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "15px",
              outline: "none",
            }}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <i className="fas fa-user-plus" style={{ color: "#94a3b8" }}></i>
            </div>
            <h3>{t("buyers.empty")}</h3>
            <p>{t("buyers.emptyDesc")}</p>
          </div>
        ) : (
          <div className="table-container">
            <Pagination
              data={filtered}
              pageSize={20}
              resetKey={searchTerm}
              render={(pageItems, total, start) => (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("buyers.name")}</th>
                  <th>{t("buyers.phone")}</th>
                  <th>{t("buyers.interest")}</th>
                  <th>{t("buyers.agent")}</th>
                  <th>{t("buyers.lastCall")}</th>
                  <th>{t("buyers.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((buyer, index) => (
                  <React.Fragment key={buyer.id}>
                    <tr>
                      <td>{start + index + 1}</td>
                      <td><strong>{buyer.name}</strong></td>
                      <td>{buyer.phone || "-"}</td>
                      <td>{buyer.interest || "-"}</td>
                      <td>{buyer.agent || "-"}</td>
                      <td>{buyer.lastCall ? new Date(buyer.lastCall).toLocaleDateString() : "-"}</td>
                      <td>
                        <button
                          onClick={() => setExpandedId(expandedId === buyer.id ? null : buyer.id)}
                          className="btn-secondary btn-sm"
                          style={{ marginLeft: 6 }}
                        >
                          <i className={`fas ${expandedId === buyer.id ? "fa-chevron-up" : "fa-chevron-down"}`}></i>
                        </button>
                        <button
                          onClick={() => { setViewingBuyer(buyer); setViewingForm({ sellerId: "", date: "", notes: "" }); setShowViewingModal(true); }}
                          className="btn-secondary btn-sm"
                          style={{ marginLeft: 6, borderColor: "#6366f1", color: "#6366f1" }}
                          title="حجز معاينة"
                        >
                          <i className="fas fa-calendar-check"></i>
                        </button>
                        <button
                          onClick={() => setEditingBuyer(buyer)}
                          className="btn-secondary btn-sm"
                          style={{ marginLeft: 6 }}
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        {/* ✅ زر الحذف يظهر فقط للأدمن */}
                        {userCanDelete && (
                          <button
                            onClick={() => handleDelete(buyer.id)}
                            className="btn-danger btn-sm"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === buyer.id && (
                      <tr>
                        <td colSpan="7">
                          <div style={styles.expandedRow}>
                            <div style={styles.expandedGrid}>
                              <div><strong>{t("buyers.followUp1")}:</strong> {buyer.followUp1 || "-"}</div>
                              <div><strong>{t("buyers.followUp2")}:</strong> {buyer.followUp2 || "-"}</div>
                              <div><strong>{t("buyers.followUp3")}:</strong> {buyer.followUp3 || "-"}</div>
                              <div><strong>{t("buyers.lastCall")}:</strong> {buyer.lastCall ? new Date(buyer.lastCall).toLocaleString() : "-"}</div>
                            </div>
                            {/* المعاينات */}
                            <div style={{ marginTop: 12 }}>
                              <strong>🏠 المعاينات ({viewings.filter((v) => v.buyerId === buyer.id).length}):</strong>
                              {viewings.filter((v) => v.buyerId === buyer.id).length === 0 ? (
                                <span style={{ color: "#94a3b8", fontSize: 12 }}> لا توجد معاينات — احجز من زرار 📅</span>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                                  {viewings.filter((v) => v.buyerId === buyer.id).map((v) => {
                                    const st = VIEWING_STATUS[v.status] || VIEWING_STATUS.scheduled;
                                    return (
                                      <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
                                        <span style={{ fontWeight: 700 }}>{v.unitName}</span>
                                        <span style={{ color: "#64748b" }}>📅 {v.date ? new Date(v.date).toLocaleDateString("ar-EG") : "—"}</span>
                                        {v.notes && <span style={{ color: "#94a3b8" }}>— {v.notes}</span>}
                                        <select value={v.status} onChange={(e) => setViewingStatus(v, e.target.value)}
                                          style={{ marginRight: "auto", background: st.bg, color: st.color, border: `1px solid ${st.color}44`, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                          <option value="scheduled">📅 مجدولة</option>
                                          <option value="done">✅ تمت</option>
                                          <option value="cancelled">❌ ملغية</option>
                                        </select>
                                        {userCanDelete && (
                                          <button onClick={() => deleteViewing(v.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>✕</button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
              )}
            />
          </div>
        )}
      </div>

      {showAddModal && (
        <AddBuyerModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAdd}
          t={t}
        />
      )}

      {editingBuyer && (
        <AddBuyerModal
          buyer={editingBuyer}
          onClose={() => setEditingBuyer(null)}
          onSave={(data) => handleUpdate(editingBuyer.id, data)}
          t={t}
        />
      )}

      {/* مودال حجز معاينة */}
      {showViewingModal && viewingBuyer && (
        <div className="modal-overlay" onClick={() => setShowViewingModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-calendar-check" style={{ color: "#6366f1" }}></i> حجز معاينة — {viewingBuyer.name}</h3>
              <button className="modal-close" onClick={() => setShowViewingModal(false)}>×</button>
            </div>
            <form onSubmit={addViewing}>
              <div className="modal-body">
                <div className="form-group">
                  <label>الوحدة *</label>
                  <select value={viewingForm.sellerId} onChange={(e) => setViewingForm({ ...viewingForm, sellerId: e.target.value })} required>
                    <option value="">— اختر الوحدة —</option>
                    {units.filter((u) => (u.unitStatus || "available") !== "sold").map((u) => (
                      <option key={u.id} value={u.id}>{u.name}{u.project ? ` — ${u.project}` : ""} ({u.unitStatus === "reserved" ? "محجوزة" : "متاحة"})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>التاريخ *</label>
                  <input type="date" value={viewingForm.date} onChange={(e) => setViewingForm({ ...viewingForm, date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>ملاحظات</label>
                  <input type="text" placeholder="اختياري" value={viewingForm.notes} onChange={(e) => setViewingForm({ ...viewingForm, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowViewingModal(false)}>{t("common.cancel")}</button>
                <button type="submit" className="btn-primary" disabled={addingViewing}>{addingViewing ? "..." : "تأكيد الحجز"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  expandedRow: {
    padding: "16px 20px",
    background: "#f8fafc",
    borderRadius: "8px",
  },
  expandedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "10px",
  },
};