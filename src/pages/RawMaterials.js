// src/pages/RawMaterials.js - إدارة الخامات والمواد الخام للمطاعم
import React, { useState, useEffect, useCallback } from "react";
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

const UNITS = [
  { value: "kg",     label: { ar: "كيلو",          en: "KG" } },
  { value: "g",      label: { ar: "جرام",           en: "Gram" } },
  { value: "liter",  label: { ar: "لتر",            en: "Liter" } },
  { value: "ml",     label: { ar: "مل",             en: "ML" } },
  { value: "piece",  label: { ar: "قطعة",           en: "Piece" } },
  { value: "box",    label: { ar: "علبة",           en: "Box" } },
  { value: "bag",    label: { ar: "كيس",            en: "Bag" } },
  { value: "can",    label: { ar: "علبة معدنية",    en: "Can" } },
  { value: "bottle", label: { ar: "زجاجة",          en: "Bottle" } },
  { value: "pack",   label: { ar: "باكيت",          en: "Pack" } },
  { value: "tray",   label: { ar: "طبق",            en: "Tray" } },
  { value: "cup",    label: { ar: "كوب",            en: "Cup" } },
];

const FIELD = (style) => ({
  padding: "10px 14px",
  border: "2px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 14,
  background: "white",
  width: "100%",
  boxSizing: "border-box",
  ...style,
});

