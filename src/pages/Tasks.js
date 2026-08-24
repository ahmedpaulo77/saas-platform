// src/pages/Tasks.js - مع عزل البيانات حسب الشركة ودعم الترجمة و createdBy
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

export default function Tasks() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "pending",
    dueDate: "",
    assignedTo: "",
  });
  const [loading, setLoading] = useState(true);

  const [editingTask, setEditingTask] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchTasks = useCallback(async () => {
    // ✅ تأكد من وجود userCompanyId قبل جلب البيانات
    if (!userCompanyId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    try {
      const querySnapshot = await getDocs(
        getScopedQuery("tasks", userRole, userCompanyId, currentUser?.uid)
      );
      const tasksData = [];
      querySnapshot.forEach((d) => {
        tasksData.push({ id: d.id, ...d.data() });
      });
      setTasks(tasksData);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      alert(t("tk.fetchErr"));
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid, t]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function addTask(e) {
    e.preventDefault();
    if (!newTask.title || !newTask.dueDate) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      await addDoc(collection(db, "tasks"), {
        ...newTask,
        companyId: userCompanyId,
        createdBy: currentUser?.uid, // ✅ إضافة createdBy
        createdAt: new Date().toISOString(),
      });
      setNewTask({
        title: "",
        description: "",
        priority: "medium",
        status: "pending",
        dueDate: "",
        assignedTo: "",
      });
      await fetchTasks();
      alert(t("tk.addOk"));
    } catch (error) {
      console.error("Error adding task:", error);
      alert(t("tk.addFail"));
    }
  }

  function openEditModal(task) {
    setEditingTask(task);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingTask(null);
    setShowEditModal(false);
  }

  async function updateTask(e) {
    e.preventDefault();
    if (!editingTask.title || !editingTask.dueDate) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      const taskRef = doc(db, "tasks", editingTask.id);
      await updateDoc(taskRef, {
        title: editingTask.title,
        description: editingTask.description || "",
        priority: editingTask.priority,
        status: editingTask.status,
        dueDate: editingTask.dueDate,
        assignedTo: editingTask.assignedTo || "",
      });
      await fetchTasks();
      closeEditModal();
      alert(t("tk.updOk"));
    } catch (error) {
      console.error("Error updating task:", error);
      alert(t("tk.updFail"));
    }
  }

  async function deleteTask(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "tasks", id));
      await fetchTasks();
      alert(t("tk.delOk"));
    } catch (error) {
      console.error("Error deleting task:", error);
      alert(t("tk.delFail"));
    }
  }

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.description &&
        task.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter =
      filterStatus === "all" || task.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sortedTasks = [...filteredTasks].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
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
          📋 {t("tk.title")}
        </h2>

        <form onSubmit={addTask} className="form-container">
          <input
            type="text"
            placeholder={t("tk.phTitle")}
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder={t("tk.phDesc")}
            value={newTask.description}
            onChange={(e) =>
              setNewTask({ ...newTask, description: e.target.value })
            }
          />
          <select
            value={newTask.priority}
            onChange={(e) =>
              setNewTask({ ...newTask, priority: e.target.value })
            }
          >
            <option value="high">{t("tk.high")}</option>
            <option value="medium">{t("tk.medium")}</option>
            <option value="low">{t("tk.low")}</option>
          </select>
          <select
            value={newTask.status}
            onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
          >
            <option value="pending">{t("tk.pending")}</option>
            <option value="in-progress">{t("tk.progress")}</option>
            <option value="completed">{t("tk.done")}</option>
          </select>
          <input
            type="date"
            value={newTask.dueDate}
            onChange={(e) =>
              setNewTask({ ...newTask, dueDate: e.target.value })
            }
            required
          />
          <input
            type="text"
            placeholder={t("tk.phAssignee")}
            value={newTask.assignedTo}
            onChange={(e) =>
              setNewTask({ ...newTask, assignedTo: e.target.value })
            }
          />
          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> {t("tk.add")}
          </button>
        </form>

        <div
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder={t("tk.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "2px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "15px",
              outline: "none",
              minWidth: "200px",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#4f46e5")}
            onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: "12px 16px",
              border: "2px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "15px",
              outline: "none",
              backgroundColor: "white",
            }}
          >
            <option value="all">{t("tk.all")}</option>
            <option value="pending">{t("tk.pending")}</option>
            <option value="in-progress">{t("tk.progress")}</option>
            <option value="completed">{t("tk.done")}</option>
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>{t("tk.list")}</h3>
            <span>{sortedTasks.length} {t("tk.tasks")}</span>
          </div>
          {sortedTasks.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm || filterStatus !== "all"
                ? t("common.noResults")
                : t("tk.empty")}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("tk.heading")}</th>
                  <th>{t("common.description")}</th>
                  <th>{t("tk.priority")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("tk.due")}</th>
                  <th>{t("tk.assignee")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map((task, index) => (
                  <tr key={task.id}>
                    <td>{index + 1}</td>
                    <td>{task.title}</td>
                    <td>{task.description || "-"}</td>
                    <td>
                      <span
                        className={`badge ${
                          task.priority === "high"
                            ? "badge-expired"
                            : task.priority === "medium"
                            ? "badge-pending"
                            : "badge-active"
                        }`}
                      >
                        {task.priority === "high"
                          ? t("tk.high")
                          : task.priority === "medium"
                          ? t("tk.medium")
                          : t("tk.low")}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          task.status === "completed"
                            ? "badge-paid"
                            : task.status === "in-progress"
                            ? "badge-pending"
                            : "badge-expired"
                        }`}
                      >
                        {task.status === "completed"
                          ? t("tk.done")
                          : task.status === "in-progress"
                          ? t("tk.progress")
                          : t("tk.pending")}
                      </span>
                    </td>
                    <td>{new Date(task.dueDate).toLocaleDateString()}</td>
                    <td>{task.assignedTo || "-"}</td>
                    <td>
                      <button
                        onClick={() => openEditModal(task)}
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
                          onClick={() => deleteTask(task.id)}
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

      {showEditModal && editingTask && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>
                <i className="fas fa-edit"></i> {t("tk.editTitle")}
              </h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>
                &times;
              </button>
            </div>
            <form onSubmit={updateTask}>
              <div style={styles.formGroup}>
                <label>{t("tk.heading")}</label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, title: e.target.value })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.description")}</label>
                <input
                  type="text"
                  value={editingTask.description || ""}
                  onChange={(e) =>
                    setEditingTask({
                      ...editingTask,
                      description: e.target.value,
                    })
                  }
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("tk.priority")}</label>
                <select
                  value={editingTask.priority}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, priority: e.target.value })
                  }
                  style={styles.input}
                >
                  <option value="high">{t("tk.high")}</option>
                  <option value="medium">{t("tk.medium")}</option>
                  <option value="low">{t("tk.low")}</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.status")}</label>
                <select
                  value={editingTask.status}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, status: e.target.value })
                  }
                  style={styles.input}
                >
                  <option value="pending">{t("tk.pending")}</option>
                  <option value="in-progress">{t("tk.progress")}</option>
                  <option value="completed">{t("tk.done")}</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>{t("tk.due")}</label>
                <input
                  type="date"
                  value={editingTask.dueDate}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, dueDate: e.target.value })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("tk.assignee")}</label>
                <input
                  type="text"
                  value={editingTask.assignedTo || ""}
                  onChange={(e) =>
                    setEditingTask({
                      ...editingTask,
                      assignedTo: e.target.value,
                    })
                  }
                  style={styles.input}
                />
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