// src/pages/Certificates.jsx - مستخلصات المقاولين (Certificates)
import React, { useState, useEffect, useCallback, useMemo } from "react";
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

export default function Certificates() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [certificates, setCertificates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProject, setFilterProject] = useState("all");

  const [newCert, setNewCert] = useState({
    projectId: "",
    amount: "",
    paidAmount: "",
    status: "pending",
    dueDate: "",
    description: "",
  });

  const [editingCert, setEditingCert] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        getScopedQuery("projects", userRole, userCompanyId, currentUser?.uid)
      );
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error fetching projects:", e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchCertificates = useCallback(async () => {
    if (!userCompanyId) {
      setCertificates([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const snap = await getDocs(
        getScopedQuery("certificates", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // sort by createdAt desc if available
      data.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt) : 0;
        const dbv = b.createdAt ? new Date(b.createdAt) : 0;
        return dbv - da;
      });
      setCertificates(data);
    } catch (e) {
      console.error("Error fetching certificates:", e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchProjects();
    fetchCertificates();
  }, [fetchProjects, fetchCertificates]);

  const stats = useMemo(() => {
    const total = certificates.length;
    const pending = certificates.filter((c) => c.status === "pending").length;
    const approved = certificates.filter((c) => c.status === "approved").length;
    const paid = certificates.filter((c) => c.status === "paid").length;
    return { total, pending, approved, paid };
  }, [certificates]);

  const filtered = useMemo(() => {
    let data = [...certificates];
    if (filterStatus !== "all") {
      data = data.filter((c) => c.status === filterStatus);
    }
    if (filterProject !== "all") {
      data = data.filter((c) => c.projectId === filterProject);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      data = data.filter((c) => {
        const projName =
          projects.find((p) => p.id === c.projectId)?.name || c.projectName || "";
        return (
          projName.toLowerCase().includes(term) ||
          String(c.amount).includes(term) ||
          String(c.paidAmount ?? "").includes(term) ||
          (c.description || "").toLowerCase().includes(term) ||
          (c.status || "").toLowerCase().includes(term)
        );
      });
    }
    return data;
  }, [certificates, filterStatus, filterProject, searchTerm, projects]);

  async function addCertificate(e) {
    e.preventDefault();
    if (!newCert.projectId || !newCert.amount) {
      alert(t("cert.needProject"));
      return;
    }
    if (!userCompanyId) {
      alert(t("co.fillAll"));
      return;
    }
    setSubmitting(true);
    try {
      const proj = projects.find((p) => p.id === newCert.projectId);
      const amount = parseFloat(newCert.amount) || 0;
      const paidAmount = parseFloat(newCert.paidAmount) || 0;
      const payload = {
        projectId: newCert.projectId,
        projectName: proj?.name || "",
        amount,
        paidAmount,
        status: newCert.status || "pending",
        dueDate: newCert.dueDate || null,
        description: newCert.description || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, "certificates"), payload);
      await logActivity({
        actionType: "CREATE",
        collectionName: "certificates",
        itemId: docRef.id,
        details: `Certificate for project ${proj?.name || newCert.projectId} amount ${amount}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      setNewCert({
        projectId: "",
        amount: "",
        paidAmount: "",
        status: "pending",
        dueDate: "",
        description: "",
      });
      await fetchCertificates();
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء الإضافة");
    }
    setSubmitting(false);
  }

  function openEditModal(cert) {
    setEditingCert({ ...cert });
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingCert(null);
    setShowEditModal(false);
  }

  async function updateCertificate(e) {
    e.preventDefault();
    if (!editingCert.projectId || editingCert.amount === "" || editingCert.amount == null) {
      alert(t("cert.needProject"));
      return;
    }
    try {
      const proj = projects.find((p) => p.id === editingCert.projectId);
      const amount = parseFloat(editingCert.amount) || 0;
      const paidAmount = parseFloat(editingCert.paidAmount) || 0;
      await updateDoc(doc(db, "certificates", editingCert.id), {
        projectId: editingCert.projectId,
        projectName: proj?.name || editingCert.projectName || "",
        amount,
        paidAmount,
        status: editingCert.status,
        dueDate: editingCert.dueDate || null,
        description: editingCert.description || "",
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "certificates",
        itemId: editingCert.id,
        details: `Updated certificate amount to ${amount}, status to ${editingCert.status}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      await fetchCertificates();
      closeEditModal();
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء التحديث");
    }
  }

  async function deleteCertificate(id) {
    if (!window.confirm(t("cert.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "certificates", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "certificates",
        itemId: id,
        details: "Deleted certificate",
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });
      await fetchCertificates();
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء الحذف");
    }
  }

  const userCanDelete = canDelete(userRole);

  const statusLabel = (s) => {
    if (s === "approved") return t("cert.approved");
    if (s === "paid") return t("cert.paid");
    return t("cert.pending");
  };

  const statusBadge = (s) => {
    if (s === "paid") return "badge-paid";
    if (s === "approved") return "badge-active";
    return "badge-pending";
  };

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div> جاري التحميل...
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
              <i className="fas fa-file-contract" style={{ color: "#6366f1", marginLeft: 10 }}></i>
              {t("cert.title")}
            </h1>
            <p className="subtitle">{t("cert.subtitle")}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))" }}>
          <div className="stat-card cyan">
            <div className="stat-icon">
              <i className="fas fa-layer-group"></i>
            </div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t("cert.total")}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon">
              <i className="fas fa-clock"></i>
            </div>
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-label">{t("cert.pending")}</div>
          </div>
          <div className="stat-card indigo">
            <div className="stat-icon">
              <i className="fas fa-check-double"></i>
            </div>
            <div className="stat-value">{stats.approved}</div>
            <div className="stat-label">{t("cert.approved")}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon">
              <i className="fas fa-money-bill-wave"></i>
            </div>
            <div className="stat-value">{stats.paid}</div>
            <div className="stat-label">{t("cert.paid")}</div>
          </div>
        </div>

        {/* Add Form */}
        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#6366f1" }}></i> {t("cert.add")}
          </h3>
          <form onSubmit={addCertificate}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("cert.project")} *</label>
                <select
                  value={newCert.projectId}
                  onChange={(e) => setNewCert({ ...newCert, projectId: e.target.value })}
                  required
                >
                  <option value="">{t("cert.chooseProject")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("cert.amount")} *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={newCert.amount}
                  onChange={(e) => setNewCert({ ...newCert, amount: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("cert.paidAmount")}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={newCert.paidAmount}
                  onChange={(e) => setNewCert({ ...newCert, paidAmount: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("cert.status")}</label>
                <select
                  value={newCert.status}
                  onChange={(e) => setNewCert({ ...newCert, status: e.target.value })}
                >
                  <option value="pending">{t("cert.pending")}</option>
                  <option value="approved">{t("cert.approved")}</option>
                  <option value="paid">{t("cert.paid")}</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("cert.dueDate")}</label>
                <input
                  type="date"
                  value={newCert.dueDate}
                  onChange={(e) => setNewCert({ ...newCert, dueDate: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("cert.description")}</label>
                <input
                  type="text"
                  placeholder={t("cert.description")}
                  value={newCert.description}
                  onChange={(e) => setNewCert({ ...newCert, description: e.target.value })}
                />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> {t("common.adding")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus"></i> {t("cert.add")}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Filters */}
        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
              <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("cert.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">{t("cert.allStatus")}</option>
            <option value="pending">{t("cert.pending")}</option>
            <option value="approved">{t("cert.approved")}</option>
            <option value="paid">{t("cert.paid")}</option>
          </select>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
            <option value="all">{t("cert.allProjects")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("cert.list")}
            </h3>
            <span className="table-count">
              {filtered.length} {t("cert.title")}
            </span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filtered}
              pageSize={20}
              resetKey={`${searchTerm}-${filterStatus}-${filterProject}`}
              empty={
                <div className="table-empty">
                  <i className="fas fa-file-contract"></i>
                  <p>
                    {searchTerm || filterStatus !== "all" || filterProject !== "all"
                      ? t("cert.noResults")
                      : t("cert.empty")}
                  </p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("cert.project")}</th>
                      <th>{t("cert.amount")}</th>
                      <th>{t("cert.paidAmount")}</th>
                      <th>{t("cert.remaining")}</th>
                      <th>{t("cert.status")}</th>
                      <th>{t("cert.dueDate")}</th>
                      <th>{t("cert.description")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((c, i) => {
                      const projName =
                        projects.find((p) => p.id === c.projectId)?.name ||
                        c.projectName ||
                        "—";
                      const amount = parseFloat(c.amount) || 0;
                      const paid = parseFloat(c.paidAmount) || 0;
                      const remaining = amount - paid;
                      return (
                        <tr key={c.id}>
                          <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>
                            {start + i + 1}
                          </td>
                          <td style={{ fontWeight: 600 }}>{projName}</td>
                          <td style={{ fontWeight: 700 }}>{amount.toLocaleString()}</td>
                          <td style={{ color: "#10b981", fontWeight: 600 }}>
                            {paid > 0 ? paid.toLocaleString() : "—"}
                          </td>
                          <td
                            style={{
                              fontWeight: 700,
                              color: remaining > 0 ? "#ef4444" : "#10b981",
                            }}
                          >
                            {remaining > 0 ? remaining.toLocaleString() : "✓"}
                          </td>
                          <td>
                            <span className={`badge ${statusBadge(c.status)}`}>
                              {statusLabel(c.status)}
                            </span>
                          </td>
                          <td style={{ color: "var(--gray-500)", fontSize: 13 }}>
                            {c.dueDate ? new Date(c.dueDate).toLocaleDateString("ar-EG") : "—"}
                          </td>
                          <td style={{ fontSize: 13, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.description || "—"}
                          </td>
                          <td>
                            <div className="table-actions">
                              <button
                                onClick={() => openEditModal(c)}
                                className="btn-secondary btn-sm"
                                title="تعديل"
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              {userCanDelete && (
                                <button
                                  onClick={() => deleteCertificate(c.id)}
                                  className="btn-danger btn-sm"
                                  title="حذف"
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
            />
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && editingCert && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-edit" style={{ color: "#6366f1" }}></i> {t("cert.edit")}
              </h3>
              <button className="modal-close" onClick={closeEditModal}>
                ×
              </button>
            </div>
            <form onSubmit={updateCertificate}>
              <div className="modal-body">
                <div className="form-group">
                  <label>{t("cert.project")} *</label>
                  <select
                    value={editingCert.projectId}
                    onChange={(e) =>
                      setEditingCert({ ...editingCert, projectId: e.target.value })
                    }
                    required
                  >
                    <option value="">{t("cert.chooseProject")}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t("cert.amount")} *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingCert.amount}
                    onChange={(e) =>
                      setEditingCert({ ...editingCert, amount: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t("cert.paidAmount")}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingCert.paidAmount ?? ""}
                    onChange={(e) =>
                      setEditingCert({ ...editingCert, paidAmount: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>{t("cert.status")}</label>
                  <select
                    value={editingCert.status}
                    onChange={(e) =>
                      setEditingCert({ ...editingCert, status: e.target.value })
                    }
                  >
                    <option value="pending">{t("cert.pending")}</option>
                    <option value="approved">{t("cert.approved")}</option>
                    <option value="paid">{t("cert.paid")}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t("cert.dueDate")}</label>
                  <input
                    type="date"
                    value={editingCert.dueDate || ""}
                    onChange={(e) =>
                      setEditingCert({ ...editingCert, dueDate: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>{t("cert.description")}</label>
                  <input
                    type="text"
                    value={editingCert.description || ""}
                    onChange={(e) =>
                      setEditingCert({ ...editingCert, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={closeEditModal}>
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
  );
}
