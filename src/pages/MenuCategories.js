// src/pages/MenuCategories.js - إدارة أقسام المنيو للمطاعم
import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

const CATEGORY_ICONS = [
  // طعام أساسي
  "🍗", "🍔", "🌯", "🍕", "🥙", "🌮", "🍖", "🥩",
  // أطباق
  "🍜", "🥘", "🍲", "🥗", "🍣", "🧆", "🥪", "🍱",
  // مشروبات
  "🥤", "☕", "🍵", "🧃", "🧋", "💧",
  // حلويات
  "🍰", "🍩", "🍪", "🎂", "🍫", "🧁",
  // فطور / إضافات
  "🥚", "🧀", "🥐", "🍞", "🥞", "🧇",
];

export default function MenuCategories() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState({ name: "", icon: "🍗", description: "" });
  const [editingCategory, setEditingCategory] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showEditIconPicker, setShowEditIconPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, right: 0 });
  const iconBtnRef = useRef(null);
  const editIconBtnRef = useRef(null);

  function openPicker(ref, setter) {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPickerPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setter(true);
  }

  // إغلاق الـ picker لما يضغط برا
  useEffect(() => {
    function handleClick(e) {
      if (!e.target.closest(".icon-picker-btn") && !e.target.closest(".icon-picker-dropdown")) {
        setShowIconPicker(false);
        setShowEditIconPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchCategories = useCallback(async () => {
    if (!userCompanyId) { setLoading(false); return; }
    try {
      const snap = await getDocs(
        getScopedQuery("menu_categories", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setCategories(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  async function addCategory(e) {
    e.preventDefault();
    if (!newCategory.name.trim()) { alert(t("common.fillRequired")); return; }
    try {
      const docRef = await addDoc(collection(db, "menu_categories"), {
        name: newCategory.name.trim(),
        icon: newCategory.icon || "🍗",
        description: newCategory.description.trim() || "",
        order: categories.length,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE", collectionName: "menu_categories", itemId: docRef.id,
        details: `Created menu category: ${newCategory.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewCategory({ name: "", icon: "🍗", description: "" });
      await fetchCategories();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function updateCategory(e) {
    e.preventDefault();
    if (!editingCategory.name.trim()) { alert(t("common.fillRequired")); return; }
    try {
      await updateDoc(doc(db, "menu_categories", editingCategory.id), {
        name: editingCategory.name.trim(),
        icon: editingCategory.icon || "🍗",
        description: editingCategory.description || "",
      });
      await logActivity({
        actionType: "UPDATE", collectionName: "menu_categories", itemId: editingCategory.id,
        details: `Updated menu category: ${editingCategory.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setShowEditModal(false);
      setEditingCategory(null);
      await fetchCategories();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteCategory(id, name) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "menu_categories", id));
      await logActivity({
        actionType: "DELETE", collectionName: "menu_categories", itemId: id,
        details: `Deleted menu category: ${name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchCategories();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  // ── Icon Picker مكون مشترك ──
  const IconPickerDropdown = ({ onSelect }) => (
    <div
      className="icon-picker-dropdown"
      style={{
        position: "fixed",
        top: pickerPos.top,
        right: pickerPos.right,
        zIndex: 9999,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 10,
        display: "grid",
        gridTemplateColumns: "repeat(8, 34px)",
        gap: 3,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}
    >
      {CATEGORY_ICONS.map((icon) => (
        <button
          key={icon} type="button" onClick={() => onSelect(icon)}
          style={{
            width: 34, height: 34, fontSize: 19,
            border: "1px solid transparent", borderRadius: 6,
            cursor: "pointer", background: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"}
          onMouseLeave={(e) => e.currentTarget.style.background = "none"}
        >
          {icon}
        </button>
      ))}
    </div>
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
              <i className="fas fa-layer-group" style={{ color: "#f59e0b", marginLeft: 10 }}></i>
              {t("mc.title")}
            </h1>
            <p className="subtitle">{t("mc.subtitle")}</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <div className="stat-card amber" style={{ flex: "0 0 auto", minWidth: 160 }}>
            <div className="stat-icon"><i className="fas fa-layer-group"></i></div>
            <div className="stat-value">{categories.length}</div>
            <div className="stat-label">{t("mc.title")}</div>
          </div>
        </div>

        {/* Add Form */}
        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#f59e0b" }}></i>
            {t("mc.add")}
          </h3>
          <form onSubmit={addCategory}>
            <div style={{ display: "grid", gridTemplateColumns: "64px 1fr 1fr", gap: 16, alignItems: "end" }}>

              {/* Icon Picker */}
              <div style={{ position: "relative" }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("mc.icon")}
                </label>
                <button
                  ref={iconBtnRef}
                  type="button"
                  className="icon-picker-btn"
                  onClick={() => showIconPicker ? setShowIconPicker(false) : openPicker(iconBtnRef, setShowIconPicker)}
                  style={{
                    width: "100%", height: 44, fontSize: 24, border: "2px solid #e2e8f0",
                    borderRadius: 10, background: "#f8fafc", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {newCategory.icon}
                </button>
                {showIconPicker && (
                  <IconPickerDropdown onSelect={(icon) => { setNewCategory({ ...newCategory, icon }); setShowIconPicker(false); }} />
                )}
              </div>

              {/* اسم القسم */}
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("mc.name")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={t("mc.name")}
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>

              {/* وصف القسم */}
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("mc.desc")} <span style={{ color: "#94a3b8", fontWeight: 400 }}>({t("common.description")})</span>
                </label>
                <input
                  type="text"
                  placeholder={t("mc.desc")}
                  value={newCategory.description}
                  onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn-primary">
                <i className="fas fa-plus"></i> {t("mc.add")}
              </button>
            </div>
          </form>
        </div>

        {/* Categories List */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t("mc.title")}</h3>
            <span>{categories.length} {t("mc.title")}</span>
          </div>

          {categories.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <div className="empty-icon"><i className="fas fa-layer-group"></i></div>
              <p>{t("mc.empty")}</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, padding: 16 }}>
              {categories.map((cat, index) => (
                <div
                  key={cat.id}
                  style={{
                    background: "white", border: "2px solid #e2e8f0", borderRadius: 14,
                    padding: "16px 20px", display: "flex", alignItems: "center", gap: 14,
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#f59e0b";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(245,158,11,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                  }}
                >
                  <div style={{ fontSize: 36, lineHeight: 1 }}>{cat.icon || "🍽️"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{cat.name}</div>
                    {cat.description && (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{cat.description}</div>
                    )}
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                      # {index + 1}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => { setEditingCategory({ ...cat }); setShowEditModal(true); }}
                      className="btn-secondary btn-sm"
                      title={t("common.edit")}
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    {userCanDelete && (
                      <button
                        onClick={() => deleteCategory(cat.id, cat.name)}
                        className="btn-danger btn-sm"
                        title={t("common.delete")}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {showEditModal && editingCategory && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-edit" style={{ color: "#f59e0b" }}></i>{" "}
                  {t("mc.editTitle")}
                </h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
              </div>
              <form onSubmit={updateCategory}>
                <div className="modal-body">

                  {/* Icon */}
                  <div className="form-group">
                    <label>{t("mc.icon")}</label>
                    <div>
                      <button
                        ref={editIconBtnRef}
                        type="button"
                        className="icon-picker-btn"
                        onClick={() => showEditIconPicker ? setShowEditIconPicker(false) : openPicker(editIconBtnRef, setShowEditIconPicker)}
                        style={{
                          width: 56, height: 44, fontSize: 24, border: "2px solid #e2e8f0",
                          borderRadius: 10, background: "#f8fafc", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {editingCategory.icon}
                      </button>
                      {showEditIconPicker && (
                        <IconPickerDropdown onSelect={(icon) => { setEditingCategory({ ...editingCategory, icon }); setShowEditIconPicker(false); }} />
                      )}
                    </div>
                  </div>

                  {/* الاسم */}
                  <div className="form-group">
                    <label>{t("mc.name")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="text"
                      value={editingCategory.name}
                      required
                      onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                    />
                  </div>

                  {/* الوصف */}
                  <div className="form-group">
                    <label>{t("mc.desc")}</label>
                    <input
                      type="text"
                      value={editingCategory.description || ""}
                      onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
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
