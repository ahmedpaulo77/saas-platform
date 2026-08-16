// src/pages/Projects.js - مع عزل البيانات حسب الشركة
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
import Sidebar from "../components/common/Sidebar";

export default function Projects() {
  const { userRole, userCompanyId } = useAuth();
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
    try {
      const querySnapshot = await getDocs(
        getScopedQuery("projects", userRole, userCompanyId),
      );
      const projectsData = [];
      querySnapshot.forEach((d) => {
        projectsData.push({ id: d.id, ...d.data() });
      });
      setProjects(projectsData);
    } catch (error) {
      console.error("Error fetching projects:", error);
      alert("حدث خطأ في جلب المشاريع");
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function addProject(e) {
    e.preventDefault();
    if (!newProject.name || !newProject.startDate || !newProject.endDate) {
      alert("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    try {
      await addDoc(collection(db, "projects"), {
        ...newProject,
        companyId: userCompanyId,
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
      alert("✅ تم إضافة المشروع بنجاح");
    } catch (error) {
      console.error("Error adding project:", error);
      alert("❌ حدث خطأ في إضافة المشروع");
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
      alert("يرجى ملء جميع الحقول المطلوبة");
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
      alert("✅ تم تحديث المشروع بنجاح");
    } catch (error) {
      console.error("Error updating project:", error);
      alert("❌ حدث خطأ في تحديث المشروع");
    }
  }

  async function deleteProject(id) {
    if (!window.confirm("هل أنت متأكد من حذف هذا المشروع؟")) return;
    try {
      await deleteDoc(doc(db, "projects", id));
      await fetchProjects();
      alert("✅ تم حذف المشروع بنجاح");
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("❌ حدث خطأ في حذف المشروع");
    }
  }

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.description &&
        project.description.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  if (loading) {
    return <div className="loading">جاري تحميل المشاريع...</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>
          <i
            className="fas fa-project-diagram"
            style={{ color: "#4f46e5" }}
          ></i>{" "}
          إدارة المشاريع
        </h2>

        <form onSubmit={addProject} className="form-container">
          <input
            type="text"
            placeholder="اسم المشروع"
            value={newProject.name}
            onChange={(e) =>
              setNewProject({ ...newProject, name: e.target.value })
            }
            required
          />
          <input
            type="text"
            placeholder="الوصف"
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
            placeholder="الميزانية"
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
            <option value="pending">قيد الانتظار</option>
            <option value="in-progress">جاري التنفيذ</option>
            <option value="completed">منجز</option>
            <option value="on-hold">متوقف</option>
          </select>
          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> إضافة مشروع
          </button>
        </form>

        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder="🔍 ابحث عن مشروع..."
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
            <h3>قائمة المشاريع</h3>
            <span>{filteredProjects.length} مشروع</span>
          </div>
          {filteredProjects.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm
                ? "❌ لا توجد نتائج مطابقة للبحث"
                : "لا توجد مشاريع مسجلة حتى الآن"}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم المشروع</th>
                  <th>الوصف</th>
                  <th>تاريخ البداية</th>
                  <th>تاريخ النهاية</th>
                  <th>الميزانية</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
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
                        ? project.budget.toLocaleString() + " ج.م"
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
                          ? "منجز"
                          : project.status === "in-progress"
                            ? "جاري التنفيذ"
                            : project.status === "on-hold"
                              ? "متوقف"
                              : "قيد الانتظار"}
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
                        <i className="fas fa-edit"></i> تعديل
                      </button>
                      <button
                        onClick={() => deleteProject(project.id)}
                        className="btn-danger"
                      >
                        <i className="fas fa-trash"></i> حذف
                      </button>
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
                <i className="fas fa-edit"></i> تعديل المشروع
              </h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>
                &times;
              </button>
            </div>
            <form onSubmit={updateProject}>
              <div style={styles.formGroup}>
                <label>اسم المشروع</label>
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
                <label>الوصف</label>
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
                <label>تاريخ البداية</label>
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
                <label>تاريخ النهاية</label>
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
                <label>الميزانية</label>
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
                <label>الحالة</label>
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
                  <option value="pending">قيد الانتظار</option>
                  <option value="in-progress">جاري التنفيذ</option>
                  <option value="completed">منجز</option>
                  <option value="on-hold">متوقف</option>
                </select>
              </div>
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="btn-danger"
                  style={{ marginLeft: "10px" }}
                >
                  إلغاء
                </button>
                <button type="submit" className="btn-primary">
                  <i className="fas fa-save"></i> حفظ التعديلات
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
