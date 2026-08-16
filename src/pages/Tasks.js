// src/pages/Tasks.js - مع عزل البيانات حسب الشركة
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

export default function Tasks() {
  const { userRole, userCompanyId } = useAuth();
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
    try {
      const querySnapshot = await getDocs(
        getScopedQuery("tasks", userRole, userCompanyId),
      );
      const tasksData = [];
      querySnapshot.forEach((d) => {
        tasksData.push({ id: d.id, ...d.data() });
      });
      setTasks(tasksData);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      alert("حدث خطأ في جلب المهام");
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function addTask(e) {
    e.preventDefault();
    if (!newTask.title || !newTask.dueDate) {
      alert("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    try {
      await addDoc(collection(db, "tasks"), {
        ...newTask,
        companyId: userCompanyId,
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
      alert("✅ تم إضافة المهمة بنجاح");
    } catch (error) {
      console.error("Error adding task:", error);
      alert("❌ حدث خطأ في إضافة المهمة");
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
      alert("يرجى ملء جميع الحقول المطلوبة");
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
      alert("✅ تم تحديث المهمة بنجاح");
    } catch (error) {
      console.error("Error updating task:", error);
      alert("❌ حدث خطأ في تحديث المهمة");
    }
  }

  async function deleteTask(id) {
    if (!window.confirm("هل أنت متأكد من حذف هذه المهمة؟")) return;
    try {
      await deleteDoc(doc(db, "tasks", id));
      await fetchTasks();
      alert("✅ تم حذف المهمة بنجاح");
    } catch (error) {
      console.error("Error deleting task:", error);
      alert("❌ حدث خطأ في حذف المهمة");
    }
  }

  // فلترة المهام حسب البحث والحالة
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.description &&
        task.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter =
      filterStatus === "all" || task.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  // ترتيب المهام حسب الأولوية
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sortedTasks = [...filteredTasks].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );

  if (loading) {
    return <div className="loading">جاري تحميل المهام...</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>📋 إدارة المهام</h2>

        {/* نموذج الإضافة */}
        <form onSubmit={addTask} className="form-container">
          <input
            type="text"
            placeholder="عنوان المهمة"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="الوصف"
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
            <option value="high">عالية</option>
            <option value="medium">متوسطة</option>
            <option value="low">منخفضة</option>
          </select>
          <select
            value={newTask.status}
            onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
          >
            <option value="pending">قيد الانتظار</option>
            <option value="in-progress">جاري التنفيذ</option>
            <option value="completed">منجزة</option>
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
            placeholder="المسؤول (اختياري)"
            value={newTask.assignedTo}
            onChange={(e) =>
              setNewTask({ ...newTask, assignedTo: e.target.value })
            }
          />
          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> إضافة مهمة
          </button>
        </form>

        {/* حقل البحث والفلتر */}
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
            placeholder="🔍 ابحث عن مهمة..."
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
            <option value="all">جميع المهام</option>
            <option value="pending">قيد الانتظار</option>
            <option value="in-progress">جاري التنفيذ</option>
            <option value="completed">منجزة</option>
          </select>
        </div>

        {/* جدول المهام */}
        <div className="table-container">
          <div className="table-header">
            <h3>قائمة المهام</h3>
            <span>{sortedTasks.length} مهمة</span>
          </div>
          {sortedTasks.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm || filterStatus !== "all"
                ? "❌ لا توجد نتائج مطابقة"
                : "لا توجد مهام مسجلة حتى الآن"}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>العنوان</th>
                  <th>الوصف</th>
                  <th>الأولوية</th>
                  <th>الحالة</th>
                  <th>تاريخ الاستحقاق</th>
                  <th>المسؤول</th>
                  <th>الإجراءات</th>
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
                          ? "عالية"
                          : task.priority === "medium"
                            ? "متوسطة"
                            : "منخفضة"}
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
                          ? "منجزة"
                          : task.status === "in-progress"
                            ? "جاري التنفيذ"
                            : "قيد الانتظار"}
                      </span>
                    </td>
                    <td>{new Date(task.dueDate).toLocaleDateString()}</td>{" "}
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
                        <i className="fas fa-edit"></i> تعديل
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
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

      {/* مودال التعديل */}
      {showEditModal && editingTask && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>
                <i className="fas fa-edit"></i> تعديل المهمة
              </h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>
                &times;
              </button>
            </div>
            <form onSubmit={updateTask}>
              <div style={styles.formGroup}>
                <label>عنوان المهمة</label>
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
                <label>الوصف</label>
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
                <label>الأولوية</label>
                <select
                  value={editingTask.priority}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, priority: e.target.value })
                  }
                  style={styles.input}
                >
                  <option value="high">عالية</option>
                  <option value="medium">متوسطة</option>
                  <option value="low">منخفضة</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>الحالة</label>
                <select
                  value={editingTask.status}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, status: e.target.value })
                  }
                  style={styles.input}
                >
                  <option value="pending">قيد الانتظار</option>
                  <option value="in-progress">جاري التنفيذ</option>
                  <option value="completed">منجزة</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>تاريخ الاستحقاق</label>
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
                <label>المسؤول</label>
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
