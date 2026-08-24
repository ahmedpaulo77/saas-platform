// src/pages/Projects.js - مع عزل البيانات حسب الشركة ودعم الترجمة و createdBy
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
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

export default function Projects() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    budget: "",
    status: "pending",
  });
  const [loading, setLoading] = useState(true);

  const [editingProject, setEditingProject] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchProjects = useCallback(async () => {
    // ✅ تأكد من وجود userCompanyId قبل جلب البيانات
    if (!userCompanyId) {
      setProjects([]);
      setLoading(false);
      return;
    }

    try {
      const querySnapshot = await getDocs(
        getScopedQuery("projects", userRole, userCompanyId, currentUser?.uid)
      );
      const projectsData = [];
      querySnapshot.forEach((d) => {
        projectsData.push({ id: d.id, ...d.data() });
      });
      setProjects(projectsData);
    } catch (error) {
      console.error("Error fetching projects:", error);
      alert(t("pr.fetchErr"));
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid, t]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function addProject(e) {
    e.preventDefault();
    if (!newProject.name || !newProject.startDate || !newProject.endDate) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      await addDoc(collection(db, "projects"), {
        ...newProject,
        companyId: userCompanyId,
        createdBy: currentUser?.uid, // ✅ إضافة createdBy
        budget: parseFloat(newProject.budget) || 0,
        createdAt: new Date().toISOString(),
      });
      setNewProject({
        name: "",
        description: "",
        startDate: "",
        endDate: "",
        budget: "",
        status: "pending",
      });
      await fetchProjects();
      alert(t("pr.addOk"));
    } catch (error) {
      console.error("Error adding project:", error);
      alert(t("pr.addFail"));
    }
  }

  function openEditModal(project) {
    setEditingProject(project);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingProject(null);
    setShowEditModal(false);
  }

  async function updateProject(e) {
    e.preventDefault();
    if (
      !editingProject.name ||
      !editingProject.startDate ||
      !editingProject.endDate
    ) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      const projectRef = doc(db, "projects", editingProject.id);
      await updateDoc(projectRef, {
        name: editingProject.name,
        description: editingProject.description || "",
        startDate: editingProject.startDate,
        endDate: editingProject.endDate,
        budget: parseFloat(editingProject.budget) || 0,
        status: editingProject.status,
      });
      await fetchProjects();
      closeEditModal();
      alert(t("pr.updOk"));
    } catch (error) {
      console.error("Error updating project:", error);
      alert(t("pr.updFail"));
    }
  }

  async function deleteProject(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "projects", id));
      await fetchProjects();
      alert(t("pr.delOk"));
    } catch (error) {
      console.error("Error deleting project:", error);
      alert(t("pr.delFail"));
    }
  }

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.description &&
        project.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ✅ التحقق من صلاحية الحذف
  const userCanDelete = canDelete(userRole);

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">{t("common.loading")}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>
          <i className="fas fa-project-diagram" style={{ color: "#4f46e5" }}></i>{" "}
          {t("pr.title")}
        </h2>

        <form onSubmit={addProject} className="form-container">
          <input
            type="text"
            placeholder={t("pr.phName")}
            value={newProject.name}
            onChange={(e) =>
              setNewProject({ ...newProject, name: e.target.value })
            }
            required
          />
          <input
            type="text"
            placeholder={t("pr.phDesc")}
            value={newProject.description}
            onChange={(e) =>
              setNewProject({ ...newProject, description: e.target.value })
            }
          />
          <input
            type="date"
            value={newProject.startDate}
            onChange={(e) =>
              setNewProject({ ...newProject, startDate: e.target.value })
            }
            required
          />
          <input
            type="date"
            value={newProject.endDate}
            onChange={(e) =>
              setNewProject({ ...newProject, endDate: e.target.value })
            }
            required
          />
          <input
            type="number"
            placeholder={t("pr.phBudget")}
            value={newProject.budget}
            onChange={(e) =>
              setNewProject({ ...newProject, budget: e.target.value })
            }
          />
          <select
            value={newProject.status}
            onChange={(e) =>
              setNewProject({ ...newProject, status: e.target.value })
            }
          >
            <option value="pending">{t("pr.pending")}</option>
            <option value="in-progress">{t("pr.progress")}</option>
            <option value="completed">{t("pr.done")}</option>
            <option value="on-hold">{t("pr.hold")}</option>
          </select>
          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> {t("pr.add")}
          </button>
        </form>

        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder={t("pr.search")}
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
            onFocus={(e) => (e.target.style.borderColor = "#4f46e5")}
            onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
          />
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>{t("pr.list")}</h3>
            <span>{filteredProjects.length} {t("pr.projects")}</span>
          </div>
          {filteredProjects.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm ? t("common.noResults") : t("pr.empty")}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("pr.name")}</th>
                  <th>{t("common.description")}</th>
                  <th>{t("pr.start")}</th>
                  <th>{t("pr.end")}</th>
                  <th>{t("pr.budget")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project, index) => (
                  <tr key={project.id}>
                    <td>{index + 1}</td>
                    <td>{project.name}</td>
                    <td>{project.description || "-"}</td>
                    <td>{new Date(project.startDate).toLocaleDateString()}</td>
                    <td>{new Date(project.endDate).toLocaleDateString()}</td>
                    <td>
                      {project.budget
                        ? project.budget.toLocaleString() + ` ${t("currency")}`
                        : "-"}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          project.status === "completed"
                            ? "badge-paid"
                            : project.status === "in-progress"
                            ? "badge-pending"
                            : project.status === "on-hold"
                            ? "badge-expired"
                            : "badge-active"
                        }`}
                      >
                        {project.status === "completed"
                          ? t("pr.done")
                          : project.status === "in-progress"
                          ? t("pr.progress")
                          : project.status === "on-hold"
                          ? t("pr.hold")
                          : t("pr.pending")}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => openEditModal(project)}
                        className="btn-primary"
                        style={{
                          marginLeft: "8px",
                          padding: "6px 14px",
                          fontSize: "13px",
                        }}
                      >
                        <i className="fas fa-edit"></i> {t("common.edit")}
                      </button>
                      {userCanDelete && (
                        <button
                          onClick={() => deleteProject(project.id)}
                          className="btn-danger"
                        >
                          <i className="fas fa-trash"></i> {t("common.delete")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showEditModal && editingProject && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>
                <i className="fas fa-edit"></i> {t("pr.editTitle")}
              </h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>
                &times;
              </button>
            </div>
            <form onSubmit={updateProject}>
              <div style={styles.formGroup}>
                <label>{t("pr.name")}</label>
                <input
                  type="text"
                  value={editingProject.name}
                  onChange={(e) =>
                    setEditingProject({
                      ...editingProject,
                      name: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.description")}</label>
                <input
                  type="text"
                  value={editingProject.description || ""}
                  onChange={(e) =>
                    setEditingProject({
                      ...editingProject,
                      description: e.target.value,
                    })
                  }
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("pr.start")}</label>
                <input
                  type="date"
                  value={editingProject.startDate}
                  onChange={(e) =>
                    setEditingProject({
                      ...editingProject,
                      startDate: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("pr.end")}</label>
                <input
                  type="date"
                  value={editingProject.endDate}
                  onChange={(e) =>
                    setEditingProject({
                      ...editingProject,
                      endDate: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("pr.budget")}</label>
                <input
                  type="number"
                  value={editingProject.budget || ""}
                  onChange={(e) =>
                    setEditingProject({
                      ...editingProject,
                      budget: e.target.value,
                    })
                  }
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.status")}</label>
                <select
                  value={editingProject.status}
                  onChange={(e) =>
                    setEditingProject({
                      ...editingProject,
                      status: e.target.value,
                    })
                  }
                  style={styles.input}
                >
                  <option value="pending">{t("pr.pending")}</option>
                  <option value="in-progress">{t("pr.progress")}</option>
                  <option value="completed">{t("pr.done")}</option>
                  <option value="on-hold">{t("pr.hold")}</option>
                </select>
              </div>
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="btn-danger"
                  style={{ marginLeft: "10px" }}
                >
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

const styles = {
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "30px",
    width: "90%",
    maxWidth: "500px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
    direction: "rtl",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    borderBottom: "1px solid #e2e8f0",
    paddingBottom: "15px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "28px",
    cursor: "pointer",
    color: "#94a3b8",
    transition: "color 0.3s",
  },
  formGroup: {
    marginBottom: "16px",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    border: "2px solid #e2e8f0",
    borderRadius: "10px",
    fontSize: "15px",
    transition: "border-color 0.3s",
    marginTop: "6px",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "20px",
    borderTop: "1px solid #e2e8f0",
    paddingTop: "20px",
  },
};