export default function RawMaterials() {
  const { t, lang } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const getUnitLabel = (val) => {
    const u = UNITS.find((u) => u.value === val);
    return u ? u.label[lang] || u.label.ar : val;
  };

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLow, setFilterLow] = useState(false);
  const [newMaterial, setNewMaterial] = useState({
    name: "", unit: "kg", quantity: "", minQuantity: "", costPerUnit: "", supplier: "", notes: "",
  });
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchMaterials = useCallback(async () => {
    if (!userCompanyId) { setLoading(false); return; }
    try {
      const snap = await getDocs(getScopedQuery("raw_materials", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setMaterials(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  async function addMaterial(e) {
    e.preventDefault();
    if (!newMaterial.name.trim() || !newMaterial.quantity || !newMaterial.unit) {
      alert(t("common.fillRequired")); return;
    }
    try {
      const docRef = await addDoc(collection(db, "raw_materials"), {
        name: newMaterial.name.trim(),
        unit: newMaterial.unit,
        quantity: parseFloat(newMaterial.quantity) || 0,
        minQuantity: parseFloat(newMaterial.minQuantity) || 0,
        costPerUnit: parseFloat(newMaterial.costPerUnit) || 0,
        supplier: newMaterial.supplier.trim() || "",
        notes: newMaterial.notes.trim() || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE", collectionName: "raw_materials", itemId: docRef.id,
        details: `Created raw material: ${newMaterial.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewMaterial({ name: "", unit: "kg", quantity: "", minQuantity: "", costPerUnit: "", supplier: "", notes: "" });
      await fetchMaterials();
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
  }

  async function updateMaterial(e) {
    e.preventDefault();
    if (!editingMaterial.name.trim()) { alert(t("common.fillRequired")); return; }
    try {
      await updateDoc(doc(db, "raw_materials", editingMaterial.id), {
        name: editingMaterial.name.trim(),
        unit: editingMaterial.unit,
        quantity: parseFloat(editingMaterial.quantity) || 0,
        minQuantity: parseFloat(editingMaterial.minQuantity) || 0,
        costPerUnit: parseFloat(editingMaterial.costPerUnit) || 0,
        supplier: editingMaterial.supplier || "",
        notes: editingMaterial.notes || "",
      });
      await logActivity({
        actionType: "UPDATE", collectionName: "raw_materials", itemId: editingMaterial.id,
        details: `Updated raw material: ${editingMaterial.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setShowEditModal(false);
      setEditingMaterial(null);
      await fetchMaterials();
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
  }

  async function deleteMaterial(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      const matDoc = await getDoc(doc(db, "raw_materials", id));
      const matName = matDoc.exists() ? matDoc.data().name : "Unknown";
      await deleteDoc(doc(db, "raw_materials", id));
      await logActivity({
        actionType: "DELETE", collectionName: "raw_materials", itemId: id,
        details: `Deleted raw material: ${matName}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchMaterials();
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
  }

  const getStockStatus = (mat) => {
    const qty = parseFloat(mat.quantity) || 0;
    const min = parseFloat(mat.minQuantity) || 0;
    if (qty <= 0) return { label: t("rm.status.out"),  color: "#dc2626", bg: "#fef2f2" };
    if (min > 0 && qty <= min) return { label: t("rm.status.low"), color: "#d97706", bg: "#fffbeb" };
    return { label: t("rm.status.ok"), color: "#16a34a", bg: "#f0fdf4" };
  };

  const filtered = materials.filter((m) => {
    const matchSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.supplier && m.supplier.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filterLow) {
      const qty = parseFloat(m.quantity) || 0;
      const min = parseFloat(m.minQuantity) || 0;
      return matchSearch && (qty <= 0 || (min > 0 && qty <= min));
    }
    return matchSearch;
  });

  const lowStockCount = materials.filter((m) => {
    const qty = parseFloat(m.quantity) || 0;
    const min = parseFloat(m.minQuantity) || 0;
    return qty <= 0 || (min > 0 && qty <= min);
  }).length;

  const totalValue = materials.reduce(
    (sum, m) => sum + (parseFloat(m.quantity) || 0) * (parseFloat(m.costPerUnit) || 0), 0
  );

  const LabelEl = ({ text, required }) => (
    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
      {text} {required && <span style={{ color: "#ef4444" }}>*</span>}
    </label>
  );

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading"><div className="spinner"></div>{t("common.loading")}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">

        {/* Header */}
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-boxes" style={{ color: "#8b5cf6", marginLeft: 10 }}></i>
              {t("rm.title")}
            </h1>
            <p className="subtitle">{t("rm.subtitle")}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", marginBottom: 24 }}>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-boxes"></i></div>
            <div className="stat-value">{materials.length}</div>
            <div className="stat-label">{t("rm.title")}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div>
            <div className="stat-value">{lowStockCount}</div>
            <div className="stat-label">{t("rm.lowStock")}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-dollar-sign"></i></div>
            <div className="stat-value" style={{ fontSize: 18 }}>{totalValue.toLocaleString()}</div>
            <div className="stat-label">{t("currency")}</div>
          </div>
        </div>

        {/* ── Add Form ── */}
        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#8b5cf6" }}></i>
            {t("rm.add")}
          </h3>
          <form onSubmit={addMaterial}>
            {/* صف 1: الاسم + الوحدة */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 14, marginBottom: 14 }}>
              <div>
                <LabelEl text={t("rm.name")} required />
                <input
                  type="text"
                  placeholder={lang === "ar" ? "مثال: دجاج مجمد" : "e.g. Frozen chicken"}
                  value={newMaterial.name}
                  onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
                  required
                  style={FIELD()}
                />
              </div>
              <div>
                <LabelEl text={t("rm.unit")} required />
                <select
                  value={newMaterial.unit}
                  onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value })}
                  style={FIELD()}
                >
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label[lang] || u.label.ar}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* صف 2: الكمية + حد التنبيه + تكلفة الوحدة */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <LabelEl text={t("rm.quantity")} required />
                <input
                  type="number" step="0.01" min="0" placeholder="0"
                  value={newMaterial.quantity}
                  onChange={(e) => setNewMaterial({ ...newMaterial, quantity: e.target.value })}
                  required style={FIELD()}
                />
              </div>
              <div>
                <LabelEl text={t("rm.minQty")} />
                <input
                  type="number" step="0.01" min="0"
                  placeholder={lang === "ar" ? "0 (اختياري)" : "0 (optional)"}
                  value={newMaterial.minQuantity}
                  onChange={(e) => setNewMaterial({ ...newMaterial, minQuantity: e.target.value })}
                  style={FIELD()}
                />
              </div>
              <div>
                <LabelEl text={`${t("rm.costPerUnit")} (${t("currency")})`} />
                <input
                  type="number" step="0.01" min="0" placeholder="0.00"
                  value={newMaterial.costPerUnit}
                  onChange={(e) => setNewMaterial({ ...newMaterial, costPerUnit: e.target.value })}
                  style={FIELD()}
                />
              </div>
            </div>

            {/* صف 3: المورد + الملاحظات */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <LabelEl text={t("rm.supplier")} />
                <input
                  type="text"
                  placeholder={lang === "ar" ? "اسم المورد" : "Supplier name"}
                  value={newMaterial.supplier}
                  onChange={(e) => setNewMaterial({ ...newMaterial, supplier: e.target.value })}
                  style={FIELD()}
                />
              </div>
              <div>
                <LabelEl text={t("rm.notes")} />
                <input
                  type="text"
                  placeholder={lang === "ar" ? "أي ملاحظات إضافية..." : "Any extra notes..."}
                  value={newMaterial.notes}
                  onChange={(e) => setNewMaterial({ ...newMaterial, notes: e.target.value })}
                  style={FIELD()}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary">
              <i className="fas fa-plus"></i> {t("rm.add")}
            </button>
          </form>
        </div>

        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={lang === "ar" ? "🔍 ابحث عن خامة بالاسم أو المورد..." : "🔍 Search by name or supplier..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setFilterLow(!filterLow)}
            className={filterLow ? "btn-danger btn-sm" : "btn-secondary btn-sm"}
            style={{ whiteSpace: "nowrap" }}
          >
            <i className="fas fa-exclamation-triangle"></i>{" "}
            {filterLow
              ? t("rm.title")
              : `${t("rm.lowStock")} (${lowStockCount})`}
          </button>
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t("rm.title")}</h3>
            <span>{filtered.length} {t("rm.name")}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <div className="empty-icon"><i className="fas fa-boxes"></i></div>
              <p>{searchTerm || filterLow ? t("common.noResults") : t("rm.empty")}</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("rm.name")}</th>
                  <th>{t("rm.quantity")}</th>
                  <th>{t("rm.unit")}</th>
                  <th>{t("rm.minQty")}</th>
                  <th>{t("rm.costPerUnit")}</th>
                  <th>{lang === "ar" ? "القيمة الكلية" : "Total Value"}</th>
                  <th>{t("rm.supplier")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((mat, idx) => {
                  const status = getStockStatus(mat);
                  const totalVal = (parseFloat(mat.quantity) || 0) * (parseFloat(mat.costPerUnit) || 0);
                  return (
                    <tr key={mat.id}>
                      <td style={{ color: "#94a3b8", fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ fontWeight: 700 }}>
                        {mat.name}
                        {mat.notes && (
                          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>{mat.notes}</div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: status.color }}>
                          {parseFloat(mat.quantity) || 0}
                        </span>
                      </td>
                      <td>{getUnitLabel(mat.unit)}</td>
                      <td style={{ color: "#94a3b8" }}>
                        {mat.minQuantity > 0 ? `${mat.minQuantity} ${getUnitLabel(mat.unit)}` : "—"}
                      </td>
                      <td>
                        {mat.costPerUnit > 0 ? `${mat.costPerUnit} ${t("currency")}` : "—"}
                      </td>
                      <td style={{ fontWeight: 700, color: "#6366f1" }}>
                        {totalVal > 0 ? `${totalVal.toLocaleString()} ${t("currency")}` : "—"}
                      </td>
                      <td style={{ color: "#64748b" }}>{mat.supplier || "—"}</td>
                      <td>
                        <span style={{
                          background: status.bg, color: status.color,
                          padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                        }}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => { setEditingMaterial({ ...mat }); setShowEditModal(true); }}
                            className="btn-secondary btn-sm"
                            title={t("common.edit")}
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          {userCanDelete && (
                            <button
                              onClick={() => deleteMaterial(mat.id)}
                              className="btn-danger btn-sm"
                              title={t("common.delete")}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
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

        {/* Edit Modal */}
        {showEditModal && editingMaterial && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-edit" style={{ color: "#8b5cf6" }}></i>{" "}
                  {lang === "ar" ? "تعديل الخامة" : "Edit Material"}
                </h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
              </div>
              <form onSubmit={updateMaterial}>
                <div className="modal-body">

                  {/* الاسم - عرض كامل */}
                  <div className="form-group">
                    <label>{t("rm.name")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="text" value={editingMaterial.name} required
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, name: e.target.value })}
                    />
                  </div>

                  {/* الوحدة + الكمية */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="form-group">
                      <label>{t("rm.unit")}</label>
                      <select
                        value={editingMaterial.unit}
                        onChange={(e) => setEditingMaterial({ ...editingMaterial, unit: e.target.value })}
                        style={{ padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white", width: "100%" }}
                      >
                        {UNITS.map((u) => (
                          <option key={u.value} value={u.value}>{u.label[lang] || u.label.ar}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>{t("rm.quantity")}</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={editingMaterial.quantity}
                        onChange={(e) => setEditingMaterial({ ...editingMaterial, quantity: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* حد التنبيه + تكلفة الوحدة */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="form-group">
                      <label>{t("rm.minQty")}</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={editingMaterial.minQuantity || ""}
                        onChange={(e) => setEditingMaterial({ ...editingMaterial, minQuantity: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("rm.costPerUnit")} ({t("currency")})</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={editingMaterial.costPerUnit || ""}
                        onChange={(e) => setEditingMaterial({ ...editingMaterial, costPerUnit: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* المورد */}
                  <div className="form-group">
                    <label>{t("rm.supplier")}</label>
                    <input
                      type="text"
                      value={editingMaterial.supplier || ""}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, supplier: e.target.value })}
                    />
                  </div>

                  {/* الملاحظات */}
                  <div className="form-group">
                    <label>{t("rm.notes")}</label>
                    <input
                      type="text"
                      value={editingMaterial.notes || ""}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, notes: e.target.value })}
                    />
                  </div>

                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-save"></i> {t("common.save")}
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
