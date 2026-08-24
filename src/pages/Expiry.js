// src/pages/Expiry.js - متابعة تواريخ الصلاحية مع دعم الترجمة
import React, { useState, useEffect, useCallback } from "react";
import { getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

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
  const { t } = useLanguage();
  const { userRole, userCompanyId } = useAuth();
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
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

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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
      return { label: t("exp.validUntil", { date: expDate.toLocaleDateString("ar-EG") }), color: "#16a34a", bg: "#f0fdf4", daysLeft };
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
                          ? parseDate(product.expiryDate).toLocaleDateString("ar-EG")
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
              <h3><i className="fas fa-calendar-edit"></i> {t("exp.editTitle")}</h3>
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