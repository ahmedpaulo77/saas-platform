// src/pages/Suppliers.js - إدارة الموردين مع دعم الترجمة
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

export default function Suppliers() {
  const { t } = useLanguage();
  const { userRole, userCompanyId } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    balance: "",
    taxNumber: "",
  });
  const [loading, setLoading] = useState(true);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [statementSupplier, setStatementSupplier] = useState(null);
  const [showStatement, setShowStatement] = useState(false);

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

  // ✅ فواتير الشراء للشركة (لحساب مديونية كل مورد تلقائياً)
  const fetchPurchases = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        query(collection(db, "purchases"), where("companyId", "==", userCompanyId))
      );
      setPurchases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userCompanyId]);

  useEffect(() => {
    fetchSuppliers();
    fetchPurchases();
  }, [fetchSuppliers, fetchPurchases]);

  async function addSupplier(e) {
    e.preventDefault();
    if (!newSupplier.name) {
      alert(t("common.fillRequired"));
      return;
    }
    try {
      await addDoc(collection(db, "suppliers"), {
        ...newSupplier,
        balance: newSupplier.balance ? parseFloat(newSupplier.balance) : 0,
        companyId: userCompanyId,
        createdAt: new Date().toISOString(),
      });
      setNewSupplier({ name: "", phone: "", email: "", address: "", notes: "", balance: "", taxNumber: "" });
      await fetchSuppliers();
      alert(t("sup.addOk"));
    } catch (error) {
      console.error(error);
      alert(t("sup.addFail"));
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
      alert(t("common.fillRequired"));
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
        balance: editingSupplier.balance ? parseFloat(editingSupplier.balance) : 0,
        taxNumber: editingSupplier.taxNumber || "",
      });
      await fetchSuppliers();
      closeEditModal();
      alert(t("sup.updOk"));
    } catch (error) {
      console.error(error);
      alert(t("sup.updFail"));
    }
  }

  async function deleteSupplier(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "suppliers", id));
      await fetchSuppliers();
      alert(t("sup.delOk"));
    } catch (error) {
      console.error(error);
      alert(t("sup.delFail"));
    }
  }

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.phone && s.phone.includes(searchTerm)) ||
    (s.email && s.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ✅ إجماليات المورد من فواتير الشراء الفعلية
  const supplierTotals = (supplierId) => {
    const list = purchases.filter((p) => p.supplierId === supplierId);
    const total = list.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const paid = list.reduce((s, p) => s + (parseFloat(p.paidAmount) || 0), 0);
    return { list, total, paid, remaining: total - paid };
  };

  // ✅ طباعة كشف الحساب
  function printStatement(supplier) {
    const { list, total, paid, remaining } = supplierTotals(supplier.id);
    const rows = list
      .map((p, i) => {
        const pPaid = parseFloat(p.paidAmount) || 0;
        const pTotal = parseFloat(p.amount) || 0;
        const date = p.date ? new Date(p.date).toLocaleDateString("ar-EG") : "—";
        return `<tr>
        <td style="padding:3px 6px;border-bottom:1px dashed #ccc;text-align:center;">${i + 1}</td>
        <td style="padding:3px 6px;border-bottom:1px dashed #ccc;text-align:center;">${date}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;">${pTotal.toFixed(2)}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;">${pPaid.toFixed(2)}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;font-weight:bold;">${(pTotal - pPaid).toFixed(2)}</td>
      </tr>`;
      })
      .join("");
    const printContent = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 13px; width: 80mm; padding: 8px; }
  h2 { text-align: center; font-size: 16px; margin-bottom: 4px; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f0f0f0; padding: 4px 6px; font-size: 11px; }
  .total-row { font-weight: bold; font-size: 14px; }
  @media print {
    body { width: 80mm; }
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>
<h2>📋 ${t("sup.statementTitle")}</h2>
<div class="center" style="font-size:11px;color:#666;">${new Date().toLocaleString("ar-EG")}</div>
<div class="divider"></div>
<div style="font-size:12px;margin-bottom:4px;"><strong>${t("sup.name")}:</strong> ${supplier.name}</div>
<div class="divider"></div>
<table>
  <thead><tr>
    <th>#</th><th>${t("common.date")}</th><th>${t("common.amount")}</th>
    <th>${t("in.paid")}</th><th>${t("in.remaining")}</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="divider"></div>
<div style="text-align:left;font-size:13px;">
  <div>${t("sup.totalPurchases")}: ${total.toFixed(2)} ج.م</div>
  <div>${t("sup.totalPaid")}: ${paid.toFixed(2)} ج.م</div>
  <div class="total-row" style="margin-top:4px;font-size:15px;border-top:2px solid #000;padding-top:4px;">
    ${t("sup.totalRemaining")}: ${remaining.toFixed(2)} ج.م
  </div>
</div>
</body>
</html>`;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(printContent);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  if (loading) {
    return <div className="loading">{t("sup.loading")}</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>
          <i className="fas fa-truck" style={{ color: "#f59e0b" }}></i>{" "}
          {t("sup.title")}
        </h2>

        <form onSubmit={addSupplier} className="form-container">
          <input
            type="text"
            placeholder={t("sup.phName")}
            value={newSupplier.name}
            onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder={t("common.phone")}
            value={newSupplier.phone}
            onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
          />
          <input
            type="email"
            placeholder={t("common.email")}
            value={newSupplier.email}
            onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
          />
          <input
            type="text"
            placeholder={t("sup.phAddr")}
            value={newSupplier.address}
            onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
          />
          <input
            type="number"
            placeholder={t("sup.phBalance")}
            value={newSupplier.balance}
            onChange={(e) => setNewSupplier({ ...newSupplier, balance: e.target.value })}
          />
          <input
            type="text"
            placeholder={t("sup.phTaxNumber")}
            value={newSupplier.taxNumber}
            onChange={(e) => setNewSupplier({ ...newSupplier, taxNumber: e.target.value })}
          />
          <input
            type="text"
            placeholder={t("sup.phNotes")}
            value={newSupplier.notes}
            onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
          />
          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> {t("sup.add")}
          </button>
        </form>

        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder={t("sup.search")}
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

        <div className="table-container">
          <div className="table-header">
            <h3>{t("sup.list")}</h3>
            <span>{filteredSuppliers.length} {t("sup.suppliers")}</span>
          </div>
          {filteredSuppliers.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm ? t("common.noResults") : t("sup.empty")}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("sup.name")}</th>
                  <th>{t("common.phone")}</th>
                  <th>{t("common.email")}</th>
                  <th>{t("sup.address")}</th>
                  <th>{t("sup.balance")}</th>
                  <th>{t("sup.taxNumber")}</th>
                  <th>{t("sup.notes")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier, index) => {
                  // ✅ المتبقي عليه = فواتير الشراء − المدفوع (تلقائي)
                  const { remaining } = supplierTotals(supplier.id);
                  return (
                  <tr key={supplier.id}>
                    <td>{index + 1}</td>
                    <td style={{ fontWeight: 600 }}>{supplier.name}</td>
                    <td>{supplier.phone || "-"}</td>
                    <td>{supplier.email || "-"}</td>
                    <td>{supplier.address || "-"}</td>
                    <td style={{ fontWeight: 800, color: remaining > 0 ? "#ef4444" : "#10b981" }}>
                      {remaining > 0
                        ? `${remaining.toLocaleString()} ${t("currency.short")}`
                        : "✓"}
                    </td>
                    <td>{supplier.taxNumber || "-"}</td>
                    <td>{supplier.notes || "-"}</td>
                    <td>
                      <button
                        onClick={() => {
                          setStatementSupplier(supplier);
                          setShowStatement(true);
                        }}
                        className="btn-secondary"
                        style={{ marginLeft: "8px", padding: "6px 14px", fontSize: "13px" }}
                      >
                        <i className="fas fa-file-invoice"></i> {t("sup.statement")}
                      </button>
                      <button
                        onClick={() => openEditModal(supplier)}
                        className="btn-primary"
                        style={{ marginLeft: "8px", padding: "6px 14px", fontSize: "13px" }}
                      >
                        <i className="fas fa-edit"></i> {t("common.edit")}
                      </button>
                      <button
                        onClick={() => deleteSupplier(supplier.id)}
                        className="btn-danger"
                      >
                        <i className="fas fa-trash"></i> {t("common.delete")}
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

      {showEditModal && editingSupplier && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-edit"></i> {t("sup.editTitle")}</h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={updateSupplier}>
              <div style={styles.formGroup}>
                <label>{t("sup.name")}</label>
                <input
                  type="text"
                  value={editingSupplier.name}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.phone")}</label>
                <input
                  type="text"
                  value={editingSupplier.phone || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.email")}</label>
                <input
                  type="email"
                  value={editingSupplier.email || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("sup.address")}</label>
                <input
                  type="text"
                  value={editingSupplier.address || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, address: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("sup.balance")} ({t("common.optional")})</label>
                <input
                  type="number"
                  placeholder={t("sup.phBalance")}
                  value={editingSupplier.balance ?? ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, balance: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("sup.taxNumber")} ({t("common.optional")})</label>
                <input
                  type="text"
                  placeholder={t("sup.phTaxNumber")}
                  value={editingSupplier.taxNumber || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, taxNumber: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("sup.notes")}</label>
                <input
                  type="text"
                  value={editingSupplier.notes || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, notes: e.target.value })}
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
      {showStatement && statementSupplier && (() => {
        const { list, total, paid, remaining } = supplierTotals(statementSupplier.id);
        return (
          <div style={styles.modalOverlay} onClick={() => setShowStatement(false)}>
            <div
              style={{ ...styles.modalContent, maxWidth: "650px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={styles.modalHeader}>
                <h3>
                  <i className="fas fa-file-invoice" style={{ color: "#0891b2" }}></i>{" "}
                  {t("sup.statementTitle")}: {statementSupplier.name}
                </h3>
                <button onClick={() => setShowStatement(false)} style={styles.closeBtn}>&times;</button>
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <div className="stat-card cyan" style={{ flex: 1, minWidth: 140 }}>
                  <div className="stat-value" style={{ fontSize: 18 }}>
                    {total.toLocaleString()} {t("currency.short")}
                  </div>
                  <div className="stat-label">{t("sup.totalPurchases")}</div>
                </div>
                <div className="stat-card green" style={{ flex: 1, minWidth: 140 }}>
                  <div className="stat-value" style={{ fontSize: 18 }}>
                    {paid.toLocaleString()} {t("currency.short")}
                  </div>
                  <div className="stat-label">{t("sup.totalPaid")}</div>
                </div>
                <div className="stat-card red" style={{ flex: 1, minWidth: 140 }}>
                  <div className="stat-value" style={{ fontSize: 18 }}>
                    {remaining.toLocaleString()} {t("currency.short")}
                  </div>
                  <div className="stat-label">{t("sup.totalRemaining")}</div>
                </div>
              </div>
              {list.length === 0 ? (
                <p style={{ textAlign: "center", padding: 20, color: "#999" }}>
                  {t("sup.noPurchases")}
                </p>
              ) : (
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t("common.date")}</th>
                        <th>{t("common.amount")}</th>
                        <th>{t("in.paid")}</th>
                        <th>{t("in.remaining")}</th>
                        <th>{t("common.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((p, i) => {
                        const pPaid = parseFloat(p.paidAmount) || 0;
                        const pTotal = parseFloat(p.amount) || 0;
                        return (
                          <tr key={p.id}>
                            <td>{i + 1}</td>
                            <td>{p.date ? new Date(p.date).toLocaleDateString() : "-"}</td>
                            <td style={{ fontWeight: 700 }}>{pTotal.toLocaleString()}</td>
                            <td style={{ color: "#10b981" }}>{pPaid.toLocaleString()}</td>
                            <td style={{ fontWeight: 700, color: pTotal - pPaid > 0 ? "#ef4444" : "#10b981" }}>
                              {pTotal - pPaid > 0 ? (pTotal - pPaid).toLocaleString() : "✓"}
                            </td>
                            <td>{p.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => printStatement(statementSupplier)}
                  className="btn-primary"
                >
                  <i className="fas fa-print"></i> {t("sup.print")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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