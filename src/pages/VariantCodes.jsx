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
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import Pagination from "../components/common/Pagination";
import { useLanguage } from "../i18n/LanguageContext";

export default function VariantCodes() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [kindFilter, setKindFilter] = useState("all");

  const [newEntry, setNewEntry] = useState({ kind: "color", name: "", code: "" });
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

  async function addEntry(e) {
    e.preventDefault();
    const name = (newEntry.name || "").trim();
    const code = (newEntry.code || "").trim();
    if (!name || !code || !newEntry.kind) {
      alert(t("common.fillRequired"));
      return;
    }
    if (isDuplicate(newEntry.kind, code, null)) {
      alert(t("vc.codeExists"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "variant_codes"), {
        kind: newEntry.kind,
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
        details: `Created variant code: [${newEntry.kind}] ${name} = ${code}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      setNewEntry({ kind: "color", name: "", code: "" });
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

  const filtered = codes.filter((x) => {
    const s = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !s ||
      (x.name || "").toLowerCase().includes(s) ||
      (x.code || "").toLowerCase().includes(s);
    const matchesKind = kindFilter === "all" || x.kind === kindFilter;
    return matchesSearch && matchesKind;
  });

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

        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#8b5cf6" }}></i>
            {t("vc.add")}
          </h3>
          <form onSubmit={addEntry}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                alignItems: "end",
              }}
            >
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("vc.kind")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={newEntry.kind}
                  onChange={(e) => setNewEntry({ ...newEntry, kind: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                >
                  <option value="color">{t("vc.color")}</option>
                  <option value="size">{t("vc.size")}</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("vc.name")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={t("vc.name")}
                  value={newEntry.name}
                  onChange={(e) => setNewEntry({ ...newEntry, name: e.target.value })}
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
                  value={newEntry.code}
                  onChange={(e) => setNewEntry({ ...newEntry, code: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn-primary">
                <i className="fas fa-plus"></i> {t("vc.add")}
              </button>
            </div>
          </form>
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
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="all">{t("vc.allKinds")}</option>
            <option value="color">{t("vc.color")}</option>
            <option value="size">{t("vc.size")}</option>
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("vc.list")}
            </h3>
            <span className="table-count">{filtered.length}</span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filtered}
              pageSize={20}
              resetKey={`${searchTerm}-${kindFilter}`}
              empty={
                <div className="table-empty">
                  <i className="fas fa-barcode"></i>
                  <p>{t("vc.empty")}</p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("vc.kind")}</th>
                      <th>{t("vc.name")}</th>
                      <th>{t("vc.code")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((x, i) => (
                      <tr key={x.id}>
                        <td>{start + i + 1}</td>
                        <td>
                          <span
                            className="badge"
                            style={
                              x.kind === "color"
                                ? { background: "#ede9fe", color: "#6d28d9" }
                                : { background: "#dbeafe", color: "#1d4ed8" }
                            }
                          >
                            {x.kind === "color" ? t("vc.color") : t("vc.size")}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{x.name}</td>
                        <td style={{ fontWeight: 700, color: "#6d28d9", direction: "ltr" }}>{x.code}</td>
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
              )}
            />
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
