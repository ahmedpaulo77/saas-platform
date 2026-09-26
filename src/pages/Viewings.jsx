// src/pages/Viewings.jsx - Real Estate property viewings
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import { buildViewing, normalizeViewing, viewingDate } from "../utils/contracts";
import Sidebar from "../components/common/Sidebar";
import Pagination from "../components/common/Pagination";
import { useLanguage } from "../i18n/LanguageContext";

const STATUS_BADGES = {
  scheduled: { bg: "#dbeafe", color: "#1d4ed8", label: "مجدولة" },
  done: { bg: "#dcfce7", color: "#15803d", label: "تمت" },
  cancelled: { bg: "#fee2e2", color: "#b91c1c", label: "ملغية" },
};

export default function Viewings() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();

  const [viewings, setViewings] = useState([]);
  const [properties, setProperties] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [newViewing, setNewViewing] = useState({
    propertyId: "",
    clientId: "",
    date: "",
    time: "",
    status: "scheduled",
    notes: "",
  });

  const [editingViewing, setEditingViewing] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchViewings = useCallback(async () => {
    try {
      const snap = await getDocs(
        getScopedQuery("viewings", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...normalizeViewing(d.data()) }));
      // ⚠️ المقارن القديم كان بيعمل new Date("" + "T" + "00:00") لو
      // السجل ناقص date → Invalid Date → الطرح = NaN → الترتيب كله عشوائي.
      // viewingDate بيرجّع null، والمفقودين في الآخر (غير مرتبين بس ما بيبوظش)
      data.sort((a, b) => {
        const ad = viewingDate(a);
        const bd = viewingDate(b);
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return ad - bd;
      });
      setViewings(data);
    } catch (e) {
      console.error("Error fetching viewings:", e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchProperties = useCallback(async () => {
    try {
      const snap = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // For real_estate industry inventory represents properties; show all for selection
      setProperties(data);
    } catch (e) {
      console.error("Error fetching properties:", e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchClients = useCallback(async () => {
    try {
      const [buyersSnap, sellersSnap] = await Promise.all([
        getDocs(getScopedQuery("buyers", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("sellers", userRole, userCompanyId, currentUser?.uid)),
      ]);
      const buyers = buyersSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || "—",
        phone: d.data().phone || "",
        type: "buyer",
        raw: d.data(),
      }));
      const sellers = sellersSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || "—",
        phone: d.data().phone || "",
        type: "seller",
        raw: d.data(),
      }));
      setClients([...buyers, ...sellers]);
    } catch (e) {
      console.error("Error fetching clients:", e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchViewings();
    fetchProperties();
    fetchClients();
  }, [fetchViewings, fetchProperties, fetchClients]);

  function getPropertyName(propertyId) {
    const p = properties.find((x) => x.id === propertyId);
    return p ? p.name : propertyId;
  }

  function getClientName(clientId) {
    const c = clients.find((x) => x.id === clientId);
    return c ? c.name : clientId;
  }

  async function addViewing(e) {
    e.preventDefault();
    if (!newViewing.propertyId || !newViewing.clientId || !newViewing.date || !newViewing.time) {
      alert(t("common.fillRequired") || "Please fill required fields");
      return;
    }
    if (!userCompanyId) {
      alert(t("common.errorGeneric") || "Missing company");
      return;
    }
    try {
      const property = properties.find((p) => p.id === newViewing.propertyId);
      const client = clients.find((c) => c.id === newViewing.clientId);
      const docRef = await addDoc(collection(db, "viewings"), buildViewing({
        propertyId: newViewing.propertyId,
        propertyName: property?.name || "",
        clientId: newViewing.clientId,
        clientName: client?.name || "",
        clientType: client?.type || "",
        date: newViewing.date,
        time: newViewing.time,
        status: newViewing.status || "scheduled",
        notes: newViewing.notes || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
      }));
      await logActivity({
        actionType: "CREATE",
        collectionName: "viewings",
        itemId: docRef.id,
        details: `Created viewing: ${property?.name || newViewing.propertyId} for ${client?.name || newViewing.clientId} on ${newViewing.date} ${newViewing.time}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewViewing({ propertyId: "", clientId: "", date: "", time: "", status: "scheduled", notes: "" });
      await fetchViewings();
      alert(t("common.addOk") || "Viewing added");
    } catch (error) {
      console.error("Error adding viewing:", error);
      alert(t("common.errorGeneric") || "Failed to add viewing");
    }
  }

  function openEdit(viewing) {
    setEditingViewing({ ...viewing });
    setShowEditModal(true);
  }

  function closeEdit() {
    setEditingViewing(null);
    setShowEditModal(false);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editingViewing.propertyId || !editingViewing.clientId || !editingViewing.date || !editingViewing.time) {
      alert(t("common.fillRequired") || "Please fill required fields");
      return;
    }
    try {
      const property = properties.find((p) => p.id === editingViewing.propertyId);
      const client = clients.find((c) => c.id === editingViewing.clientId);
      await updateDoc(doc(db, "viewings", editingViewing.id), {
        property: editingViewing.propertyId,
        propertyId: editingViewing.propertyId,
        propertyName: property?.name || editingViewing.propertyName || "",
        client: editingViewing.clientId,
        clientId: editingViewing.clientId,
        clientName: client?.name || editingViewing.clientName || "",
        clientType: client?.type || editingViewing.clientType || "",
        date: editingViewing.date,
        time: editingViewing.time,
        status: editingViewing.status,
        notes: editingViewing.notes || "",
        updatedAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "viewings",
        itemId: editingViewing.id,
        details: `Updated viewing: ${property?.name || editingViewing.propertyId} status ${editingViewing.status}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      closeEdit();
      await fetchViewings();
      alert(t("common.updOk") || "Viewing updated");
    } catch (error) {
      console.error("Error updating viewing:", error);
      alert(t("common.errorGeneric") || "Failed to update");
    }
  }

  async function delViewing(id) {
    if (!window.confirm(t("common.confirmDelete") || "Delete this viewing?")) return;
    try {
      await deleteDoc(doc(db, "viewings", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "viewings",
        itemId: id,
        details: "Deleted viewing",
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchViewings();
      alert(t("common.delOk") || "Deleted");
    } catch (error) {
      console.error("Error deleting viewing:", error);
      alert(t("common.errorGeneric") || "Failed to delete");
    }
  }

  const filtered = viewings.filter((v) => {
    const s = searchTerm.toLowerCase();
    const propertyLabel = (v.propertyName || getPropertyName(v.propertyId || v.property) || "").toLowerCase();
    const clientLabel = (v.clientName || getClientName(v.clientId || v.client) || "").toLowerCase();
    const matchesSearch =
      !s ||
      propertyLabel.includes(s) ||
      clientLabel.includes(s) ||
      (v.notes || "").toLowerCase().includes(s) ||
      (v.date || "").includes(s);
    const matchesStatus = statusFilter === "all" || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>
            {t("common.loading") || "Loading..."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div
          style={{
            background: "linear-gradient(135deg,#7c3aed,#2563eb)",
            borderRadius: "var(--radius)",
            padding: "20px 24px",
            marginBottom: 20,
            color: "white",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            🏠 {t("viewings.title") || "المعاينات العقارية"}
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "rgba(255,255,255,0.8)", fontSize: 14 }}>
            {t("viewings.subtitle") || "إدارة معاينات العقارات للعملاء"}
          </p>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>
            <i className="fas fa-plus-circle"></i> {t("viewings.add") || "إضافة معاينة"}
          </h3>
          <form onSubmit={addViewing}>
            <div style={styles.grid}>
              <select
                value={newViewing.propertyId}
                onChange={(e) => setNewViewing({ ...newViewing, propertyId: e.target.value })}
                style={styles.input}
                required
              >
                <option value="">{t("viewings.chooseProperty") || "اختر العقار"}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.category ? `(${p.category})` : ""} {p.price ? `- ${Number(p.price).toLocaleString()} EGP` : ""}
                  </option>
                ))}
              </select>

              <select
                value={newViewing.clientId}
                onChange={(e) => setNewViewing({ ...newViewing, clientId: e.target.value })}
                style={styles.input}
                required
              >
                <option value="">{t("viewings.chooseClient") || "اختر العميل"}</option>
                {clients.map((c) => (
                  <option key={`${c.type}-${c.id}`} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""} — {c.type === "buyer" ? "مشتري" : "بائع"}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={newViewing.date}
                onChange={(e) => setNewViewing({ ...newViewing, date: e.target.value })}
                style={styles.input}
                required
              />
              <input
                type="time"
                value={newViewing.time}
                onChange={(e) => setNewViewing({ ...newViewing, time: e.target.value })}
                style={styles.input}
                required
              />
              <select
                value={newViewing.status}
                onChange={(e) => setNewViewing({ ...newViewing, status: e.target.value })}
                style={styles.input}
              >
                <option value="scheduled">مجدولة</option>
                <option value="done">تمت</option>
                <option value="cancelled">ملغية</option>
              </select>
              <textarea
                placeholder={t("viewings.phNotes") || "ملاحظات"}
                value={newViewing.notes}
                onChange={(e) => setNewViewing({ ...newViewing, notes: e.target.value })}
                style={{ ...styles.input, gridColumn: "1 / -1", minHeight: 60 }}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ marginTop: 16 }}>
              <i className="fas fa-plus"></i> {t("common.add") || "إضافة"}
            </button>
          </form>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("viewings.search") || "بحث بالعقار أو العميل..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">{t("common.all") || "الكل"}</option>
            <option value="scheduled">مجدولة</option>
            <option value="done">تمت</option>
            <option value="cancelled">ملغية</option>
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("viewings.list") || "قائمة المعاينات"}
            </h3>
            <span className="table-count">{filtered.length}</span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filtered}
              pageSize={20}
              resetKey={`${searchTerm}-${statusFilter}`}
              empty={
                <div className="table-empty">
                  <i className="fas fa-eye-slash"></i>
                  <p>{searchTerm || statusFilter !== "all" ? t("common.emptySearch") || "لا توجد نتائج" : t("viewings.empty") || "لا توجد معاينات"}</p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("viewings.property") || "العقار"}</th>
                      <th>{t("viewings.client") || "العميل"}</th>
                      <th>{t("viewings.date") || "التاريخ"}</th>
                      <th>{t("viewings.time") || "الوقت"}</th>
                      <th>{t("viewings.status") || "الحالة"}</th>
                      <th>{t("viewings.notes") || "ملاحظات"}</th>
                      <th>{t("common.actions") || "إجراءات"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((v, i) => {
                      const badge = STATUS_BADGES[v.status] || STATUS_BADGES.scheduled;
                      return (
                        <tr key={v.id}>
                          <td>{start + i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{v.propertyName || getPropertyName(v.propertyId || v.property) || "—"}</td>
                          <td>{v.clientName || getClientName(v.clientId || v.client) || "—"}</td>
                          <td>{v.date || "—"}</td>
                          <td style={{ fontWeight: 700, color: "#2563eb" }}>{v.time || "—"}</td>
                          <td>
                            <span
                              className="badge"
                              style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33` }}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {v.notes || "—"}
                          </td>
                          <td>
                            <div className="table-actions">
                              <button onClick={() => openEdit(v)} className="btn-sm btn-secondary">
                                <i className="fas fa-edit"></i>
                              </button>
                              <button onClick={() => delViewing(v.id)} className="btn-danger btn-sm">
                                <i className="fas fa-trash"></i>
                              </button>
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

        {showEditModal && editingViewing && (
          <div className="modal-backdrop" onClick={closeEdit}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
              <div className="modal-header">
                <h3>{t("viewings.editTitle") || "تعديل المعاينة"}</h3>
                <button className="modal-close" onClick={closeEdit}>
                  &times;
                </button>
              </div>
              <form onSubmit={saveEdit}>
                <div style={styles.grid}>
                  <select
                    value={editingViewing.propertyId || editingViewing.property || ""}
                    onChange={(e) =>
                      setEditingViewing({ ...editingViewing, propertyId: e.target.value, property: e.target.value })
                    }
                    style={styles.input}
                    required
                  >
                    <option value="">{t("viewings.chooseProperty") || "اختر العقار"}</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.category ? `(${p.category})` : ""}
                      </option>
                    ))}
                  </select>
                  <select
                    value={editingViewing.clientId || editingViewing.client || ""}
                    onChange={(e) =>
                      setEditingViewing({ ...editingViewing, clientId: e.target.value, client: e.target.value })
                    }
                    style={styles.input}
                    required
                  >
                    <option value="">{t("viewings.chooseClient") || "اختر العميل"}</option>
                    {clients.map((c) => (
                      <option key={`${c.type}-${c.id}`} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""} — {c.type === "buyer" ? "مشتري" : "بائع"}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={editingViewing.date || ""}
                    onChange={(e) => setEditingViewing({ ...editingViewing, date: e.target.value })}
                    style={styles.input}
                    required
                  />
                  <input
                    type="time"
                    value={editingViewing.time || ""}
                    onChange={(e) => setEditingViewing({ ...editingViewing, time: e.target.value })}
                    style={styles.input}
                    required
                  />
                  <select
                    value={editingViewing.status || "scheduled"}
                    onChange={(e) => setEditingViewing({ ...editingViewing, status: e.target.value })}
                    style={styles.input}
                  >
                    <option value="scheduled">مجدولة</option>
                    <option value="done">تمت</option>
                    <option value="cancelled">ملغية</option>
                  </select>
                  <textarea
                    placeholder={t("viewings.phNotes") || "ملاحظات"}
                    value={editingViewing.notes || ""}
                    onChange={(e) => setEditingViewing({ ...editingViewing, notes: e.target.value })}
                    style={{ ...styles.input, gridColumn: "1 / -1", minHeight: 60 }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                  <button type="button" className="btn-secondary" onClick={closeEdit}>
                    {t("common.cancel") || "إلغاء"}
                  </button>
                  <button type="submit" className="btn-primary">
                    {t("common.saveEdits") || "حفظ"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  input: {
    padding: "10px 12px",
    border: "1px solid var(--gray-200)",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontFamily: "Cairo, sans-serif",
    background: "white",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
};
