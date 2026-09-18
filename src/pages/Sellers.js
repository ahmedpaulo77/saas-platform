// src/pages/Sellers.js
import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import AddSellerModal from "../components/sellers/AddSellerModal";

export default function Sellers() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSeller, setEditingSeller] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const UNIT_STATUS = {
    available: { label: "🟢 متاحة", color: "#16a34a", bg: "#f0fdf4" },
    reserved: { label: "🟡 محجوزة", color: "#d97706", bg: "#fffbeb" },
    sold: { label: "🔴 مباعة", color: "#dc2626", bg: "#fef2f2" },
  };

  const fetchSellers = useCallback(async () => {
    try {
      const q = getScopedQuery("sellers", userRole, userCompanyId, currentUser?.uid);
      const snapshot = await getDocs(q);
      setSellers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching sellers:", error);
      alert(t("errors.fetchSellers"));
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid, t]);

  useEffect(() => {
    fetchSellers();
  }, [fetchSellers]);

  const handleAdd = async (data) => {
    try {
      await addDoc(collection(db, "sellers"), {
        ...data,
        companyId: userCompanyId,
        createdBy: currentUser?.uid, // ✅ إضافة createdBy
        createdAt: new Date().toISOString(),
      });
      await fetchSellers();
      alert(t("success.sellerAdded"));
      setShowAddModal(false);
    } catch (error) {
      console.error("Error adding seller:", error);
      alert(t("errors.addSeller"));
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      await updateDoc(doc(db, "sellers", id), data);
      await fetchSellers();
      alert(t("success.sellerUpdated"));
      setEditingSeller(null);
    } catch (error) {
      console.error("Error updating seller:", error);
      alert(t("errors.updateSeller"));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("sellers.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "sellers", id));
      await fetchSellers();
      alert(t("success.sellerDeleted"));
    } catch (error) {
      console.error("Error deleting seller:", error);
      alert(t("errors.deleteSeller"));
    }
  };

  const filtered = sellers.filter((s) => {
    const matchSearch =
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.developer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.project?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone?.includes(searchTerm);
    const matchStatus = statusFilter === "all" || (s.unitStatus || "available") === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = {
    available: sellers.filter((s) => (s.unitStatus || "available") === "available").length,
    reserved: sellers.filter((s) => s.unitStatus === "reserved").length,
    sold: sellers.filter((s) => s.unitStatus === "sold").length,
  };
  const pendingCommission = sellers.filter((s) => (s.commissionStatus || "pending") === "pending").reduce((sum, s) => sum + (parseFloat(s.commission) || 0), 0);
  const paidCommission = sellers.filter((s) => s.commissionStatus === "paid").reduce((sum, s) => sum + (parseFloat(s.commission) || 0), 0);

  async function setUnitStatus(seller, unitStatus) {
    try {
      const update = { unitStatus };
      // المباعة → عمولتها تفضل معلقة لحد التحصيل (من غير تغيير تلقائي)
      await updateDoc(doc(db, "sellers", seller.id), update);
      await fetchSellers();
    } catch (error) {
      console.error(error);
      alert(t("common.errorGeneric"));
    }
  }

  async function setCommissionStatus(seller, commissionStatus) {
    try {
      await updateDoc(doc(db, "sellers", seller.id), { commissionStatus });
      await fetchSellers();
    } catch (error) {
      console.error(error);
      alert(t("common.errorGeneric"));
    }
  }

  // ✅ التحقق من صلاحية الحذف
  const userCanDelete = canDelete(userRole);

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>
            {t("common.loading")}
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
              <i className="fas fa-store" style={{ color: "#6366f1", marginLeft: 10 }}></i>
              {t("sellers.title")}
            </h1>
            <p className="subtitle">{t("sellers.subtitle")}</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <i className="fas fa-plus"></i> {t("sellers.add")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder={t("sellers.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: "12px 16px",
              border: "2px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "15px",
              outline: "none",
            }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: "12px 16px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}>
            <option value="all">كل الحالات</option>
            <option value="available">🟢 متاحة</option>
            <option value="reserved">🟡 محجوزة</option>
            <option value="sold">🔴 مباعة</option>
          </select>
        </div>

        {/* إحصائيات الحالات والعمولات */}
        <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", marginBottom: 20 }}>
          <div className="stat-card green"><div className="stat-icon"><i className="fas fa-check-circle"></i></div><div className="stat-value">{statusCounts.available}</div><div className="stat-label">وحدات متاحة</div></div>
          <div className="stat-card amber"><div className="stat-icon"><i className="fas fa-pause-circle"></i></div><div className="stat-value">{statusCounts.reserved}</div><div className="stat-label">محجوزة</div></div>
          <div className="stat-card red"><div className="stat-icon"><i className="fas fa-tag"></i></div><div className="stat-value">{statusCounts.sold}</div><div className="stat-label">مباعة</div></div>
          <div className="stat-card amber"><div className="stat-icon"><i className="fas fa-hourglass-half"></i></div><div className="stat-value" style={{ fontSize: 16 }}>{pendingCommission.toLocaleString()}</div><div className="stat-label">عمولات معلقة (ج.م)</div></div>
          <div className="stat-card green"><div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div><div className="stat-value" style={{ fontSize: 16 }}>{paidCommission.toLocaleString()}</div><div className="stat-label">عمولات محصّلة (ج.م)</div></div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <i className="fas fa-store" style={{ color: "#94a3b8" }}></i>
            </div>
            <h3>{t("sellers.empty")}</h3>
            <p>{t("sellers.emptyDesc")}</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("sellers.name")}</th>
                  <th>{t("sellers.developer")}</th>
                  <th>{t("sellers.project")}</th>
                  <th>{t("sellers.phone")}</th>
                  <th>{t("sellers.price")}</th>
                  <th>الحالة</th>
                  <th>{t("sellers.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((seller, index) => (
                  <React.Fragment key={seller.id}>
                    <tr>
                      <td>{index + 1}</td>
                      <td><strong>{seller.name}</strong></td>
                      <td>{seller.developer || "-"}</td>
                      <td>{seller.project || "-"}</td>
                      <td>{seller.phone || "-"}</td>
                      <td>{seller.price ? `${Number(seller.price).toLocaleString()} EGP` : "-"}</td>
                      <td>
                        {(() => {
                          const st = UNIT_STATUS[seller.unitStatus || "available"] || UNIT_STATUS.available;
                          return (
                            <select value={seller.unitStatus || "available"}
                              onChange={(e) => setUnitStatus(seller, e.target.value)}
                              style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}44`, borderRadius: 20, padding: "4px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              <option value="available">🟢 متاحة</option>
                              <option value="reserved">🟡 محجوزة</option>
                              <option value="sold">🔴 مباعة</option>
                            </select>
                          );
                        })()}
                      </td>
                      <td>
                        <button
                          onClick={() => setExpandedId(expandedId === seller.id ? null : seller.id)}
                          className="btn-secondary btn-sm"
                          style={{ marginLeft: 6 }}
                        >
                          <i className={`fas ${expandedId === seller.id ? "fa-chevron-up" : "fa-chevron-down"}`}></i>
                        </button>
                        <button
                          onClick={() => setEditingSeller(seller)}
                          className="btn-secondary btn-sm"
                          style={{ marginLeft: 6 }}
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        {/* ✅ زر الحذف يظهر فقط للأدمن */}
                        {userCanDelete && (
                          <button
                            onClick={() => handleDelete(seller.id)}
                            className="btn-danger btn-sm"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === seller.id && (
                      <tr>
                        <td colSpan="8">
                          <div style={styles.expandedRow}>
                            <div style={styles.expandedGrid}>
                              <div><strong>{t("sellers.major")}:</strong> {seller.major || "-"}</div>
                              <div><strong>{t("sellers.propertyType")}:</strong> {seller.propertyType || "-"}</div>
                              <div><strong>{t("sellers.builtUpArea")}:</strong> {seller.builtUpArea || "-"} SQM</div>
                              <div><strong>{t("sellers.plotArea")}:</strong> {seller.plotArea || "-"} SQM</div>
                              <div><strong>{t("sellers.bedrooms")}:</strong> {seller.bedrooms || "-"}</div>
                              <div><strong>{t("sellers.bathrooms")}:</strong> {seller.bathrooms || "-"}</div>
                              <div><strong>{t("sellers.kitchen")}:</strong> {seller.kitchen || "-"}</div>
                              <div><strong>{t("sellers.reception")}:</strong> {seller.reception || "-"}</div>
                              <div><strong>{t("sellers.terrace")}:</strong> {seller.terrace || "-"}</div>
                              <div><strong>{t("sellers.commission")}:</strong> {seller.commission ? `${Number(seller.commission).toLocaleString()} EGP` : "-"}
                                {" "}
                                <select value={seller.commissionStatus || "pending"}
                                  onChange={(e) => setCommissionStatus(seller, e.target.value)}
                                  style={{ marginRight: 6, fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", padding: "2px 6px" }}>
                                  <option value="pending">معلقة</option>
                                  <option value="paid">محصّلة</option>
                                </select>
                              </div>
                            </div>
                            {seller.description && (
                              <div style={{ marginTop: 10 }}>
                                <strong>{t("sellers.description")}:</strong>
                                <p style={{ margin: "5px 0 0", color: "#64748b" }}>{seller.description}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddSellerModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAdd}
          t={t}
        />
      )}

      {editingSeller && (
        <AddSellerModal
          seller={editingSeller}
          onClose={() => setEditingSeller(null)}
          onSave={(data) => handleUpdate(editingSeller.id, data)}
          t={t}
        />
      )}
    </div>
  );
}

const styles = {
  expandedRow: {
    padding: "16px 20px",
    background: "#f8fafc",
    borderRadius: "8px",
  },
  expandedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "10px",
  },
};