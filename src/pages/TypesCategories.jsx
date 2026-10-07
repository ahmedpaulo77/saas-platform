// src/pages/TypesCategories.jsx - النوع والفئة (ملابس)
// تاب الأنواع: الـ 5 الافتراضية (رجالي/حريمي/ولادي/بناتي/يونيسكس) + أنواع مخصصة من الشركة
// تاب الفئات: فئات الشركة (تُستورد تلقائياً من قيم الموديل الموجودة في المنتجات)
// اللي يتنشئ هنا بيظهر كاختيارات في المخزون (نموذج الإضافة + مولد الموديلات)
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";

const norm = (s) => String(s ?? "").trim().toLowerCase();

export default function TypesCategories() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [activeTab, setActiveTab] = useState("types"); // "types" | "categories"
  const [lookups, setLookups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [newTypeName, setNewTypeName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingEntry, setEditingEntry] = useState(null); // { id, kind, name }
  const [showEditModal, setShowEditModal] = useState(false);
  const [seededCount, setSeededCount] = useState(0);

  // الأنواع الافتراضية الثابتة — ظاهرة دائماً ولا تُمسح ولا تُعدل
  const defaultTypes = [
    { value: "men", label: t("inv.typeMen") },
    { value: "women", label: t("inv.typeWomen") },
    { value: "boys", label: t("inv.typeBoys") },
    { value: "girls", label: t("inv.typeGirls") },
    { value: "unisex", label: t("inv.typeUnisex") },
  ];

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const [lookSnap, prodSnap] = await Promise.all([
        getDocs(getScopedQuery("clothing_lookups", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid)),
      ]);
      let data = lookSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

      // استيراد تلقائي: أي قيمة موديل في المنتجات ومش موجودة في الفئات → نضيفها
      const existingCats = new Set(
        data.filter((x) => x.kind === "category").map((x) => norm(x.name))
      );
      const productModels = [
        ...new Set(
          prodSnap.docs
            .map((d) => String(d.data()?.model ?? "").trim())
            .filter(Boolean)
        ),
      ];
      const missing = productModels.filter((m) => !existingCats.has(norm(m)));
      if (missing.length > 0) {
        const now = new Date().toISOString();
        const batch = writeBatch(db);
        missing.forEach((name) => {
          batch.set(doc(collection(db, "clothing_lookups")), {
            kind: "category",
            name,
            companyId: userCompanyId,
            createdBy: currentUser?.uid || null,
            createdAt: now,
          });
        });
        await batch.commit();
        await logActivity({
          actionType: "CREATE",
          collectionName: "clothing_lookups",
          itemId: "-",
          details: `Auto-imported ${missing.length} categories from product models: ${missing.join(", ")}`,
          user: {
            uid: currentUser?.uid,
            email: currentUser?.email,
            role: userRole,
            companyId: userCompanyId,
          },
        });
        const reSnap = await getDocs(
          getScopedQuery("clothing_lookups", userRole, userCompanyId, currentUser?.uid)
        );
        data = reSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
        setSeededCount(missing.length);
      }

      setLookups(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid, currentUser?.email]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function isDuplicate(kind, name, excludeId) {
    const n = norm(name);
    if (!n) return false;
    if (kind === "type") {
      // ممنوع التكرار مع الافتراضية (بالقيمة أو بالاسم المعروض) أو مع المخصصة
      if (defaultTypes.some((d) => norm(d.value) === n || norm(d.label) === n)) return true;
    }
    return lookups.some(
      (x) => x.kind === kind && norm(x.name) === n && x.id !== excludeId
    );
  }

  async function addEntry(e, kind) {
    e.preventDefault();
    const raw = kind === "type" ? newTypeName : newCategoryName;
    const name = raw.trim();
    if (!name) {
      alert(t("common.fillRequired"));
      return;
    }
    if (isDuplicate(kind, name, null)) {
      alert(t("tc.exists"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "clothing_lookups"), {
        kind,
        name,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "clothing_lookups",
        itemId: docRef.id,
        details: `Created clothing lookup: [${kind}] ${name}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      if (kind === "type") setNewTypeName("");
      else setNewCategoryName("");
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function updateEntry(e) {
    e.preventDefault();
    const name = (editingEntry.name || "").trim();
    if (!name) {
      alert(t("common.fillRequired"));
      return;
    }
    if (isDuplicate(editingEntry.kind, name, editingEntry.id)) {
      alert(t("tc.exists"));
      return;
    }
    try {
      await updateDoc(doc(db, "clothing_lookups", editingEntry.id), { name });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "clothing_lookups",
        itemId: editingEntry.id,
        details: `Updated clothing lookup: [${editingEntry.kind}] ${name}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      setShowEditModal(false);
      setEditingEntry(null);
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteEntry(id, label) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "clothing_lookups", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "clothing_lookups",
        itemId: id,
        details: `Deleted clothing lookup: ${label}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  function matchesSearch(x) {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return (x.name || "").toLowerCase().includes(s);
  }

  const customTypes = lookups
    .filter((x) => x.kind === "type" && matchesSearch(x))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const categories = lookups
    .filter((x) => x.kind === "category" && matchesSearch(x))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const shownDefaults = defaultTypes.filter(
    (d) => !searchTerm.trim() || d.label.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  function renderRows(pageItems, start, accent) {
    return (
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{t("vc.name")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((x, i) => (
            <tr key={x.id}>
              <td>{start + i + 1}</td>
              <td style={{ fontWeight: 700 }}>{x.name}</td>
              <td>
                <div className="table-actions">
                  <button
                    onClick={() => {
                      setEditingEntry({ ...x });
                      setShowEditModal(true);
                    }}
                    className="btn-sm btn-secondary"
                    title={t("common.edit")}
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  {/* المسح متشال نهائياً — حتى للأدمن */}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

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

  const tabBtn = (active) => ({
    padding: "10px 28px",
    fontSize: 15,
    fontWeight: 800,
    borderRadius: 12,
    cursor: "pointer",
    border: active ? "2px solid #1e3a8a" : "2px solid #e2e8f0",
    background: active ? "#1e3a8a" : "white",
    color: active ? "white" : "#64748b",
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-shirt" style={{ color: "#1e3a8a", marginLeft: 10 }}></i>
              {t("tc.title")}
            </h1>
            <p className="subtitle">{t("tc.subtitle")}</p>
          </div>
        </div>

        {seededCount > 0 && (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              color: "#15803d",
              borderRadius: 12,
              padding: "10px 16px",
              marginBottom: 16,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            ✅ {t("tc.imported")} ({seededCount})
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button type="button" style={tabBtn(activeTab === "types")} onClick={() => setActiveTab("types")}>
            👔 {t("tc.typesTab")}
          </button>
          <button type="button" style={tabBtn(activeTab === "categories")} onClick={() => setActiveTab("categories")}>
            🗂️ {t("tc.categoriesTab")}
          </button>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("tc.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {activeTab === "types" && (
          <>
            <div className="form-card" style={{ borderTop: "4px solid #1e3a8a" }}>
              <h3>
                <i className="fas fa-plus-circle" style={{ color: "#1e3a8a" }}></i>
                {" "}{t("tc.addType")}
              </h3>
              <form onSubmit={(e) => addEntry(e, "type")}>
                <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                      {t("tc.typeName")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={t("tc.typeName")}
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      required
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-plus"></i> {t("tc.addType")}
                  </button>
                </div>
              </form>
            </div>

            <div className="table-container">
              <div className="table-header">
                <h3>
                  <i className="fas fa-list"></i> {t("tc.typesList")}
                </h3>
                <span className="table-count">{shownDefaults.length + customTypes.length}</span>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("vc.name")}</th>
                      <th>{t("vc.kind")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownDefaults.map((d, i) => (
                      <tr key={`default-${d.value}`}>
                        <td>{i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{d.label}</td>
                        <td>
                          <span className="badge" style={{ background: "#e0e7ff", color: "#1e3a8a" }}>
                            {t("tc.defaultBadge")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {customTypes.length > 0 && (
                  <Pagination
                    data={customTypes}
                    pageSize={15}
                    resetKey={`types-${searchTerm}`}
                    empty={null}
                    render={(pageItems, total, start) =>
                      renderRows(pageItems, shownDefaults.length + start, "#1e3a8a")
                    }
                  />
                )}
                {customTypes.length === 0 && (
                  <div className="table-empty">
                    <i className="fas fa-shirt"></i>
                    <p>{t("tc.typesEmpty")}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "categories" && (
          <>
            <div className="form-card" style={{ borderTop: "4px solid #059669" }}>
              <h3>
                <i className="fas fa-plus-circle" style={{ color: "#059669" }}></i>
                {" "}{t("tc.addCategory")}
              </h3>
              <form onSubmit={(e) => addEntry(e, "category")}>
                <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                      {t("tc.categoryName")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={t("tc.categoryName")}
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      required
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-plus"></i> {t("tc.addCategory")}
                  </button>
                </div>
              </form>
            </div>

            <div className="table-container">
              <div className="table-header">
                <h3>
                  <i className="fas fa-list"></i> {t("tc.categoriesList")}
                </h3>
                <span className="table-count">{categories.length}</span>
              </div>
              <div className="table-wrapper">
                <Pagination
                  data={categories}
                  pageSize={15}
                  resetKey={`categories-${searchTerm}`}
                  empty={
                    <div className="table-empty">
                      <i className="fas fa-folder-open"></i>
                      <p>{t("tc.categoriesEmpty")}</p>
                    </div>
                  }
                  render={(pageItems, total, start) => renderRows(pageItems, start, "#059669")}
                />
              </div>
            </div>
          </>
        )}

        {showEditModal && editingEntry && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-edit" style={{ color: "#1e3a8a" }}></i>{" "}
                  {editingEntry.kind === "type" ? t("tc.editType") : t("tc.editCategory")}
                </h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>
                  ×
                </button>
              </div>
              <form onSubmit={updateEntry}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>
                      {editingEntry.kind === "type" ? t("tc.typeName") : t("tc.categoryName")}{" "}
                      <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={editingEntry.name}
                      required
                      onChange={(e) => setEditingEntry({ ...editingEntry, name: e.target.value })}
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
