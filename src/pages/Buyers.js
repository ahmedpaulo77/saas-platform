// src/pages/Buyers.js
import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import AddBuyerModal from "../components/buyers/AddBuyerModal";

export default function Buyers() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const fetchBuyers = useCallback(async () => {
    try {
      const q = getScopedQuery("buyers", userRole, userCompanyId, currentUser?.uid);
      const snapshot = await getDocs(q);
      setBuyers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching buyers:", error);
      alert(t("errors.fetchBuyers"));
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid, t]);

  useEffect(() => {
    fetchBuyers();
  }, [fetchBuyers]);

  const handleAdd = async (data) => {
    try {
      await addDoc(collection(db, "buyers"), {
        ...data,
        companyId: userCompanyId,
        createdBy: currentUser?.uid, // ✅ إضافة createdBy
        createdAt: new Date().toISOString(),
      });
      await fetchBuyers();
      alert(t("success.buyerAdded"));
      setShowAddModal(false);
    } catch (error) {
      console.error("Error adding buyer:", error);
      alert(t("errors.addBuyer"));
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      await updateDoc(doc(db, "buyers", id), data);
      await fetchBuyers();
      alert(t("success.buyerUpdated"));
      setEditingBuyer(null);
    } catch (error) {
      console.error("Error updating buyer:", error);
      alert(t("errors.updateBuyer"));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("buyers.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "buyers", id));
      await fetchBuyers();
      alert(t("success.buyerDeleted"));
    } catch (error) {
      console.error("Error deleting buyer:", error);
      alert(t("errors.deleteBuyer"));
    }
  };

  const filtered = buyers.filter(
    (b) =>
      b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.phone?.includes(searchTerm) ||
      b.interest?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.agent?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <i className="fas fa-users" style={{ color: "#10b981", marginLeft: 10 }}></i>
              {t("buyers.title")}
            </h1>
            <p className="subtitle">{t("buyers.subtitle")}</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <i className="fas fa-plus"></i> {t("buyers.add")}
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder={t("buyers.search")}
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
          />
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <i className="fas fa-user-plus" style={{ color: "#94a3b8" }}></i>
            </div>
            <h3>{t("buyers.empty")}</h3>
            <p>{t("buyers.emptyDesc")}</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("buyers.name")}</th>
                  <th>{t("buyers.phone")}</th>
                  <th>{t("buyers.interest")}</th>
                  <th>{t("buyers.agent")}</th>
                  <th>{t("buyers.lastCall")}</th>
                  <th>{t("buyers.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((buyer, index) => (
                  <React.Fragment key={buyer.id}>
                    <tr>
                      <td>{index + 1}</td>
                      <td><strong>{buyer.name}</strong></td>
                      <td>{buyer.phone || "-"}</td>
                      <td>{buyer.interest || "-"}</td>
                      <td>{buyer.agent || "-"}</td>
                      <td>{buyer.lastCall ? new Date(buyer.lastCall).toLocaleDateString() : "-"}</td>
                      <td>
                        <button
                          onClick={() => setExpandedId(expandedId === buyer.id ? null : buyer.id)}
                          className="btn-secondary btn-sm"
                          style={{ marginLeft: 6 }}
                        >
                          <i className={`fas ${expandedId === buyer.id ? "fa-chevron-up" : "fa-chevron-down"}`}></i>
                        </button>
                        <button
                          onClick={() => setEditingBuyer(buyer)}
                          className="btn-secondary btn-sm"
                          style={{ marginLeft: 6 }}
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        {/* ✅ زر الحذف يظهر فقط للأدمن */}
                        {userCanDelete && (
                          <button
                            onClick={() => handleDelete(buyer.id)}
                            className="btn-danger btn-sm"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === buyer.id && (
                      <tr>
                        <td colSpan="7">
                          <div style={styles.expandedRow}>
                            <div style={styles.expandedGrid}>
                              <div><strong>{t("buyers.followUp1")}:</strong> {buyer.followUp1 || "-"}</div>
                              <div><strong>{t("buyers.followUp2")}:</strong> {buyer.followUp2 || "-"}</div>
                              <div><strong>{t("buyers.followUp3")}:</strong> {buyer.followUp3 || "-"}</div>
                              <div><strong>{t("buyers.lastCall")}:</strong> {buyer.lastCall ? new Date(buyer.lastCall).toLocaleString() : "-"}</div>
                            </div>
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
        <AddBuyerModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAdd}
          t={t}
        />
      )}

      {editingBuyer && (
        <AddBuyerModal
          buyer={editingBuyer}
          onClose={() => setEditingBuyer(null)}
          onSave={(data) => handleUpdate(editingBuyer.id, data)}
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