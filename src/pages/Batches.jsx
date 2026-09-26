// src/pages/Batches.jsx - Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„ØªØ´ØºÙŠÙ„Ø§Øª (Pharmacy batches) Ù…Ø¹ ØµÙ„Ø§Ø­ÙŠØ© ÙˆØ§Ù†ØªÙ‡Ø§Ø¡
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, runTransaction } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { getProductUnit, roundQty } from "../utils/traderUnits";
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
  if (!expDate || isNaN(expDate.getTime())) return { key: "no_date", label: "Ø¨Ø¯ÙˆÙ† ØªØ§Ø±ÙŠØ®", color: "#94a3b8", bg: "#f1f5f9", daysLeft: null };
  const today = startOfDay(new Date());
  const exp = startOfDay(expDate);
  const daysLeft = Math.round((exp - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) {
    return { key: "expired", label: `Ù…Ù†ØªÙ‡ÙŠ Ù…Ù†Ø° ${Math.abs(daysLeft)} ÙŠÙˆÙ…`, color: "#dc2626", bg: "#fee2e2", daysLeft };
  } else if (daysLeft <= 30) {
    return { key: "expiring", label: `ÙŠÙ†ØªÙ‡ÙŠ Ø®Ù„Ø§Ù„ ${daysLeft} ÙŠÙˆÙ…`, color: "#d97706", bg: "#fef3c7", daysLeft };
  } else {
    return { key: "valid", label: `ØµØ§Ù„Ø­ Ø­ØªÙ‰ ${expDate.toLocaleDateString("ar-EG")}`, color: "#16a34a", bg: "#f0fdf4", daysLeft };
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
    return p ? p.name : batch.productId || "â€”";
  }, [products]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newBatch.productId || !newBatch.batchNumber.trim() || !newBatch.quantity || !newBatch.expiryDate) {
      alert("ÙŠØ±Ø¬Ù‰ Ù…Ù„Ø¡ Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø© (Ø§Ù„Ù…Ù†ØªØ¬ØŒ Ø±Ù‚Ù… Ø§Ù„ØªØ´ØºÙŠÙ„Ø©ØŒ Ø§Ù„ÙƒÙ…ÙŠØ©ØŒ ØªØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©)");
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
      const batchRef = doc(collection(db, "batches"));
      const prodRef = doc(db, "inventory", newBatch.productId);

      // âš ï¸ ÙƒØ§Ù† Ø¨ÙŠØ¶ÙŠÙ Ø§Ù„ØªØ´ØºÙŠÙ„Ø© Ù…Ù† ØºÙŠØ± Ù…Ø§ ÙŠÙ„Ù…Ø³ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† â€” Ø¨ÙŠÙ†Ù…Ø§ ØµÙØ­Ø© "Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©"
      //    (Expiry.js) ÙƒØ§Ù†Øª Ø¨ØªØ²ÙˆØ¯ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†. Ù†ÙØ³ Ø§Ù„ÙƒÙˆÙ„ÙƒØ´Ù† Ø¨Ù‚Ø§Ø¹Ø¯ØªÙŠÙ† Ù…ØªØ¹Ø§Ø±Ø¶ØªÙŠÙ†ØŒ
      //    ÙØ¥Ø¶Ø§ÙØ© Ù…Ù† Ù‡Ù†Ø§ ÙˆØ­Ø°Ù Ù…Ù† Ù‡Ù†Ø§Ùƒ = ÙÙ‚Ø¯ Ù…Ø®Ø²ÙˆÙ† ÙˆÙ‡Ù…ÙŠ. Ø¯Ù„ÙˆÙ‚ØªÙŠ Ø§Ù„Ø§ØªÙ†ÙŠÙ† Ù…ØªØ·Ø§Ø¨Ù‚ÙŠÙ†
      //    ÙˆÙÙŠ transaction ÙˆØ§Ø­Ø¯.
      await runTransaction(db, async (tx) => {
        const prodSnap = await tx.get(prodRef);
        tx.set(batchRef, payload);
        if (prodSnap.exists() && payload.quantity > 0) {
          const currentQty = parseFloat(prodSnap.data().quantity) || 0;
          tx.update(prodRef, {
            quantity: roundQty(currentQty + payload.quantity, getProductUnit(prodSnap.data())),
          });
        }
      });

      await logActivity({
        actionType: "CREATE",
        collectionName: "batches",
        itemId: batchRef.id,
        details: `Created batch ${payload.batchNumber} for ${payload.productName} qty ${payload.quantity}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewBatch({ productId: "", batchNumber: "", quantity: "", expiryDate: "", purchasePrice: "", supplier: "" });
      await Promise.all([fetchBatches(), fetchProducts()]);
    } catch (err) {
      console.error(err);
      alert("Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¥Ø¶Ø§ÙØ© Ø§Ù„ØªØ´ØºÙŠÙ„Ø©");
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
      alert("ÙŠØ±Ø¬Ù‰ Ù…Ù„Ø¡ Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©");
      return;
    }
    try {
      const prod = products.find((p) => p.id === editingBatch.productId);
      // âš ï¸ Ø§Ù„ÙƒÙ…ÙŠØ© Ù…Ù‚ÙÙˆÙ„Ø© Ø¹Ù„Ù‰ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„ Ø¹Ù† Ù‚ØµØ¯: Ù‡ÙŠ Ø§Ù„ÙƒÙ…ÙŠØ© *Ø§Ù„Ù…ØªØ¨Ù‚ÙŠØ©* Ù…Ù†
      //    Ø§Ù„ØªØ´ØºÙŠÙ„Ø©ØŒ ÙˆØ¨ÙŠØ®ØµÙ…Ù‡Ø§ POS ØµØ±ÙØ§Ù‹ (FEFO) + Ø¨ØªØ±Ø¬Ø¹ Ù„Ù„Ù…Ø®Ø²ÙˆÙ† Ø¹Ù†Ø¯ Ø§Ù„Ø­Ø°Ù.
      //    Ù„Ùˆ Ø³Ù…Ø­Ù†Ø§ Ø¨ØªØ¹Ø¯ÙŠÙ„Ù‡Ø§ØŒ Ø§Ù„Ù€ inventory Ùˆ Ø§Ù„Ù€ batch Ø¨ÙŠØ¨Ù‚ÙˆØ§ Ù…ØªIFFÙ„ÙÙŠÙ†.
      await updateDoc(doc(db, "batches", editingBatch.id), {
        productId: editingBatch.productId,
        productName: prod?.name || editingBatch.productName || "",
        batchNumber: editingBatch.batchNumber.trim(),
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
      alert("Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„");
    }
  }

  async function handleDelete(batch) {
    const remaining = parseFloat(batch.quantity) || 0;
    if (!window.confirm(remaining > 0
      ? `Ø­Ø°Ù Ø§Ù„ØªØ´ØºÙŠÙ„Ø© Ù‡ÙŠØ±Ø¬Ù‘Ø¹ ${remaining} Ù„Ù„Ù…Ø®Ø²ÙˆÙ†. Ù…ØªØ£ÙƒØ¯ØŸ`
      : "Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø­Ø°Ù Ø§Ù„ØªØ´ØºÙŠÙ„Ø©ØŸ")) return;
    try {
      const batchRef = doc(db, "batches", batch.id);
      const prodRef = doc(db, "inventory", batch.productId);
      // Ù†ÙØ³ Ø³Ù„ÙˆÙƒ Expiry.js: Ø§Ù„Ø­Ø°Ù Ø¨ÙŠØ±Ø¬Ù‘Ø¹ Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ Ù„Ù„Ù…Ø®Ø²ÙˆÙ† Ø°Ø±Ù‘ÙŠÙ‹Ø§
      await runTransaction(db, async (tx) => {
        const batchSnap = await tx.get(batchRef);
        const prodSnap = await tx.get(prodRef);
        if (!batchSnap.exists()) return;
        if (prodSnap.exists()) {
          const left = parseFloat(batchSnap.data().quantity) || 0;
          const currentQty = parseFloat(prodSnap.data().quantity) || 0;
          const deduct = Math.min(left, currentQty);
          if (deduct > 0) {
            tx.update(prodRef, {
              quantity: roundQty(currentQty - deduct, getProductUnit(prodSnap.data())),
            });
          }
        }
        tx.delete(batchRef);
      });
      await logActivity({
        actionType: "DELETE",
        collectionName: "batches",
        itemId: batch.id,
        details: `Deleted batch ${batch.batchNumber} for ${batch.productName || batch.productId}, returned ${remaining} to stock`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await Promise.all([fetchBatches(), fetchProducts()]);
    } catch (err) {
      console.error(err);
      alert("Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø­Ø°Ù");
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
        <div className="main-content"><div className="loading">Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...</div></div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1><i className="fas fa-pills" style={{ color: "#8b5cf6", marginLeft: 10 }}></i> Ø§Ù„ØªØ´ØºÙŠÙ„Ø§Øª</h1>
            <p className="subtitle">Ø¥Ø¯Ø§Ø±Ø© ØªØ´ØºÙŠÙ„Ø§Øª Ø§Ù„Ø£Ø¯ÙˆÙŠØ© â€” ØªØªØ¨Ø¹ Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© ÙˆØ§Ù„ÙƒÙ…ÙŠØ§Øª</p>
          </div>
          <button onClick={() => { setLoading(true); Promise.all([fetchProducts(), fetchBatches()]); }} className="btn-secondary">
            <i className="fas fa-sync-alt"></i> ØªØ­Ø¯ÙŠØ«
          </button>
        </div>

        <div className="stats-row" style={{ marginBottom: 20 }}>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-times-circle"></i></div>
            <div className="stat-value">{counts.expired}</div>
            <div className="stat-label">Ù…Ù†ØªÙ‡ÙŠ</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div>
            <div className="stat-value">{counts.expiring}</div>
            <div className="stat-label">ÙŠÙ†ØªÙ‡ÙŠ Ø®Ù„Ø§Ù„ 30 ÙŠÙˆÙ…</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
            <div className="stat-value">{counts.valid}</div>
            <div className="stat-label">ØµØ§Ù„Ø­</div>
          </div>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-boxes"></i></div>
            <div className="stat-value">{batches.length}</div>
            <div className="stat-label">Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ</div>
          </div>
        </div>

        {/* Add Form */}
        <div className="form-card" style={{ border: "2px solid #8b5cf655", marginBottom: 20 }}>
          <h3><i className="fas fa-plus-circle" style={{ color: "#8b5cf6" }}></i> Ø¥Ø¶Ø§ÙØ© ØªØ´ØºÙŠÙ„Ø© Ø¬Ø¯ÙŠØ¯Ø©</h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>Ø§Ù„Ù…Ù†ØªØ¬ *</label>
                <select
                  value={newBatch.productId}
                  onChange={(e) => setNewBatch({ ...newBatch, productId: e.target.value })}
                  required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white", boxSizing: "border-box" }}
                >
                  <option value="">â€” Ø§Ø®ØªØ± Ø§Ù„Ù…Ù†ØªØ¬ â€”</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {products.length === 0 && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù†ØªØ¬Ø§Øª â€” Ø£Ø¶ÙÙ‡Ø§ Ù…Ù† Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø£ÙˆÙ„Ø§Ù‹</div>}
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>Ø±Ù‚Ù… Ø§Ù„ØªØ´ØºÙŠÙ„Ø© *</label>
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
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>Ø§Ù„ÙƒÙ…ÙŠØ© *</label>
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
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>ØªØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© *</label>
                <input
                  type="date"
                  value={newBatch.expiryDate}
                  onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })}
                  required
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>Ø³Ø¹Ø± Ø§Ù„Ø´Ø±Ø§Ø¡</label>
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
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>Ø§Ù„Ù…ÙˆØ±Ø¯</label>
                <input
                  type="text"
                  placeholder="Ø§Ø³Ù… Ø§Ù„Ù…ÙˆØ±Ø¯"
                  value={newBatch.supplier}
                  onChange={(e) => setNewBatch({ ...newBatch, supplier: e.target.value })}
                  style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: 14 }}>
              <i className="fas fa-plus"></i> {submitting ? "Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¥Ø¶Ø§ÙØ©..." : "Ø¥Ø¶Ø§ÙØ© Ø§Ù„ØªØ´ØºÙŠÙ„Ø©"}
            </button>
          </form>
        </div>

        {/* Filters */}
        <div className="filter-bar" style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="search-wrapper" style={{ flex: 2, minWidth: 200, position: "relative", display: "flex", alignItems: "center" }}>
            <i className="fas fa-search search-icon" style={{ position: "absolute", right: 12, color: "#94a3b8" }}></i>
            <input
              type="text"
              placeholder="Ø¨Ø­Ø«: Ø±Ù‚Ù… Ø§Ù„ØªØ´ØºÙŠÙ„Ø©ØŒ Ø§Ø³Ù… Ø§Ù„Ø¯ÙˆØ§Ø¡ØŒ Ø§Ù„Ù…ÙˆØ±Ø¯..."
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
            <option value="all">ÙƒÙ„ Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterExpiry}
            onChange={(e) => setFilterExpiry(e.target.value)}
            style={{ flex: 1, minWidth: 160, padding: "12px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white" }}
          >
            <option value="all">ÙƒÙ„ Ø§Ù„Ø­Ø§Ù„Ø§Øª</option>
            <option value="expired">Ù…Ù†ØªÙ‡ÙŠ</option>
            <option value="expiring">ÙŠÙ†ØªÙ‡ÙŠ Ø®Ù„Ø§Ù„ 30 ÙŠÙˆÙ…</option>
            <option value="valid">ØµØ§Ù„Ø­</option>
          </select>
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ØªØ´ØºÙŠÙ„Ø§Øª</h3>
            <span className="table-count">{filtered.length} ØªØ´ØºÙŠÙ„Ø©</span>
          </div>
          <Pagination
            data={filtered}
            pageSize={20}
            resetKey={`${searchTerm}-${filterProduct}-${filterExpiry}`}
            empty={
              <div className="empty-state" style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>
                <div className="empty-icon" style={{ fontSize: 32, marginBottom: 8 }}><i className="fas fa-box-open"></i></div>
                <p>{searchTerm || filterProduct !== "all" || filterExpiry !== "all" ? "Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†ØªØ§Ø¦Ø¬" : "Ù„Ø§ ØªÙˆØ¬Ø¯ ØªØ´ØºÙŠÙ„Ø§Øª Ø¨Ø¹Ø¯ â€” Ø£Ø¶Ù Ø£ÙˆÙ„ ØªØ´ØºÙŠÙ„Ø©"}</p>
              </div>
            }
            render={(pageItems, total, start) => (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ø§Ù„Ù…Ù†ØªØ¬</th>
                    <th>Ø±Ù‚Ù… Ø§Ù„ØªØ´ØºÙŠÙ„Ø©</th>
                    <th>Ø§Ù„ÙƒÙ…ÙŠØ©</th>
                    <th>ØªØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©</th>
                    <th>Ø§Ù„Ø­Ø§Ù„Ø©</th>
                    <th>Ø³Ø¹Ø± Ø§Ù„Ø´Ø±Ø§Ø¡</th>
                    <th>Ø§Ù„Ù…ÙˆØ±Ø¯</th>
                    <th>Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
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
                        <td>{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString("ar-EG") : "â€”"}</td>
                        <td>
                          <span className="badge" style={{ background: st.bg, color: st.color, fontWeight: 700, padding: "4px 10px", borderRadius: 20, fontSize: 12 }}>
                            {st.label}
                          </span>
                        </td>
                        <td>{b.purchasePrice != null && b.purchasePrice !== "" ? `${parseFloat(b.purchasePrice).toFixed(2)}` : "â€”"}</td>
                        <td>{b.supplier || "â€”"}</td>
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
              <h3><i className="fas fa-edit"></i> ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ØªØ´ØºÙŠÙ„Ø©</h3>
              <button onClick={closeEdit} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div style={styles.formGroup}>
                <label>Ø§Ù„Ù…Ù†ØªØ¬ *</label>
                <select
                  value={editingBatch.productId}
                  onChange={(e) => setEditingBatch({ ...editingBatch, productId: e.target.value })}
                  required
                  style={styles.input}
                >
                  <option value="">â€” Ø§Ø®ØªØ± Ø§Ù„Ù…Ù†ØªØ¬ â€”</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>Ø±Ù‚Ù… Ø§Ù„ØªØ´ØºÙŠÙ„Ø© *</label>
                <input type="text" value={editingBatch.batchNumber} onChange={(e) => setEditingBatch({ ...editingBatch, batchNumber: e.target.value })} required style={styles.input} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={styles.formGroup}>
                  <label>Ø§Ù„ÙƒÙ…ÙŠØ© *</label>
                  <input type="number" min="0" step="1" value={editingBatch.quantity} onChange={(e) => setEditingBatch({ ...editingBatch, quantity: e.target.value })} required style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label>ØªØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© *</label>
                  <input type="date" value={editingBatch.expiryDate} onChange={(e) => setEditingBatch({ ...editingBatch, expiryDate: e.target.value })} required style={styles.input} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={styles.formGroup}>
                  <label>Ø³Ø¹Ø± Ø§Ù„Ø´Ø±Ø§Ø¡</label>
                  <input type="number" min="0" step="0.01" value={editingBatch.purchasePrice} onChange={(e) => setEditingBatch({ ...editingBatch, purchasePrice: e.target.value })} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label>Ø§Ù„Ù…ÙˆØ±Ø¯</label>
                  <input type="text" value={editingBatch.supplier} onChange={(e) => setEditingBatch({ ...editingBatch, supplier: e.target.value })} style={styles.input} />
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={closeEdit} className="btn-danger" style={{ marginLeft: 10 }}>Ø¥Ù„ØºØ§Ø¡</button>
                <button type="submit" className="btn-primary"><i className="fas fa-save"></i> Ø­ÙØ¸</button>
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
