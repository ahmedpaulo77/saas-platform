// src/pages/Quotations.js - عروض أسعار (نفس هيكل Invoices.js مع تبسيط)
// ✅ عرض السعر لا يخصم من المخزون ولا فيه دفعات؛ لو العميل وافق، بيتحول
// لفاتورة فعلية بضغطة زر (وقتها بس بيتم خصم الكمية من المخزون)
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { exportInvoicePDF } from "../utils/pdfExport";
import { useLanguage } from "../i18n/LanguageContext";
import { getAvailableModules } from "../utils/modules";
import { logActivity } from "../utils/auditLogger";
import AutocompleteInput from "../components/common/AutocompleteInput";
import Pagination from "../components/common/PaginationV2";
import { useFirestorePagination } from "../hooks/useFirestorePagination";
const PAGE_SIZE = 25;

export default function Quotations() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const hasInventory = getAvailableModules(userIndustry, userRole).has(
    "inventory",
  );
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [converting, setConverting] = useState(null);

  const [newQuotation, setNewQuotation] = useState({
    clientId: "",
    products: [], // Array of { productId, quantity, amount }
    status: "draft",
    description: "",
    validUntil: "",
  });

  const [editingQuotation, setEditingQuotation] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // إضافة عميل جديد
  const [showQuickAddClient, setShowQuickAddClient] = useState(false);
  const [quickClientName, setQuickClientName] = useState("");
  const [quickClientPhone, setQuickClientPhone] = useState("");
  const [addingClient, setAddingClient] = useState(false);

  const calculateProductAmount = (productId, quantity) => {
    const product = products.find((p) => p.id === productId);
    if (product && quantity > 0) {
      const price = parseFloat(product.price) || 0;
      return price * quantity;
    }
    return 0;
  };

  const getTotalAmount = useMemo(() => {
    return newQuotation.products.reduce(
      (sum, item) => sum + (parseFloat(item.amount) || 0),
      0,
    );
  }, [newQuotation.products]);

  const getEditTotalAmount = useMemo(() => {
    if (!editingQuotation || !editingQuotation.products) return 0;
    return editingQuotation.products.reduce(
      (sum, item) => sum + (parseFloat(item.amount) || 0),
      0,
    );
  }, [editingQuotation]);

  const filters = useMemo(() => {
    const f = [];
    if (filterStatus !== "all") {
      f.push(["status", "==", filterStatus]);
    }
    return f;
  }, [filterStatus]);

  const {
    data: quotations,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset: resetPagination,
  } = useFirestorePagination(
    "quotations",
    userRole,
    userCompanyId,
    currentUser?.uid,
    {
      pageSize: PAGE_SIZE,
      orderByField: "createdAt",
      orderDirection: "desc",
      filters,
      enabled: !!userCompanyId,
    },
  );

  const fetchClients = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid),
      );
      setClients(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          phone: d.data().phone || "",
        })),
      );
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchProducts = useCallback(async () => {
    if (!userCompanyId || !hasInventory) return;
    try {
      const snap = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid),
      );
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid, hasInventory]);

  async function handleQuickAddClient() {
    if (!quickClientName.trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    setAddingClient(true);
    try {
      const docRef = await addDoc(collection(db, "clients"), {
        name: quickClientName.trim(),
        phone: quickClientPhone.trim() || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      await fetchClients();
      setNewQuotation((prev) => ({ ...prev, clientId: docRef.id }));
      setQuickClientName("");
      setQuickClientPhone("");
      setShowQuickAddClient(false);
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
    setAddingClient(false);
  }

  useEffect(() => {
    fetchClients();
    fetchProducts();
  }, [fetchClients, fetchProducts]);

  useEffect(() => {
    resetPagination();
  }, [filterStatus, resetPagination]);

  const filteredQuotations = useMemo(() => {
    if (!searchTerm.trim()) return quotations;
    const term = searchTerm.toLowerCase();
    return quotations.filter((q) => {
      const clientName = clients.find((c) => c.id === q.clientId)?.name || "";
      const productNames =
        q.products?.map(
          (p) => products.find((pr) => pr.id === p.productId)?.name || "",
        ) || [];
      return (
        clientName.toLowerCase().includes(term) ||
        productNames.some((name) => name.toLowerCase().includes(term)) ||
        String(q.amount).includes(term) ||
        (q.description || "").toLowerCase().includes(term)
      );
    });
  }, [quotations, searchTerm, clients, products]);

  // ✅ إضافة عرض سعر جديد - من غير أي خصم من المخزون (لسه مجرد عرض)
  async function addQuotation(e) {
    e.preventDefault();
    if (!newQuotation.clientId || newQuotation.products.length === 0) return;
    setSubmitting(true);
    try {
      const totalAmount = getTotalAmount;
      const quotationData = {
        clientId: newQuotation.clientId,
        status: "draft",
        description: newQuotation.description,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        amount: totalAmount,
        quantity: hasInventory
          ? newQuotation.products.reduce(
              (sum, item) => sum + parseFloat(item.quantity || 0),
              0,
            )
          : 0,
        date: new Date().toISOString(),
        validUntil: newQuotation.validUntil || null,
        createdAt: new Date().toISOString(),
        convertedInvoiceId: null,
        products: newQuotation.products.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          amount: item.amount,
        })),
      };

      const docRef = await addDoc(collection(db, "quotations"), quotationData);

      await logActivity({
        actionType: "CREATE",
        collectionName: "quotations",
        itemId: docRef.id,
        details: `Created quotation for client ${newQuotation.clientId} with ${newQuotation.products.length} product(s), total amount ${totalAmount}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      setNewQuotation({
        clientId: "",
        products: [],
        status: "draft",
        description: "",
        validUntil: "",
      });
      await resetPagination();
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
    setSubmitting(false);
  }

  async function updateQuotation(e) {
    e.preventDefault();
    try {
      const totalAmount =
        editingQuotation.products && editingQuotation.products.length > 0
          ? getEditTotalAmount
          : parseFloat(editingQuotation.amount) || 0;
      await updateDoc(doc(db, "quotations", editingQuotation.id), {
        clientId: editingQuotation.clientId,
        amount: totalAmount,
        status: editingQuotation.status,
        description: editingQuotation.description || "",
        validUntil: editingQuotation.validUntil || null,
        products: editingQuotation.products.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          amount: item.amount,
        })),
      });

      await logActivity({
        actionType: "UPDATE",
        collectionName: "quotations",
        itemId: editingQuotation.id,
        details: `Updated quotation amount to ${totalAmount}, status to ${editingQuotation.status}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      await resetPagination();
      setShowEditModal(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteQuotation(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "quotations", id));

      await logActivity({
        actionType: "DELETE",
        collectionName: "quotations",
        itemId: id,
        details: `Deleted quotation`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      await resetPagination();
    } catch (e) {
      console.error(e);
    }
  }

  // ✅ تحويل عرض السعر لفاتورة حقيقية - هنا بس بيتم خصم المخزون فعليًا
  async function convertToInvoice(quotation) {
    if (!window.confirm(t("qt.confirmConvert") || "تحويل عرض السعر ده لفاتورة؟"))
      return;
    setConverting(quotation.id);
    try {
      if (hasInventory && quotation.products?.length > 0) {
        for (const item of quotation.products) {
          const productRef = doc(db, "inventory", item.productId);
          const productDoc = await getDoc(productRef);
          if (productDoc.exists()) {
            const currentQty = productDoc.data().quantity || 0;
            const qty = parseFloat(item.quantity) || 0;
            if (qty > 0 && currentQty - qty < 0) {
              alert(t("in.qtyOver"));
              setConverting(null);
              return;
            }
          }
        }
        for (const item of quotation.products) {
          const productRef = doc(db, "inventory", item.productId);
          const productDoc = await getDoc(productRef);
          if (productDoc.exists()) {
            const currentQty = productDoc.data().quantity || 0;
            const qty = parseFloat(item.quantity) || 0;
            if (qty > 0) {
              await updateDoc(productRef, { quantity: currentQty - qty });
            }
          }
        }
      }

      const invoiceData = {
        clientId: quotation.clientId,
        products: quotation.products || [],
        status: "pending",
        description: quotation.description || "",
        dueDate: null,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        amount: quotation.amount || 0,
        paidAmount: 0,
        quantity: quotation.quantity || 0,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        fromQuotationId: quotation.id,
      };

      const invRef = await addDoc(collection(db, "invoices"), invoiceData);

      await updateDoc(doc(db, "quotations", quotation.id), {
        status: "converted",
        convertedInvoiceId: invRef.id,
      });

      await logActivity({
        actionType: "UPDATE",
        collectionName: "quotations",
        itemId: quotation.id,
        details: `Converted quotation to invoice ${invRef.id}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      await Promise.all([resetPagination(), fetchProducts()]);
      alert(t("qt.convertOk") || "تم إنشاء الفاتورة بنجاح");
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
    setConverting(null);
  }

  function handleExportPDF(quotation) {
    const clientName =
      clients.find((c) => c.id === quotation.clientId)?.name ||
      t("common.unspecified");
    const productNames =
      quotation.products?.map(
        (p) =>
          products.find((pr) => pr.id === p.productId)?.name ||
          t("common.unspecified"),
      ) || [];
    const productNameStr = productNames.join(", ");
    exportInvoicePDF(quotation, clientName, productNameStr, "quotation");
  }

  const userCanDelete = canDelete(userRole);

  const draftCount = filteredQuotations.filter((q) => q.status === "draft").length;
  const sentCount = filteredQuotations.filter((q) => q.status === "sent").length;
  const acceptedCount = filteredQuotations.filter((q) => q.status === "accepted").length;
  const convertedCount = filteredQuotations.filter((q) => q.status === "converted").length;

  if (loading)
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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i
                className="fas fa-file-signature"
                style={{ color: "#f59e0b", marginLeft: 10 }}
              ></i>
              {t("qt.title") || "عروض الأسعار"}
            </h1>
            <p className="subtitle">
              {t("qt.subtitle") || "إنشاء ومتابعة عروض الأسعار للعملاء"}
            </p>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              padding: "12px 16px",
              borderRadius: 10,
              marginBottom: 16,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <i className="fas fa-exclamation-circle"></i>
            {error.message || t("common.errorGeneric")}
          </div>
        )}

        {isAdmin ? (
          <div
            className="stats-row"
            style={{
              gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))",
            }}
          >
            <div className="stat-card amber">
              <div className="stat-icon">
                <i className="fas fa-file-signature"></i>
              </div>
              <div className="stat-value">{filteredQuotations.length}</div>
              <div className="stat-label">{t("qt.statTotal") || "إجمالي العروض"}</div>
            </div>
            <div className="stat-card indigo">
              <div className="stat-icon">
                <i className="fas fa-pen"></i>
              </div>
              <div className="stat-value">{draftCount}</div>
              <div className="stat-label">{t("qt.statDraft") || "مسودة"}</div>
            </div>
            <div className="stat-card cyan">
              <div className="stat-icon">
                <i className="fas fa-paper-plane"></i>
              </div>
              <div className="stat-value">{sentCount}</div>
              <div className="stat-label">{t("qt.statSent") || "مُرسلة"}</div>
            </div>
            <div className="stat-card green">
              <div className="stat-icon">
                <i className="fas fa-check-circle"></i>
              </div>
              <div className="stat-value">{acceptedCount}</div>
              <div className="stat-label">{t("qt.statAccepted") || "موافَق عليها"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <i className="fas fa-file-invoice"></i>
              </div>
              <div className="stat-value">{convertedCount}</div>
              <div className="stat-label">{t("qt.statConverted") || "تحوّلت لفاتورة"}</div>
            </div>
          </div>
        ) : (
          <div
            className="card"
            style={{
              textAlign: "center",
              padding: "24px 20px",
              marginBottom: 24,
            }}
          >
            <i
              className="fas fa-lock"
              style={{ fontSize: 24, color: "#94a3b8", marginBottom: 8 }}
            ></i>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
              {t("in.statsAdminOnly")}
            </p>
          </div>
        )}

        {/* Add Form */}
        <div className="form-card">
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#6366f1" }}></i>
            {t("qt.add") || "إنشاء عرض سعر"}
          </h3>
          <form onSubmit={addQuotation}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div className="form-group">
                <label>{t("in.clientReq") || "العميل *"}</label>
                <AutocompleteInput
                  items={clients.map((c) => ({
                    id: c.id,
                    label: c.name,
                    sublabel: c.phone ? `📞 ${c.phone}` : "",
                  }))}
                  value={newQuotation.clientId}
                  onChange={(id) =>
                    setNewQuotation({ ...newQuotation, clientId: id })
                  }
                  placeholder={t("in.chooseClient") || "اختر العميل"}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowQuickAddClient(!showQuickAddClient)}
                  style={{
                    marginTop: 6,
                    background: "none",
                    border: "none",
                    color: "#6366f1",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  {showQuickAddClient ? "✕ إلغاء" : "+ إضافة عميل جديد"}
                </button>

                {showQuickAddClient && (
                  <div
                    style={{
                      marginTop: 8,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <input
                      type="text"
                      placeholder="اسم العميل *"
                      value={quickClientName}
                      onChange={(e) => setQuickClientName(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="الهاتف (اختياري)"
                      value={quickClientPhone}
                      onChange={(e) => setQuickClientPhone(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={handleQuickAddClient}
                      disabled={addingClient}
                    >
                      {addingClient ? "جاري الحفظ..." : "حفظ العميل"}
                    </button>
                  </div>
                )}
              </div>
              {hasInventory && (
                <div className="form-group">
                  <label>{t("in.productOpt") || "منتج (اختياري)"}</label>
                  <AutocompleteInput
                    items={products.map((p) => ({
                      id: p.id,
                      label: p.name,
                      sublabel: `${t("currency")} ${p.price || 0}`,
                    }))}
                    value={
                      newQuotation.products.length > 0
                        ? newQuotation.products[newQuotation.products.length - 1]
                            .productId
                        : ""
                    }
                    onChange={(productId) => {
                      const alreadySelected = newQuotation.products.some(
                        (p) => p.productId === productId,
                      );
                      if (alreadySelected) return;
                      const newProduct = {
                        productId,
                        quantity: "1",
                        amount: calculateProductAmount(productId, 1).toString(),
                      };
                      setNewQuotation({
                        ...newQuotation,
                        products: [...newQuotation.products, newProduct],
                      });
                    }}
                    placeholder={t("in.chooseProduct") || "اختر المنتج"}
                  />
                </div>
              )}
              {newQuotation.products.length > 0 && (
                <div
                  style={{
                    marginBottom: 12,
                    background: "#f8fafc",
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 8px",
                      fontSize: 13,
                      color: "#334155",
                    }}
                  >
                    {t("in.selectedProducts")} ({newQuotation.products.length})
                  </h4>
                  <div style={{ maxHeight: "120px", overflowY: "auto" }}>
                    {newQuotation.products.map((item, idx) => {
                      const product = products.find(
                        (p) => p.id === item.productId,
                      );
                      const productName = product ? product.name : "Unknown";
                      const total = parseFloat(item.amount) || 0;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 6,
                            paddingBottom: 6,
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          <span
                            style={{ flex: 1, fontSize: 13, color: "#475569" }}
                          >
                            {productName}
                            {item.quantity !== "1" && ` × ${item.quantity}`}
                          </span>
                          <span style={{ fontSize: 13, color: "#6366f1" }}>
                            {total.toLocaleString()} {t("currency")}
                            <button
                              onClick={() => {
                                const newProducts = newQuotation.products.filter(
                                  (_, i) => i !== idx,
                                );
                                setNewQuotation({
                                  ...newQuotation,
                                  products: newProducts,
                                });
                              }}
                              style={{
                                marginLeft: "8px",
                                background: "none",
                                border: "none",
                                color: "#ef4444",
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {newQuotation.products.length > 0 && hasInventory && (
                <div
                  className="form-group"
                  style={{ marginBottom: 0, marginTop: 8 }}
                >
                  <label>{t("in.qtyReq")}</label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={
                      newQuotation.products[newQuotation.products.length - 1]
                        ?.quantity || ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const numQty = parseFloat(raw);
                      const productId =
                        newQuotation.products[newQuotation.products.length - 1]
                          .productId;
                      const amount =
                        !isNaN(numQty) && numQty > 0
                          ? calculateProductAmount(productId, numQty).toString()
                          : "";
                      setNewQuotation({
                        ...newQuotation,
                        products: newQuotation.products.map((item, i) =>
                          i === newQuotation.products.length - 1
                            ? { ...item, quantity: raw, amount: amount }
                            : item,
                        ),
                      });
                    }}
                  />
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("in.amountReq")}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={getTotalAmount.toString() || "0.00"}
                  readOnly={newQuotation.products.length > 0}
                  onChange={(e) => {
                    if (newQuotation.products.length > 0) return;
                    setNewQuotation({ ...newQuotation, amount: e.target.value });
                  }}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("common.description")}</label>
                <input
                  type="text"
                  placeholder={t("in.notesPh")}
                  value={newQuotation.description}
                  onChange={(e) =>
                    setNewQuotation({
                      ...newQuotation,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{t("qt.validUntil") || "صالح حتى"}</label>
                <input
                  type="date"
                  value={newQuotation.validUntil}
                  onChange={(e) =>
                    setNewQuotation({ ...newQuotation, validUntil: e.target.value })
                  }
                />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>{" "}
                    {t("common.adding")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus"></i> {t("qt.add") || "إنشاء عرض سعر"}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              placeholder={t("in.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">{t("in.allStatus")}</option>
            <option value="draft">{t("qt.statusDraft") || "مسودة"}</option>
            <option value="sent">{t("qt.statusSent") || "مُرسل"}</option>
            <option value="accepted">{t("qt.statusAccepted") || "موافَق عليه"}</option>
            <option value="rejected">{t("qt.statusRejected") || "مرفوض"}</option>
            <option value="expired">{t("qt.statusExpired") || "منتهي"}</option>
            <option value="converted">{t("qt.statusConverted") || "تحوّل لفاتورة"}</option>
          </select>
        </div>

        {/* Table + Pagination */}
        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("qt.list") || "عروض الأسعار"}
            </h3>
            <span className="table-count">
              {filteredQuotations.length} {t("qt.title") || "عرض سعر"}
            </span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filteredQuotations}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onRefresh={resetPagination}
              pageSize={PAGE_SIZE}
              empty={
                <div className="table-empty">
                  <i className="fas fa-file-signature"></i>
                  <p>
                    {searchTerm || filterStatus !== "all"
                      ? t("common.noResults")
                      : t("qt.empty") || "لا توجد عروض أسعار بعد"}
                  </p>
                </div>
              }
              render={(pageItems) => (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("in.client") || "العميل"}</th>
                      {hasInventory && <th>{t("in.product") || "المنتج"}</th>}
                      {hasInventory && <th>{t("common.quantity")}</th>}
                      <th>{t("common.amount")}</th>
                      <th>{t("common.status")}</th>
                      <th>{t("qt.validUntil") || "صالح حتى"}</th>
                      <th>{t("common.date")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((q, i) => {
                      const clientName =
                        clients.find((c) => c.id === q.clientId)?.name ||
                        t("common.unspecified");

                      const productDetails =
                        q.products?.map((p) => {
                          const pr = products.find(
                            (item) => item.id === p.productId,
                          );
                          const name = pr ? pr.name : t("common.unspecified");
                          const qty = p.quantity || 1;
                          return `${name} (${qty})`;
                        }) || [];

                      const productStr =
                        productDetails.length > 0
                          ? productDetails.join(" ، ")
                          : "-";
                      const totalQuantity = q.products
                        ? q.products.reduce(
                            (sum, item) => sum + parseFloat(item.quantity || 0),
                            0,
                          )
                        : 0;

                      const statusLabelMap = {
                        draft: t("qt.statusDraft") || "مسودة",
                        sent: t("qt.statusSent") || "مُرسل",
                        accepted: t("qt.statusAccepted") || "موافَق عليه",
                        rejected: t("qt.statusRejected") || "مرفوض",
                        expired: t("qt.statusExpired") || "منتهي",
                        converted: t("qt.statusConverted") || "تحوّل لفاتورة",
                      };
                      const statusBadgeClass = {
                        draft: "badge-info",
                        sent: "badge-pending",
                        accepted: "badge-paid",
                        rejected: "badge-expired",
                        expired: "badge-expired",
                        converted: "badge-paid",
                      };

                      return (
                        <tr key={q.id}>
                          <td
                            style={{
                              color: "var(--gray-400)",
                              fontWeight: 600,
                            }}
                          >
                            {i + 1}
                          </td>
                          <td style={{ fontWeight: 600 }}>{clientName}</td>
                          {hasInventory && <td>{productStr}</td>}
                          {hasInventory && <td>{totalQuantity}</td>}
                          <td
                            style={{
                              fontWeight: 700,
                              color: "var(--gray-800)",
                            }}
                          >
                            {(q.amount || 0).toLocaleString()} {t("currency")}
                          </td>
                          <td>
                            <span
                              className={`badge ${statusBadgeClass[q.status] || "badge-info"}`}
                            >
                              {statusLabelMap[q.status] || q.status}
                            </span>
                          </td>
                          <td
                            style={{ color: "var(--gray-500)", fontSize: 13 }}
                          >
                            {q.validUntil
                              ? new Date(q.validUntil).toLocaleDateString()
                              : "-"}
                          </td>
                          <td
                            style={{ color: "var(--gray-500)", fontSize: 13 }}
                          >
                            {q.date
                              ? new Date(q.date).toLocaleDateString()
                              : "-"}
                          </td>
                          <td>
                            <div className="table-actions">
                              <button
                                onClick={() => handleExportPDF(q)}
                                className="btn-primary btn-sm"
                                title={t("in.pdf")}
                              >
                                <i className="fas fa-file-pdf"></i> PDF
                              </button>
                              {q.status === "accepted" && (
                                <button
                                  onClick={() => convertToInvoice(q)}
                                  className="btn-success btn-sm"
                                  title={t("qt.convert") || "تحويل لفاتورة"}
                                  disabled={converting === q.id}
                                >
                                  {converting === q.id ? (
                                    <i className="fas fa-spinner fa-spin"></i>
                                  ) : (
                                    <i className="fas fa-file-invoice"></i>
                                  )}
                                </button>
                              )}
                              {q.status !== "converted" && (
                                <button
                                  onClick={() => {
                                    setEditingQuotation(q);
                                    setShowEditModal(true);
                                  }}
                                  className="btn-secondary btn-sm"
                                  title={t("common.edit")}
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                              )}
                              {userCanDelete && (
                                <button
                                  onClick={() => deleteQuotation(q.id)}
                                  className="btn-danger btn-sm"
                                  title={t("common.delete")}
                                >
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

        {/* Edit Modal */}
        {showEditModal && editingQuotation && (
          <>
            <div
              className="modal-overlay"
              onClick={() => setShowEditModal(false)}
            >
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h3>
                    <i className="fas fa-edit" style={{ color: "#6366f1" }}></i>{" "}
                    {t("common.edit")}
                  </h3>
                  <button
                    className="modal-close"
                    onClick={() => setShowEditModal(false)}
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={updateQuotation}>
                  <div
                    className="modal-body"
                    style={{ maxHeight: "70vh", overflowY: "auto" }}
                  >
                    <div className="form-group">
                      <label>{t("in.client") || "العميل"}</label>
                      <AutocompleteInput
                        items={clients.map((c) => ({
                          id: c.id,
                          label: c.name,
                          sublabel: c.phone ? `📞 ${c.phone}` : "",
                        }))}
                        value={editingQuotation.clientId}
                        onChange={(id) =>
                          setEditingQuotation({ ...editingQuotation, clientId: id })
                        }
                        placeholder={t("in.chooseClient") || "اختر العميل"}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("common.amount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={
                          editingQuotation.products &&
                          editingQuotation.products.length > 0
                            ? getEditTotalAmount
                            : editingQuotation.amount
                        }
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            amount: e.target.value,
                          })
                        }
                        readOnly={
                          editingQuotation.products &&
                          editingQuotation.products.length > 0
                        }
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("common.status")}</label>
                      <select
                        value={editingQuotation.status}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            status: e.target.value,
                          })
                        }
                      >
                        <option value="draft">{t("qt.statusDraft") || "مسودة"}</option>
                        <option value="sent">{t("qt.statusSent") || "مُرسل"}</option>
                        <option value="accepted">
                          {t("qt.statusAccepted") || "موافَق عليه"}
                        </option>
                        <option value="rejected">
                          {t("qt.statusRejected") || "مرفوض"}
                        </option>
                        <option value="expired">
                          {t("qt.statusExpired") || "منتهي"}
                        </option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>{t("common.description")}</label>
                      <input
                        type="text"
                        value={editingQuotation.description || ""}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            description: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("qt.validUntil") || "صالح حتى"}</label>
                      <input
                        type="date"
                        value={editingQuotation.validUntil || ""}
                        onChange={(e) =>
                          setEditingQuotation({
                            ...editingQuotation,
                            validUntil: e.target.value,
                          })
                        }
                      />
                    </div>

                    {hasInventory && (
                      <div
                        style={{
                          marginTop: 16,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: 14,
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 10px",
                            fontSize: 14,
                            color: "#1e293b",
                            fontWeight: 700,
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>{t("in.currentProducts") || "المنتجات الحالية"}</span>
                          <span style={{ color: "#6366f1" }}>
                            ({editingQuotation.products?.length || 0})
                          </span>
                        </h4>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            marginBottom: 12,
                          }}
                        >
                          {editingQuotation.products &&
                            editingQuotation.products.map((item, idx) => {
                              const product = products.find(
                                (p) => p.id === item.productId,
                              );
                              const productName = product
                                ? product.name
                                : "منتج غير محدد";
                              const total = parseFloat(item.amount) || 0;

                              return (
                                <div
                                  key={idx}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    background: "#ffffff",
                                    padding: "8px 12px",
                                    borderRadius: 6,
                                    border: "1px solid #cbd5e1",
                                    gap: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 13,
                                      color: "#334155",
                                      fontWeight: 600,
                                      flex: 1,
                                    }}
                                  >
                                    {productName}
                                  </span>

                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                    }}
                                  >
                                    <span style={{ fontSize: 12, color: "#64748b" }}>
                                      الكمية:
                                    </span>
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => {
                                        const newQty =
                                          parseFloat(e.target.value) || 1;
                                        const unitPrice = product
                                          ? parseFloat(product.price) || 0
                                          : 0;
                                        const updatedProducts = [
                                          ...editingQuotation.products,
                                        ];
                                        updatedProducts[idx] = {
                                          ...item,
                                          quantity: newQty,
                                          amount: (unitPrice * newQty).toString(),
                                        };
                                        setEditingQuotation({
                                          ...editingQuotation,
                                          products: updatedProducts,
                                        });
                                      }}
                                      style={{
                                        width: "60px",
                                        padding: "4px 6px",
                                        fontSize: "12px",
                                        borderRadius: "4px",
                                        border: "1px solid #cbd5e1",
                                        textAlign: "center",
                                      }}
                                    />
                                  </div>

                                  <span
                                    style={{
                                      fontSize: 13,
                                      color: "#10b981",
                                      fontWeight: 700,
                                      minWidth: "70px",
                                      textAlign: "left",
                                    }}
                                  >
                                    {total.toLocaleString()} {t("currency")}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newProducts =
                                        editingQuotation.products.filter(
                                          (_, i) => i !== idx,
                                        );
                                      setEditingQuotation({
                                        ...editingQuotation,
                                        products: newProducts,
                                      });
                                    }}
                                    style={{
                                      background: "#fee2e2",
                                      border: "none",
                                      color: "#ef4444",
                                      borderRadius: 4,
                                      padding: "4px 8px",
                                      cursor: "pointer",
                                      fontSize: 12,
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label
                            style={{
                              fontSize: 12,
                              color: "#475569",
                              fontWeight: 600,
                            }}
                          >
                            + {t("in.addProduct") || "إضافة منتج جديد"}
                          </label>
                          <AutocompleteInput
                            items={products.map((p) => ({
                              id: p.id,
                              label: p.name,
                              sublabel: `${t("currency")} ${p.price || 0}`,
                            }))}
                            value=""
                            onChange={(productId) => {
                              if (!productId) return;
                              const alreadySelected =
                                editingQuotation.products?.some(
                                  (p) => p.productId === productId,
                                );
                              if (alreadySelected) return;

                              const newProduct = {
                                productId,
                                quantity: 1,
                                amount: calculateProductAmount(
                                  productId,
                                  1,
                                ).toString(),
                              };
                              setEditingQuotation({
                                ...editingQuotation,
                                products: [
                                  ...(editingQuotation.products || []),
                                  newProduct,
                                ],
                              });
                            }}
                            placeholder={
                              t("in.chooseProduct") || "اختر المنتج لإضافته..."
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowEditModal(false)}
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
          </>
        )}
      </div>
    </div>
  );
}