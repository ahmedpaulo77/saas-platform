// src/pages/Suppliers.js - إدارة الموردين
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";

export default function Suppliers() {
  const { userRole, userCompanyId } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("suppliers", userRole, userCompanyId));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSuppliers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  async function addSupplier(e) {
    e.preventDefault();
    if (!newSupplier.name) {
      alert("يرجى ملء اسم المورد");
      return;
    }
    try {
      await addDoc(collection(db, "suppliers"), {
        ...newSupplier,
        companyId: userCompanyId,
        createdAt: new Date().toISOString(),
      });
      setNewSupplier({ name: "", phone: "", email: "", address: "", notes: "" });
      await fetchSuppliers();
      alert("✅ تم إضافة المورد بنجاح");
    } catch (error) {
      console.error(error);
      alert("❌ حدث خطأ في إضافة المورد");
    }
  }

  function openEditModal(supplier) {
    setEditingSupplier(supplier);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingSupplier(null);
    setShowEditModal(false);
  }

  async function updateSupplier(e) {
    e.preventDefault();
    if (!editingSupplier.name) {
      alert("يرجى ملء اسم المورد");
      return;
    }
    try {
      const supplierRef = doc(db, "suppliers", editingSupplier.id);
      await updateDoc(supplierRef, {
        name: editingSupplier.name,
        phone: editingSupplier.phone || "",
        email: editingSupplier.email || "",
        address: editingSupplier.address || "",
        notes: editingSupplier.notes || "",
      });
      await fetchSuppliers();
      closeEditModal();
      alert("✅ تم تحديث المورد بنجاح");
    } catch (error) {
      console.error(error);
      alert("❌ حدث خطأ في تحديث المورد");
    }
  }

  async function deleteSupplier(id) {
    if (!window.confirm("هل أنت متأكد من حذف هذا المورد؟")) return;
    try {
      await deleteDoc(doc(db, "suppliers", id));
      await fetchSuppliers();
      alert("✅ تم حذف المورد بنجاح");
    } catch (error) {
      console.error(error);
      alert("❌ حدث خطأ في حذف المورد");
    }
  }

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.phone && s.phone.includes(searchTerm)) ||
    (s.email && s.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return <div className="loading">جاري تحميل الموردين...</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>
          <i className="fas fa-truck" style={{ color: "#f59e0b" }}></i>{" "}
          إدارة الموردين
        </h2>

        {/* نموذج الإضافة */}
        <form onSubmit={addSupplier} className="form-container">
          <input
            type="text"
            placeholder="اسم المورد *"
            value={newSupplier.name}
            onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="الهاتف"
            value={newSupplier.phone}
            onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
          />
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={newSupplier.email}
            onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
          />
          <input
            type="text"
            placeholder="العنوان"
            value={newSupplier.address}
            onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
          />
          <input
            type="text"
            placeholder="ملاحظات"
            value={newSupplier.notes}
            onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
          />
          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> إضافة مورد
          </button>
        </form>

        {/* البحث */}
        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder="🔍 ابحث عن مورد بالاسم أو الهاتف أو البريد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "2px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "15px",
              transition: "border-color 0.3s",
              outline: "none",
            }}
          />
        </div>

        {/* جدول الموردين */}
        <div className="table-container">
          <div className="table-header">
            <h3>قائمة الموردين</h3>
            <span>{filteredSuppliers.length} مورد</span>
          </div>
          {filteredSuppliers.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm ? "❌ لا توجد نتائج مطابقة للبحث" : "لا يوجد موردين مسجلين حتى الآن"}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم المورد</th>
                  <th>الهاتف</th>
                  <th>البريد الإلكتروني</th>
                  <th>العنوان</th>
                  <th>ملاحظات</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier, index) => (
                  <tr key={supplier.id}>
                    <td>{index + 1}</td>
                    <td style={{ fontWeight: 600 }}>{supplier.name}</td>
                    <td>{supplier.phone || "-"}</td>
                    <td>{supplier.email || "-"}</td>
                    <td>{supplier.address || "-"}</td>
                    <td>{supplier.notes || "-"}</td>
                    <td>
                      <button
                        onClick={() => openEditModal(supplier)}
                        className="btn-primary"
                        style={{ marginLeft: "8px", padding: "6px 14px", fontSize: "13px" }}
                      >
                        <i className="fas fa-edit"></i> تعديل
                      </button>
                      <button
                        onClick={() => deleteSupplier(supplier.id)}
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
      {showEditModal && editingSupplier && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-edit"></i> تعديل المورد</h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={updateSupplier}>
              <div style={styles.formGroup}>
                <label>اسم المورد</label>
                <input
                  type="text"
                  value={editingSupplier.name}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>الهاتف</label>
                <input
                  type="text"
                  value={editingSupplier.phone || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>البريد الإلكتروني</label>
                <input
                  type="email"
                  value={editingSupplier.email || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>العنوان</label>
                <input
                  type="text"
                  value={editingSupplier.address || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, address: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>ملاحظات</label>
                <input
                  type="text"
                  value={editingSupplier.notes || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, notes: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={closeEditModal} className="btn-danger" style={{ marginLeft: "10px" }}>
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