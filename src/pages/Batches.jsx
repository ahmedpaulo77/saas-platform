// src/pages/Batches.jsx - إدارة التشغيلات (Pharmacy batches) مع صلاحية وانتهاء
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import Pagination from "../components/common/Pagination";

function parseDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getExpiryStatus(expiryDate) {
  const expDate = parseDate(expiryDate);
  if (!expDate || isNaN(expDate.getTime())) return { key: "no_date", label: "بدون تاريخ", color: "#94a3b8", bg: "#f1f5f9", daysLeft: null };
  const today = startOfDay(new Date());
  const exp = startOfDay(expDate);
  const daysLeft = Math.round((exp - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) {
    return { key: "expired", label: `منتهي منذ ${Math.abs(daysLeft)} يوم`, color: "#dc2626", bg: "#fee2e2", daysLeft };
  } else if (daysLeft <= 30) {
    return { key: "expiring", label: `ينتهي خلال ${daysLeft} يوم`, color: "#d97706", bg: "#fef3c7", daysLeft };
  } else {
    return { key: "valid", label: `صالح حتى ${expDate.toLocaleDateString("ar-EG")}`, color: "#16a34a", bg: "#f0fdf4", daysLeft };
  }
}

export default function Batches() {
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [newBatch, setNewBatch] = useState({
    productId: "",
    batchNumber: "",
    quantity: "",
    expiryDate: "",
    purchasePrice: "",
    supplier: "",
  });

  const [editingBatch, setEditingBatch] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterExpiry, setFilterExpiry] = useState("all");

  const fetchProducts = useCallback(async () => {
    if (!userCompanyId) {
      setProducts([]);
      return;
    }
    try {
      const snap = await getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(data);
    } catch (e) {
      console.error("fetchProducts error", e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchBatches = useCallback(async () => {
    if (!userCompanyId) {
      setBatches([]);
      setLoading(false);
      return;
    }
    try {
      const snap = await getDocs(getScopedQuery("batches", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // sort by expiryDate asc
      data.sort((a, b) => new Date(a.expiryDate || "9999-12-31") - new Date(b.expiryDate || "9999-12-31"));
      setBatches(data);
    } catch (e) {
      console.error("fetchBatches error", e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchProducts(), fetchBatches()]);
  }, [fetchProducts, fetchBatches]);

  const getProductName = useCallback((batch) => {
    if (batch.productName) return batch.productName;
    const p = products.find((x) => x.id === batch.productId);
    return p ? p.name : batch.productId || "—";
  }, [products]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newBatch.productId || !newBatch.batchNumber.trim() || !newBatch.quantity || !newBatch.expiryDate) {
      alert("يرجى ملء الحقول المطلوبة (المنتج، رقم التشغيلة، الكمية، تاريخ الصلاحية)");
      return;
    }
    setSubmitting(true);
    try {
      const prod = products.find((p) => p.id === newBatch.productId);
      const payload = {
        productId: newBatch.productId,
        productName: prod?.name || "",
        batchNumber: newBatch.batchNumber.trim(),
        quantity: parseFloat(newBatch.quantity) || 0,
        expiryDate: newBatch.expiryDate,
        purchasePrice: newBatch.purchasePrice ? parseFloat(newBatch.purchasePrice) : 0,
        supplier: newBatch.supplier ? newBatch.supplier.trim() : "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, "batches"), payload);
      await logActivity({
        actionType: "CREATE",
        collectionName: "batches",
        itemId: docRef.id,
        details: `Created batch ${payload.batchNumber} for ${payload.productName} qty ${payload.quantity}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewBatch({ productId: "", batchNumber: "", quantity: "", expiryDate: "", purchasePrice: "", supplier: "" });
      await fetchBatches();
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء إضافة التشغيلة");
    }
    setSubmitting(false);
  }

  function openEdit(batch) {
    setEditingBatch({
      ...batch,
      quantity: String(batch.quantity ?? ""),
      purchasePrice: batch.purchasePrice != null ? String(batch.purchasePrice) : "",
      supplier: batch.supplier || "",
      expiryDate: batch.expiryDate || "",
      batchNumber: batch.batchNumber || "",
      productId: batch.productId || "",
    });
    setShowEditModal(true);
  }

  function closeEdit() {
    setEditingBatch(null);
    setShowEditModal(false);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!editingBatch.productId || !editingBatch.batchNumber.trim() || !editingBatch.quantity || !editingBatch.expiryDate) {
      alert("يرجى ملء الحقول المطلوبة");
      return;
    }
    try {
      const prod = products.find((p) => p.id === editingBatch.productId);
      await updateDoc(doc(db, "batches", editingBatch.id), {
        productId: editingBatch.productId,
        productName: prod?.name || editingBatch.productName || "",
        batchNumber: editingBatch.batchNumber.trim(),
        quantity: parseFloat(editingBatch.quantity) || 0,
        expiryDate: editingBatch.expiryDate,
        purchasePrice: editingBatch.purchasePrice ? parseFloat(editingBatch.purchasePrice) : 0,
        supplier: editingBatch.supplier ? editingBatch.supplier.trim() : "",
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "batches",
        itemId: editingBatch.id,
        details: `Updated batch ${editingBatch.batchNumber}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      closeEdit();
      await fetchBatches();
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء التعديل");
    }
  }

  async function handleDelete(batch) {
    if (!window.confirm("هل أنت متأكد من حذف التشغيلة؟")) return;
    try {
      await deleteDoc(doc(db, "batches", batch.id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "batches",
        itemId: batch.id,
        details: `Deleted batch ${batch.batchNumber} for ${batch.productName || batch.productId}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchBatches();
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء الحذف");
    }
  }

  // Filter + search
  const filtered = batches.filter((b) => {
    const productName = getProductName(b).toLowerCase();
    const term = searchTerm.toLowerCase();
    const matchSearch = !term ||
      productName.includes(term) ||
      (b.batchNumber && b.batchNumber.toLowerCase().includes(term)) ||
      (b.supplier && b.supplier.toLowerCase().includes(term));

    const matchProduct = filterProduct === "all" || b.productId === filterProduct;

    const st = getExpiryStatus(b.expiryDate);
    let matchExpiry = true;
    if (filterExpiry === "expired") matchExpiry = st.key === "expired";
    else if (filterExpiry === "expiring") matchExpiry = st.key === "expiring";
    else if (filterExpiry === "valid") matchExpiry = st.key === "valid";

    return matchSearch && matchProduct && matchExpiry;
  });

  // counts for badges
  const counts = {
    expired: batches.filter((b) => getExpiryStatus(b.expiryDate).key === "expired").length,
    expiring: batches.filter((b) => getExpiryStatus(b.expiryDate).key === "expiring").length,
    valid: batches.filter((b) => getExpiryStatus(b.expiryDate).key === "valid").length,
  };

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content"><div className="loading">جاري التحميل...</div></div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1><i className="fas fa-pills" style={{ color: "#8b5cf6", marginLeft: 10 }}></i> التشغيلات</h1>
            <p className="subtitle">إدارة تشغيلات الأدوية — تتبع الصلاحية والكميات</p>
          </div>
          <button onClick={() => { setLoading(true); Promise.all([fetchProducts(), fetchBatches()]); }} className="btn-secondary">
            <i className="fas fa-sync-alt"></i> تحديث
          </button>
        </div>

        <div className="stats-row" style={{ marginBottom: 20 }}>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-times-circle"></i></div>
            <div className="stat-value">{counts.expired}</div>
            <div className="stat-label">منتهي</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div>
            <div className="stat-value">{counts.expiring}</div>
            <div className="stat-label">ينتهي خلال 30 يوم</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
            <div className="stat-value">{counts.valid}</div>
            <div className="stat-label">صالح</div>
          </div>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-boxes"></i></div>
            <div className="stat-value">{batches.length}</div>
            <div className="stat-label">الإجمالي</div>
          </div>
        </div>

        {/* Add Form */}
        <div className="form-card" style={{ border: "2px solid #8b5cf655", marginBottom: 20 }}>
          <h3><i className="fas fa-plus-circle" style={{ color: "#8b5cf6" }}></i> إضافة تشغيلة جديدة</h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>المنتج *</label>
                <select
                  value={newBatch.productId}
                  onChange={(e) => setNewBatch({ ...newBatch, productId: e.target.value })}
                  required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white", boxSizing: "border-box" }}
                >
                  <option value="">— اختر المنتج —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {products.length === 0 && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>لا توجد منتجات — أضفها من المخزون أولاً</div>}
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>رقم التشغيلة *</label>
                <input
                  type="text"
                  placeholder="B123"
                  value={newBatch.batchNumber}
                  onChange={(e) => setNewBatch({ ...newBatch, batchNumber: e.target.value })}
                  required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>الكمية *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={newBatch.quantity}
                  onChange={(e) => setNewBatch({ ...newBatch, quantity: e.target.value })}
                  required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>تاريخ الصلاحية *</label>
                <input
                  type="date"
                  value={newBatch.expiryDate}
                  onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })}
                  required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>سعر الشراء</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newBatch.purchasePrice}
                  onChange={(e) => setNewBatch({ ...newBatch, purchasePrice: e.target.value })}
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>المورد</label>
                <input
                  type="text"
                  placeholder="اسم المورد"
                  value={newBatch.supplier}
                  onChange={(e) => setNewBatch({ ...newBatch, supplier: e.target.value })}
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: 14 }}>
              <i className="fas fa-plus"></i> {submitting ? "جاري الإضافة..." : "إضافة التشغيلة"}
            </button>
          </form>
        </div>

        {/* Filters */}
        <div className="filter-bar" style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="search-wrapper" style={{ flex: 2, minWidth: 200, position: "relative", display: "flex", alignItems: "center" }}>
            <i className="fas fa-search search-icon" style={{ position: "absolute", right: 12, color: "#94a3b8" }}></i>
            <input
              type="text"
              placeholder="بحث: رقم التشغيلة، اسم الدواء، المورد..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "100%", padding: "12px 16px", paddingRight: 36, border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14 }}
            />
          </div>
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            style={{ flex: 1, minWidth: 160, padding: "12px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white" }}
          >
            <option value="all">كل المنتجات</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterExpiry}
            onChange={(e) => setFilterExpiry(e.target.value)}
            style={{ flex: 1, minWidth: 160, padding: "12px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white" }}
          >
            <option value="all">كل الحالات</option>
            <option value="expired">منتهي</option>
            <option value="expiring">ينتهي خلال 30 يوم</option>
            <option value="valid">صالح</option>
          </select>
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> قائمة التشغيلات</h3>
            <span className="table-count">{filtered.length} تشغيلة</span>
          </div>
          <Pagination
            data={filtered}
            pageSize={20}
            resetKey={`${searchTerm}-${filterProduct}-${filterExpiry}`}
            empty={
              <div className="empty-state" style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>
                <div className="empty-icon" style={{ fontSize: 32, marginBottom: 8 }}><i className="fas fa-box-open"></i></div>
                <p>{searchTerm || filterProduct !== "all" || filterExpiry !== "all" ? "لا توجد نتائج" : "لا توجد تشغيلات بعد — أضف أول تشغيلة"}</p>
              </div>
            }
            render={(pageItems, total, start) => (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>المنتج</th>
                    <th>رقم التشغيلة</th>
                    <th>الكمية</th>
                    <th>تاريخ الصلاحية</th>
                    <th>الحالة</th>
                    <th>سعر الشراء</th>
                    <th>المورد</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((b, idx) => {
                    const st = getExpiryStatus(b.expiryDate);
                    return (
                      <tr key={b.id} style={{ background: st.key === "expired" ? "#fff5f5" : st.key === "expiring" ? "#fffbeb" : "white" }}>
                        <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>{start + idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{getProductName(b)}</td>
                        <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{b.batchNumber}</td>
                        <td style={{ fontWeight: 700, textAlign: "center" }}>{b.quantity}</td>
                        <td>{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString("ar-EG") : "—"}</td>
                        <td>
                          <span className="badge" style={{ background: st.bg, color: st.color, fontWeight: 700, padding: "4px 10px", borderRadius: 20, fontSize: 12 }}>
                            {st.label}
                          </span>
                        </td>
                        <td>{b.purchasePrice != null && b.purchasePrice !== "" ? `${parseFloat(b.purchasePrice).toFixed(2)}` : "—"}</td>
                        <td>{b.supplier || "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => openEdit(b)} className="btn-primary" style={{ padding: "6px 10px", fontSize: 12 }}>
                              <i className="fas fa-edit"></i>
                            </button>
                            {userCanDelete && (
                              <button onClick={() => handleDelete(b)} className="btn-danger" style={{ padding: "6px 10px", fontSize: 12 }}>
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

      {showEditModal && editingBatch && (
        <div style={styles.modalOverlay} onClick={closeEdit}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-edit"></i> تعديل التشغيلة</h3>
              <button onClick={closeEdit} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div style={styles.formGroup}>
                <label>المنتج *</label>
                <select
                  value={editingBatch.productId}
                  onChange={(e) => setEditingBatch({ ...editingBatch, productId: e.target.value })}
                  required
                  style={styles.input}
                >
                  <option value="">— اختر المنتج —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>رقم التشغيلة *</label>
                <input type="text" value={editingBatch.batchNumber} onChange={(e) => setEditingBatch({ ...editingBatch, batchNumber: e.target.value })} required style={styles.input} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={styles.formGroup}>
                  <label>الكمية *</label>
                  <input type="number" min="0" step="1" value={editingBatch.quantity} onChange={(e) => setEditingBatch({ ...editingBatch, quantity: e.target.value })} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label>تاريخ الصلاحية *</label>
                  <input type="date" value={editingBatch.expiryDate} onChange={(e) => setEditingBatch({ ...editingBatch, expiryDate: e.target.value })} required style={styles.input} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={styles.formGroup}>
                  <label>سعر الشراء</label>
                  <input type="number" min="0" step="0.01" value={editingBatch.purchasePrice} onChange={(e) => setEditingBatch({ ...editingBatch, purchasePrice: e.target.value })} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label>المورد</label>
                  <input type="text" value={editingBatch.supplier} onChange={(e) => setEditingBatch({ ...editingBatch, supplier: e.target.value })} style={styles.input} />
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={closeEdit} className="btn-danger" style={{ marginLeft: 10 }}>إلغاء</button>
                <button type="submit" className="btn-primary"><i className="fas fa-save"></i> حفظ</button>
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
    maxWidth: "560px",
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
    boxSizing: "border-box",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "20px",
    borderTop: "1px solid #e2e8f0",
    paddingTop: "20px",
  },
};
