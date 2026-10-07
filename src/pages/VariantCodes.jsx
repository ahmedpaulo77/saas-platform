// src/pages/VariantCodes.jsx - أكواد الألوان والمقاسات (ملابس)
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";

export default function VariantCodes() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // نموذج مستقل لكل جدول عشان اللون والمقاس ما يتلخبطوش على بعض
  const [newColor, setNewColor] = useState({ name: "", code: "" });
  const [newSize, setNewSize] = useState({ name: "", code: "" });
  const [editingEntry, setEditingEntry] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchCodes = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const snap = await getDocs(
        getScopedQuery("variant_codes", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      setCodes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  function isDuplicate(kind, code, excludeId) {
    const c = (code || "").trim();
    if (!c) return false;
    return codes.some(
      (x) => x.kind === kind && (x.code || "").trim() === c && x.id !== excludeId
    );
  }

  // إضافة عنصر لنوع محدد (color أو size) — كل جدول بيناديها بالنوع بتاعه
  async function addEntry(e, kind) {
    e.preventDefault();
    const entry = kind === "color" ? newColor : newSize;
    const reset = kind === "color" ? setNewColor : setNewSize;
    const name = (entry.name || "").trim();
    const code = (entry.code || "").trim();
    if (!name || !code || !kind) {
      alert(t("common.fillRequired"));
      return;
    }
    if (isDuplicate(kind, code, null)) {
      alert(t("vc.codeExists"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "variant_codes"), {
        kind,
        name,
        code,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "variant_codes",
        itemId: docRef.id,
        details: `Created variant code: [${kind}] ${name} = ${code}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      reset({ name: "", code: "" });
      await fetchCodes();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function updateEntry(e) {
    e.preventDefault();
    const name = (editingEntry.name || "").trim();
    const code = (editingEntry.code || "").trim();
    if (!name || !code || !editingEntry.kind) {
      alert(t("common.fillRequired"));
      return;
    }
    if (isDuplicate(editingEntry.kind, code, editingEntry.id)) {
      alert(t("vc.codeExists"));
      return;
    }
    try {
      await updateDoc(doc(db, "variant_codes", editingEntry.id), {
        kind: editingEntry.kind,
        name,
        code,
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "variant_codes",
        itemId: editingEntry.id,
        details: `Updated variant code: [${editingEntry.kind}] ${name} = ${code}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      setShowEditModal(false);
      setEditingEntry(null);
      await fetchCodes();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteEntry(id, label) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "variant_codes", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "variant_codes",
        itemId: id,
        details: `Deleted variant code: ${label}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      await fetchCodes();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  // فلترة مشتركة بالبحث فقط — الفصل بين اللون والمقاس بالنوع
  function matchesSearch(x) {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return (
      (x.name || "").toLowerCase().includes(s) ||
      (x.code || "").toLowerCase().includes(s)
    );
  }

  const colorCodes = codes
    .filter((x) => x.kind === "color" && matchesSearch(x))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const sizeCodes = codes
    .filter((x) => x.kind === "size" && matchesSearch(x))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  function renderRows(pageItems, start, accent) {
    return (
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{t("vc.name")}</th>
            <th>{t("vc.code")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((x, i) => (
            <tr key={x.id}>
              <td>{start + i + 1}</td>
              <td style={{ fontWeight: 700 }}>{x.name}</td>
              <td style={{ fontWeight: 700, color: accent, direction: "ltr" }}>{x.code}</td>
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
                  {userCanDelete && (
                    <button
                      onClick={() => deleteEntry(x.id, `${x.name} (${x.code})`)}
                      className="btn-danger btn-sm"
                      title={t("common.delete")}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  )}
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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-barcode" style={{ color: "#8b5cf6", marginLeft: 10 }}></i>
              {t("vc.title")}
            </h1>
            <p className="subtitle">{t("vc.subtitle")}</p>
          </div>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("vc.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 20,
            alignItems: "start",
          }}
        >
          {/* ── جدول الألوان لوحده ── */}
          <div>
            <div className="form-card" style={{ borderTop: "4px solid #8b5cf6" }}>
              <h3>
                <i className="fas fa-palette" style={{ color: "#8b5cf6" }}></i>
                {" "}{t("vc.addColor")}
              </h3>
              <form onSubmit={(e) => addEntry(e, "color")}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 12,
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                      {t("vc.name")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={t("vc.color")}
                      value={newColor.name}
                      onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                      required
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                      {t("vc.code")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={t("vc.code")}
                      value={newColor.code}
                      onChange={(e) => setNewColor({ ...newColor, code: e.target.value })}
                      required
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-plus"></i> {t("vc.addColor")}
                  </button>
                </div>
              </form>
            </div>

            <div className="table-container">
              <div className="table-header">
                <h3>
                  <i className="fas fa-palette" style={{ color: "#8b5cf6" }}></i>
                  {" "}{t("vc.colorsTitle")} — {t("vc.colorsList")}
                </h3>
                <span className="table-count">{colorCodes.length}</span>
              </div>
              <div className="table-wrapper">
                <Pagination
                  data={colorCodes}
                  pageSize={10}
                  resetKey={`color-${searchTerm}`}
                  empty={
                    <div className="table-empty">
                      <i className="fas fa-palette"></i>
                      <p>{t("vc.colorsEmpty")}</p>
                    </div>
                  }
                  render={(pageItems, total, start) => renderRows(pageItems, start, "#6d28d9")}
                />
              </div>
            </div>
          </div>

          {/* ── جدول المقاسات لوحده ── */}
          <div>
            <div className="form-card" style={{ borderTop: "4px solid #2563eb" }}>
              <h3>
                <i className="fas fa-ruler" style={{ color: "#2563eb" }}></i>
                {" "}{t("vc.addSize")}
              </h3>
              <form onSubmit={(e) => addEntry(e, "size")}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 12,
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                      {t("vc.name")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={t("vc.size")}
                      value={newSize.name}
                      onChange={(e) => setNewSize({ ...newSize, name: e.target.value })}
                      required
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                      {t("vc.code")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={t("vc.code")}
                      value={newSize.code}
                      onChange={(e) => setNewSize({ ...newSize, code: e.target.value })}
                      required
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-plus"></i> {t("vc.addSize")}
                  </button>
                </div>
              </form>
            </div>

            <div className="table-container">
              <div className="table-header">
                <h3>
                  <i className="fas fa-ruler" style={{ color: "#2563eb" }}></i>
                  {" "}{t("vc.sizesTitle")} — {t("vc.sizesList")}
                </h3>
                <span className="table-count">{sizeCodes.length}</span>
              </div>
              <div className="table-wrapper">
                <Pagination
                  data={sizeCodes}
                  pageSize={10}
                  resetKey={`size-${searchTerm}`}
                  empty={
                    <div className="table-empty">
                      <i className="fas fa-ruler"></i>
                      <p>{t("vc.sizesEmpty")}</p>
                    </div>
                  }
                  render={(pageItems, total, start) => renderRows(pageItems, start, "#1d4ed8")}
                />
              </div>
            </div>
          </div>
        </div>

        {showEditModal && editingEntry && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-edit" style={{ color: "#8b5cf6" }}></i> {t("vc.editTitle")}
                </h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>
                  ×
                </button>
              </div>
              <form onSubmit={updateEntry}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>
                      {t("vc.kind")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <select
                      value={editingEntry.kind}
                      onChange={(e) => setEditingEntry({ ...editingEntry, kind: e.target.value })}
                      required
                    >
                      <option value="color">{t("vc.color")}</option>
                      <option value="size">{t("vc.size")}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>
                      {t("vc.name")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={editingEntry.name}
                      required
                      onChange={(e) => setEditingEntry({ ...editingEntry, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>
                      {t("vc.code")} <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={editingEntry.code}
                      required
                      onChange={(e) => setEditingEntry({ ...editingEntry, code: e.target.value })}
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
