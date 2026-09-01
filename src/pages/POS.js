// src/pages/POS.js - نقطة البيع مع دعم الترجمة + عرض تفاصيل المنتج (نوع، مقاس، لون)
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

export default function POS() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchClients = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClients(data);
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    Promise.all([fetchProducts(), fetchClients()]);
  }, [fetchProducts, fetchClients]);

  // ✅ فلتر المنتجات يشمل النوع، المقاس، اللون
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.type && p.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.size && p.size.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.color && p.color.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.quantity) {
          alert(t("pos.qtyOver"));
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        if (product.quantity < 1) {
          alert(t("pos.notAvail"));
          return prev;
        }
        return [...prev, { ...product, quantity: 1, stockQty: product.quantity }];
      }
    });
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  }

  function updateCartQuantity(productId, newQty) {
    if (newQty < 0) return;
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        const stockQty = item.stockQty || item.quantity;
        if (newQty > stockQty) {
          alert(t("pos.qtyOver"));
          return item;
        }
        return { ...item, quantity: newQty };
      })
    );
  }

  // ✅ دالة مساعدة لعرض تفاصيل المنتج
  const getProductDetails = (product) => {
    const details = [];
    if (product.type) {
      const typeMap = {
        men: t('inv.typeMen'),
        women: t('inv.typeWomen'),
        kids: t('inv.typeKids'),
        unisex: t('inv.typeUnisex'),
      };
      details.push(typeMap[product.type] || product.type);
    }
    if (product.size) details.push(product.size);
    if (product.color) details.push(product.color);
    return details.join(' - ');
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
  const discount = 0;
  const total = subtotal - discount;

  async function checkout(e) {
    e.preventDefault();
    if (cart.length === 0) {
      alert(t("pos.addFirst"));
      return;
    }
    setSubmitting(true);

    try {
      for (const item of cart) {
        const productRef = doc(db, "inventory", item.id);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          const currentQty = productDoc.data().quantity || 0;
          await updateDoc(productRef, { quantity: currentQty - item.quantity });
        }
      }

      const invDoc = {
        companyId: userCompanyId,
        clientId: selectedClient || null,
        items: cart.map((item) => ({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          price: item.price || 0,
          // ✅ حفظ تفاصيل المنتج في الفاتورة
          productType: item.type || '',
          productSize: item.size || '',
          productColor: item.color || '',
        })),
        subtotal: subtotal,
        discount: discount,
        total: total,
        amount: total,
        status: "paid",
        paidAmount: total,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        type: "pos",
      };
      await addDoc(collection(db, "invoices"), invDoc);

      setCart([]);
      setSelectedClient("");
      await Promise.all([fetchProducts(), fetchClients()]);
      alert(t("pos.ok"));
    } catch (e) {
      console.error(e);
      alert(t("pos.fail"));
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>{t("pos.loading")}
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
              <i className="fas fa-cash-register" style={{ color: "#10b981", marginLeft: 10 }}></i>
              {t("pos.title")}
            </h1>
            <p className="subtitle">{t("pos.subtitle")}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20, alignItems: "start" }}>
          <div>
            <div className="search-wrapper" style={{ marginBottom: 16 }}>
              <i className="fas fa-search search-icon"></i>
              <input
                type="text"
                placeholder={t("pos.search")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}>
              {filteredProducts.length === 0 ? (
                <div className="empty-state" style={{ gridColumn: "1/-1" }}>
                  <div className="empty-icon">
                    <i className="fas fa-box-open"></i>
                  </div>
                  <p>{searchTerm ? t("common.noResults") : t("pos.noProducts")}</p>
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const details = getProductDetails(product);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={product.quantity < 1}
                      style={{
                        background: "white",
                        border: `2px solid ${product.quantity < 1 ? "#e2e8f0" : "#e2e8f0"}`,
                        borderRadius: 12,
                        padding: "14px",
                        cursor: product.quantity < 1 ? "not-allowed" : "pointer",
                        opacity: product.quantity < 1 ? 0.5 : 1,
                        transition: "border-color 0.2s, transform 0.2s",
                        textAlign: "right",
                        fontFamily: "Cairo, sans-serif",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                      onMouseEnter={(e) => {
                        if (product.quantity >= 1) {
                          e.currentTarget.style.borderColor = "#10b981";
                          e.currentTarget.style.transform = "translateY(-2px)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.transform = "none";
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>
                        {product.name}
                      </div>
                      {/* ✅ عرض تفاصيل المنتج (نوع - مقاس - لون) */}
                      {details && (
                        <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 500 }}>
                          {details}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {product.category || t("pos.noCat")}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 800, color: "#10b981" }}>
                          {product.price} {t("currency")}
                        </span>
                        <span
                          className="badge"
                          style={{
                            background: product.quantity < 5 ? "#fef2f2" : "#f0fdf4",
                            color: product.quantity < 5 ? "#dc2626" : "#16a34a",
                          }}
                        >
                          {product.quantity} {t("pos.remaining")}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="card" style={{ position: "sticky", top: 16 }}>
            <h3 style={{ marginBottom: 14 }}>
              <i className="fas fa-shopping-cart" style={{ color: "#10b981" }}></i>
              {t("pos.cart")}
              {cart.length > 0 && (
                <span
                  className="badge"
                  style={{ marginLeft: 8, background: "#10b981", color: "white" }}
                >
                  {cart.length}
                </span>
              )}
            </h3>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>{t("pos.client")}</label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                disabled={clients.length === 0}
              >
                <option value="">{t("pos.walkIn")}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
              {cart.length === 0 ? (
                <div className="empty-state" style={{ padding: "30px 0" }}>
                  <div className="empty-icon">
                    <i className="fas fa-cart-plus"></i>
                  </div>
                  <p>{t("pos.emptyCart")}</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 0",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {item.price} {t("currency")} × {item.quantity}
                      </div>
                    </div>
                    <button
                      onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                      className="btn-danger btn-sm"
                      style={{ padding: "2px 8px", fontSize: 12 }}
                    >
                      −
                    </button>
                    <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center" }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                      className="btn-success btn-sm"
                      style={{ padding: "2px 8px", fontSize: 12 }}
                      disabled={item.quantity >= (item.stockQty || item.quantity)}
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="btn-danger btn-sm"
                      style={{ padding: "2px 8px", fontSize: 12 }}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{
              background: "#f8fafc",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>{t("pos.subtotal")}</span>
                <span style={{ fontWeight: 700 }}>{subtotal.toFixed(2)} {t("currency")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>{t("pos.discount")}</span>
                <span style={{ fontWeight: 700, color: "#ef4444" }}>{discount.toFixed(2)} {t("currency")}</span>
              </div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                borderTop: "2px dashed #e2e8f0",
                paddingTop: 10,
              }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: "#1e293b" }}>{t("pos.total")}</span>
                <span style={{ fontWeight: 900, fontSize: 20, color: "#10b981" }}>
                  {total.toFixed(2)} {t("currency")}
                </span>
              </div>
            </div>

            <button
              onClick={checkout}
              className="btn-primary btn-block"
              disabled={cart.length === 0 || submitting}
              style={{
                background: cart.length === 0 ? "#cbd5e1" : "linear-gradient(135deg,#10b981,#059669)",
                fontSize: 16,
                padding: "14px",
              }}
            >
              {submitting ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> {t("pos.completing")}
                </>
              ) : (
                <>
                  <i className="fas fa-check-circle"></i> {t("pos.complete", { amount: total.toFixed(2) })}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}