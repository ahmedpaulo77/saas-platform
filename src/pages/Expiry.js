// src/pages/Expiry.js - متابعة تواريخ الصلاحية + التشغيلات (صيدلية) مع دعم الترجمة
import React, { useState, useEffect, useCallback } from "react";
import { getDocs, doc, updateDoc, collection, addDoc, deleteDoc, runTransaction } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { getProductUnit, roundQty } from "../utils/traderUnits";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import { fmtDate } from "../utils/fmt";

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

export default function Expiry() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const userCanDelete = canDelete(userRole);
  const isPharmacy = userIndustry === "pharmacy";
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [newBatch, setNewBatch] = useState({
    productId: "",
    batchNumber: "",
    quantity: "",
    expiryDate: "",
    // كان ناقص عن صفحة Batches القديمة، وبmanent بعد الدمج
    purchasePrice: "",
    supplier: "",
  });
  const [addingBatch, setAddingBatch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [batchProductFilter, setBatchProductFilter] = useState("all");
  // تعديل التشغيلة (كان في صفحة Batches القديمة). مهم: تصحيح تاريخ/رقم
  // التشغيلة الغلط من غير ما نلمس الكمية.
  const [editingBatch, setEditingBatch] = useState(null);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("inventory", userRole, userCompanyId));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId]);

  const fetchBatches = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(getScopedQuery("batches", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(a.expiryDate || "9999") - new Date(b.expiryDate || "9999"));
      setBatches(data);
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchProducts();
    fetchBatches();
  }, [fetchProducts, fetchBatches]);

  async function addBatch(e) {
    e.preventDefault();
    if (!newBatch.productId || !newBatch.batchNumber.trim() || !newBatch.quantity || !newBatch.expiryDate) {
      alert(t("common.fillRequired"));
      return;
    }
    setAddingBatch(true);
    try {
      const prod = products.find((p) => p.id === newBatch.productId);
      const qty = parseFloat(newBatch.quantity) || 0;
      const docRef = await addDoc(collection(db, "batches"), {
        productId: newBatch.productId,
        productName: prod?.name || "",
        batchNumber: newBatch.batchNumber.trim(),
        quantity: qty,
        expiryDate: newBatch.expiryDate,
        // كان ناقص عن صفحة Batches القديمة — من غيرهما مش بعرف سعر
        // الشراء الحقيقي للدواء ولا المورد اللي جهّ منه.
        purchasePrice: newBatch.purchasePrice ? parseFloat(newBatch.purchasePrice) : 0,
        supplier: newBatch.supplier ? newBatch.supplier.trim() : "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      // زوّد مخزون الصنف بكمية التشغيلة
      if (prod) {
        await updateDoc(doc(db, "inventory", prod.id), { quantity: (parseFloat(prod.quantity) || 0) + qty });
      }
      await logActivity({
        actionType: "CREATE", collectionName: "batches", itemId: docRef.id,
        details: `Received batch ${newBatch.batchNumber} for ${prod?.name || ""} qty ${qty}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewBatch({ productId: "", batchNumber: "", quantity: "", expiryDate: "", purchasePrice: "", supplier: "" });
      await Promise.all([fetchProducts(), fetchBatches()]);
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setAddingBatch(false);
  }

  async function deleteBatch(batch) {
    const remaining = parseFloat(batch.quantity) || 0;
    // ⚠️ batch.quantity هو الكمية *المتبقية* (بينقصها POS صرفاً بـ FEFO)،
    // مش الكمية اللي اتستلمت. الكود القديم كان بيطرح الكمية الأصلية:
    // تشغيلة 100 نزل منها 20 → المتبقي في المخزون 20 → max(0, 20-100) = 0،
    // يعني 20 قطعة سليمة اتمسحت. دلوقتي بنطرح المتبقي بس.
    const msg = remaining > 0
      ? `${t("expiry.deleteConfirmWithQty")} (${remaining})`
      : t("common.confirmDelete");
    if (!window.confirm(msg)) return;
    try {
      const batchRef = doc(db, "batches", batch.id);
      const prod = products.find((p) => p.id === batch.productId);
      const prodRef = prod ? doc(db, "inventory", prod.id) : null;

      // ذرّي: المخزون + حذف التشغيلة ما ينفصلوش
      await runTransaction(db, async (tx) => {
        const batchSnap = await tx.get(batchRef);
        const prodSnap = prodRef ? await tx.get(prodRef) : null;
        if (!batchSnap.exists()) throw new Error(t("expiry.batchGone"));
        if (!prodSnap || !prodSnap.exists()) return;

        // نقرأ المتبقي من Firestore جوّه الـ transaction (مش من الـ snapshot القديم)
        const left = parseFloat(batchSnap.data().quantity) || 0;
        const currentQty = parseFloat(prodSnap.data().quantity) || 0;
        // ما نخصمش أكتر من الموجود فعلاً
        const deduct = Math.min(left, currentQty);
        tx.update(prodRef, { quantity: roundQty(currentQty - deduct, getProductUnit(prodSnap.data())) });
        tx.delete(batchRef);
      });

      await logActivity({
        actionType: "DELETE", collectionName: "batches", itemId: batch.id,
        details: `Deleted batch ${batch.batchNumber} for ${batch.productName}, returned ${remaining} to stock`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await Promise.all([fetchProducts(), fetchBatches()]);
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  function getExpiryStatus(product) {
    const expDate = parseDate(product.expiryDate);
    if (!expDate) return { label: t("exp.none"), color: "#94a3b8", bg: "#f1f5f9", daysLeft: null };

    const today = startOfDay(new Date());
    const exp = startOfDay(expDate);
    const daysLeft = Math.round((exp - today) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return { label: t("exp.expiredAgo", { n: Math.abs(daysLeft) }), color: "#dc2626", bg: "#fee2e2", daysLeft };
    } else if (daysLeft <= 30) {
      return { label: t("exp.expiresIn", { n: daysLeft }), color: "#d97706", bg: "#fef3c7", daysLeft };
    } else {
      return { label: t("exp.validUntil", { date: fmtDate(expDate, locale) }), color: "#16a34a", bg: "#f0fdf4", daysLeft };
    }
  }

  const expiredCount = products.filter((p) => {
    const status = getExpiryStatus(p);
    return status.daysLeft !== null && status.daysLeft < 0;
  }).length;

  const expiringCount = products.filter((p) => {
    const status = getExpiryStatus(p);
    return status.daysLeft !== null && status.daysLeft >= 0 && status.daysLeft <= 30;
  }).length;

  const noExpiryCount = products.filter((p) => !p.expiryDate).length;

  function openBatchEdit(batch) {
    setEditingBatch({
      id: batch.id,
      productId: batch.productId || "",
      productName: batch.productName || "",
      batchNumber: batch.batchNumber || "",
      quantity: String(batch.quantity ?? ""),
      expiryDate: batch.expiryDate || "",
      purchasePrice: batch.purchasePrice != null ? String(batch.purchasePrice) : "",
      supplier: batch.supplier || "",
    });
    setShowBatchEdit(true);
  }

  function closeBatchEdit() {
    setEditingBatch(null);
    setShowBatchEdit(false);
  }

  async function handleBatchUpdate(e) {
    e.preventDefault();
    if (
      !editingBatch.productId ||
      !editingBatch.batchNumber.trim() ||
      editingBatch.quantity === "" ||
      !editingBatch.expiryDate
    ) {
      alert(t("common.fillRequired"));
      return;
    }
    try {
      const prod = products.find((p) => p.id === editingBatch.productId);
      // ⚠️ الكمية مقفولة على التعديل عن قصد: هي الكمية *المتبقية* من
      // التشغيلة، وبيخصمها POS صرفاً (FEFO) + بترجع للمخزون عند الحذف.
      // لو سمحنا بتعديلها، الـ inventory والـ batch بيبقوا مختلفين.
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
      closeBatchEdit();
      await fetchBatches();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  // جدول التشغيلات: فلترة بالمنتج (كانت في صفحة Batches القديمة)
  // + ترتيب بالأقرب صلاحية عشان صرف الـ FEFO يبقى مفهوم للعين.
  const visibleBatches = batches
    .filter((b) => batchProductFilter === "all" || b.productId === batchProductFilter)
    .slice()
    .sort((a, b) => new Date(a.expiryDate || "9999") - new Date(b.expiryDate || "9999"));

  const filteredProducts = products.filter((p) => {
    const status = getExpiryStatus(p);
    const matchSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()));

    let matchFilter = true;
    if (filter === "expired") matchFilter = status.daysLeft !== null && status.daysLeft < 0;
    else if (filter === "expiring") matchFilter = status.daysLeft !== null && status.daysLeft >= 0 && status.daysLeft <= 30;
    else if (filter === "ok") matchFilter = status.daysLeft === null || (status.daysLeft !== null && status.daysLeft > 30);

    return matchSearch && matchFilter;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const aDays = getExpiryStatus(a).daysLeft;
    const bDays = getExpiryStatus(b).daysLeft;
    if (aDays === null && bDays === null) return 0;
    if (aDays === null) return 1;
    if (bDays === null) return -1;
    return aDays - bDays;
  });

  function openEditModal(product) {
    setEditingProduct({
      ...product,
      expiryDateInput: product.expiryDate
        ? parseDate(product.expiryDate).toISOString().substring(0, 10)
        : "",
    });
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingProduct(null);
    setShowEditModal(false);
  }

  async function updateExpiry(e) {
    e.preventDefault();
    if (!editingProduct.expiryDateInput) {
      alert(t("exp.needDate"));
      return;
    }
    try {
      const productRef = doc(db, "inventory", editingProduct.id);
      await updateDoc(productRef, {
        expiryDate: editingProduct.expiryDateInput,
      });
      await fetchProducts();
      closeEditModal();
      alert(t("exp.updOk"));
    } catch (error) {
      console.error(error);
      alert(t("exp.updFail"));
    }
  }

  if (loading) {
    return <div className="loading">{t("exp.loading")}</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-calendar-times" style={{ color: "#ef4444", marginLeft: 10 }}></i>
              {t("exp.title")}
            </h1>
            <p className="subtitle">{t("exp.subtitle")}</p>
          </div>
          <button onClick={() => { setLoading(true); fetchProducts(); }} className="btn-secondary">
            <i className="fas fa-sync-alt"></i> {t("common.refresh")}
          </button>
        </div>

        <div className="stats-row" style={{ marginBottom: 24 }}>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-times-circle"></i></div>
            <div className="stat-value">{expiredCount}</div>
            <div className="stat-label">{t("exp.expired")}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div>
            <div className="stat-value">{expiringCount}</div>
            <div className="stat-label">{t("exp.soon")}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
            <div className="stat-value">{products.length - expiredCount - expiringCount - noExpiryCount}</div>
            <div className="stat-label">{t("exp.ok")}</div>
          </div>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-box-open"></i></div>
            <div className="stat-value">{noExpiryCount}</div>
            <div className="stat-label">{t("exp.none")}</div>
          </div>
        </div>

        {/* ── التشغيلات (صيدلية) ── */}
        {isPharmacy && (
          <div className="form-card" style={{ border: "2px solid #8b5cf655", marginBottom: 20 }}>
            <h3>
              <i className="fas fa-pills" style={{ color: "#8b5cf6" }}></i>
              {t("exp.receiveBatch")}
            </h3>
            <form onSubmit={addBatch}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 110px 150px", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("exp.drug")} *</label>
                  <select value={newBatch.productId} onChange={(e) => setNewBatch({ ...newBatch, productId: e.target.value })} required
                    style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white", boxSizing: "border-box" }}>
                    <option value="">{t("exp.pickDrug")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("exp.batchNo")} *</label>
                  <input type="text" placeholder="B123" value={newBatch.batchNumber}
                    onChange={(e) => setNewBatch({ ...newBatch, batchNumber: e.target.value })} required
                    style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("exp.quantity")} *</label>
                  <input type="number" min="1" step="1" placeholder="0" value={newBatch.quantity}
                    onChange={(e) => setNewBatch({ ...newBatch, quantity: e.target.value })} required
                    style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("exp.expiry")} *</label>
                  <input type="date" value={newBatch.expiryDate}
                    onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })} required
                    style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 110px", gap: 12, alignItems: "end", marginTop: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("exp.supplier")}</label>
                  <input type="text" placeholder={t("exp.supplierPh")} value={newBatch.supplier}
                    onChange={(e) => setNewBatch({ ...newBatch, supplier: e.target.value })}
                    style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>{t("exp.purchasePrice")}</label>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={newBatch.purchasePrice}
                    onChange={(e) => setNewBatch({ ...newBatch, purchasePrice: e.target.value })}
                    style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                </div>
                <button type="submit" className="btn-primary" disabled={addingBatch}>
                  <i className="fas fa-plus"></i> {addingBatch ? "..." : t("exp.receive")}
                </button>
              </div>
            </form>

            {batches.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                  <h4 style={{ fontSize: 13, color: "#334155", margin: 0 }}>
                    {t("exp.batchesTitle", { n: batches.length })}
                  </h4>
                  <select
                    value={batchProductFilter}
                    onChange={(e) => setBatchProductFilter(e.target.value)}
                    style={{ padding: "6px 12px", border: "2px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}
                  >
                    <option value="all">{t("exp.allProducts")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ maxHeight: 260, overflowY: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>{t("exp.drug")}</th>
                        <th>{t("exp.batchNo")}</th>
                        <th>{t("exp.quantity")}</th>
                        <th>{t("exp.purchasePrice")}</th>
                        <th>{t("exp.supplier")}</th>
                        <th>{t("exp.expiry")}</th>
                        <th>{t("exp.status")}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBatches.map((b) => {
                        const st = getExpiryStatus(b);
                        return (
                          <tr key={b.id} style={{ background: st.daysLeft !== null && st.daysLeft < 0 ? "#fff5f5" : st.daysLeft !== null && st.daysLeft <= 30 ? "#fffbeb" : "white" }}>
                            <td style={{ fontWeight: 600 }}>{b.productName}</td>
                            <td style={{ fontFamily: "monospace" }}>{b.batchNumber}</td>
                            <td style={{ fontWeight: 700 }}>{b.quantity}</td>
                            <td>{b.purchasePrice ? Number(b.purchasePrice).toFixed(2) : "—"}</td>
                            <td>{b.supplier || "—"}</td>
                            <td>{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString(locale) : "—"}</td>
                            <td><span className="badge" style={{ background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span></td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={() => openBatchEdit(b)}
                                  className="btn-secondary btn-sm"
                                  title={t("exp.editBatch")}
                                >
                                  <i className="fas fa-pen-ruler"></i>
                                </button>
                                {userCanDelete && (
                                  <button onClick={() => deleteBatch(b)} className="btn-danger btn-sm" title={t("common.delete")}>
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
                </div>
              </div>
            )}
          </div>
        )}

        <div className="filter-bar" style={{ marginBottom: 20 }}>
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("exp.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t("exp.all")}</option>
            <option value="expired">{t("exp.filterExpired")}</option>
            <option value="expiring">{t("exp.filterSoon")}</option>
            <option value="ok">{t("exp.filterOk")}</option>
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t("exp.list")}</h3>
            <span className="table-count">{sortedProducts.length} منتج</span>
          </div>
          {sortedProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><i className="fas fa-box-open"></i></div>
              <p>{searchTerm || filter !== "all" ? t("common.noResults") : t("exp.empty")}</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("inv.name")}</th>
                  <th>{t("inv.category")}</th>
                  <th>{t("exp.date")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.quantity")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product, i) => {
                  const status = getExpiryStatus(product);
                  return (
                    <tr key={product.id} style={{
                      background: status.daysLeft !== null && status.daysLeft < 0 ? "#fff5f5" :
                        status.daysLeft !== null && status.daysLeft <= 30 ? "#fffbeb" : "white",
                    }}>
                      <td style={{ color: "var(--gray-400)", fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{product.name}</td>
                      <td>{product.category || "-"}</td>
                      <td style={{ fontWeight: 700 }}>
                        {product.expiryDate
                          ? fmtDate(parseDate(product.expiryDate), locale)
                          : <span style={{ color: "#94a3b8", fontWeight: 400 }}>—</span>}
                      </td>
                      <td>
                        <span className="badge" style={{ background: status.bg, color: status.color, fontWeight: 700 }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`badge ${product.quantity < 5 ? "badge-expired" : "badge-active"}`}>
                          {product.quantity}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => openEditModal(product)}
                          className="btn-primary"
                          style={{ padding: "6px 14px", fontSize: 13 }}
                        >
                          <i className="fas fa-edit"></i> {t("exp.editBtn")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showEditModal && editingProduct && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-pen-ruler"></i> {t("exp.editTitle")}</h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={updateExpiry}>
              <div style={styles.formGroup}>
                <label>{t("inv.name")}</label>
                <input type="text" value={editingProduct.name} disabled style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label>{t("exp.date")} *</label>
                <input
                  type="date"
                  value={editingProduct.expiryDateInput}
                  onChange={(e) => setEditingProduct({ ...editingProduct, expiryDateInput: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={closeEditModal} className="btn-danger" style={{ marginLeft: "10px" }}>
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

      {/* ── تعديل التشغيلة (من صفحة Batches القديمة) ── */}
      {showBatchEdit && editingBatch && (
        <div style={styles.modalOverlay} onClick={closeBatchEdit}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-pen-ruler"></i> {t("exp.editBatchTitle")}</h3>
              <button onClick={closeBatchEdit} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={handleBatchUpdate}>
              <div style={styles.formGroup}>
                <label>{t("exp.drug")} *</label>
                <select
                  value={editingBatch.productId}
                  onChange={(e) => setEditingBatch({ ...editingBatch, productId: e.target.value })}
                  required
                  style={styles.input}
                >
                  <option value="">{t("exp.pickDrug")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>{t("exp.batchNo")} *</label>
                <input
                  type="text"
                  value={editingBatch.batchNumber}
                  onChange={(e) => setEditingBatch({ ...editingBatch, batchNumber: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={styles.formGroup}>
                  <label>{t("exp.quantity")} *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editingBatch.quantity}
                    onChange={(e) => setEditingBatch({ ...editingBatch, quantity: e.target.value })}
                    required
                    readOnly
                    title={t("exp.qtyLocked")}
                    style={{ ...styles.input, background: "#f1f5f9", color: "#64748b", cursor: "not-allowed" }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>{t("exp.expiry")} *</label>
                  <input
                    type="date"
                    value={editingBatch.expiryDate}
                    onChange={(e) => setEditingBatch({ ...editingBatch, expiryDate: e.target.value })}
                    required
                    style={styles.input}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={styles.formGroup}>
                  <label>{t("exp.purchasePrice")}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingBatch.purchasePrice}
                    onChange={(e) => setEditingBatch({ ...editingBatch, purchasePrice: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>{t("exp.supplier")}</label>
                  <input
                    type="text"
                    value={editingBatch.supplier}
                    onChange={(e) => setEditingBatch({ ...editingBatch, supplier: e.target.value })}
                    style={styles.input}
                  />
                </div>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={closeBatchEdit} className="btn-danger" style={{ marginLeft: "10px" }}>
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