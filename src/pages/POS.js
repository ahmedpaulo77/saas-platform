// src/pages/POS.js - نقطة البيع مع دعم المطعم: تيك أواي/ديليفري + إضافات + طباعة حرارية
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

// أنواع الطلبات للمطعم - تيك أواي وديليفري بس
const ORDER_TYPES = [
  { value: "takeaway", label: "🥡 تيك أواي" },
  { value: "delivery", label: "🛵 توصيل" },
];

export default function POS() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const isRestaurant = userIndustry === "restaurant";

  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [categories, setCategories] = useState([]); // أقسام المنيو من Firestore
  const [selectedClient, setSelectedClient] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // حقول المطعم
  const [orderType, setOrderType] = useState("takeaway");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  // إضافات مخصصة لكل صنف في السلة
  const [cartItemNotes, setCartItemNotes] = useState({}); // { productId: note }
  const [cartItemExtras, setCartItemExtras] = useState({}); // { productId: [extraIdx] }

  const fetchProducts = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchClients = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid));
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchCategories = useCallback(async () => {
    if (!isRestaurant) return;
    try {
      const snap = await getDocs(getScopedQuery("menu_categories", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setCategories(data);
    } catch (e) { console.error(e); }
  }, [isRestaurant, userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    Promise.all([fetchProducts(), fetchClients(), fetchCategories()]);
  }, [fetchProducts, fetchClients, fetchCategories]);

  // فلتر المنتجات
  const filteredProducts = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.type && p.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.size && p.size.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.color && p.color.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchCat = filterCategory === "all" || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  function getCategoryLabel(catId) {
    const found = categories.find((c) => c.id === catId || c.name === catId);
    if (found) return `${found.icon || ""} ${found.name}`;
    return catId || "";
  }

  // ── دالة مساعدة للـ details ──
  const getProductDetails = (product) => {
    if (isRestaurant) return product.description || "";
    const details = [];
    if (product.type) {
      const typeMap = { men: "رجالي", women: "حريمي", kids: "أطفال", unisex: "يونيسكس" };
      details.push(typeMap[product.type] || product.type);
    }
    if (product.size) details.push(product.size);
    if (product.color) details.push(product.color);
    return details.join(" - ");
  };

  // ── إدارة السلة ──
  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.quantity) { alert(t("pos.qtyOver")); return prev; }
        return prev.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      } else {
        if (product.quantity < 1) { alert(t("pos.notAvail")); return prev; }
        return [...prev, { ...product, quantity: 1, stockQty: product.quantity }];
      }
    });
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((item) => item.id !== productId));
    setCartItemNotes((prev) => { const n = { ...prev }; delete n[productId]; return n; });
    setCartItemExtras((prev) => { const n = { ...prev }; delete n[productId]; return n; });
  }

  function updateCartQuantity(productId, newQty) {
    if (newQty < 0) return;
    if (newQty === 0) { removeFromCart(productId); return; }
    setCart((prev) => prev.map((item) => {
      if (item.id !== productId) return item;
      if (newQty > (item.stockQty || item.quantity)) { alert(t("pos.qtyOver")); return item; }
      return { ...item, quantity: newQty };
    }));
  }

  // حساب سعر صنف مع الإضافات
  function getItemTotalPrice(item) {
    const basePrice = (item.price || 0) * item.quantity;
    const extras = item.extras || [];
    const selectedExtraIdxs = cartItemExtras[item.id] || [];
    const extrasTotal = selectedExtraIdxs.reduce((sum, idx) => {
      const ex = extras[idx];
      return ex ? sum + (parseFloat(ex.price) || 0) * item.quantity : sum;
    }, 0);
    return basePrice + extrasTotal;
  }

  const subtotal = cart.reduce((sum, item) => sum + getItemTotalPrice(item), 0);
  const deliveryFeeNum = parseFloat(deliveryFee) || 0;
  const total = subtotal + (orderType === "delivery" ? deliveryFeeNum : 0);

  // ── طباعة حرارية ──
  function handleThermalPrint(invoiceData) {
    const clientName = clients.find((c) => c.id === selectedClient)?.name || "زبون";
    const orderTypeLabel = ORDER_TYPES.find((o) => o.value === orderType)?.label || "";

    const itemsRows = cart.map((item) => {
      const selectedExtraIdxs = cartItemExtras[item.id] || [];
      const extras = (item.extras || []).filter((_, i) => selectedExtraIdxs.includes(i));
      const extrasText = extras.length > 0 ? `<div style="font-size:10px;color:#666;padding-right:8px;">+ ${extras.map((e) => e.name).join(", ")}</div>` : "";
      const noteText = cartItemNotes[item.id] ? `<div style="font-size:10px;color:#888;font-style:italic;padding-right:8px;">📝 ${cartItemNotes[item.id]}</div>` : "";
      return `<tr>
        <td style="padding:3px 6px;border-bottom:1px dashed #ccc;vertical-align:top;">
          ${item.name}${extrasText}${noteText}
        </td>
        <td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;vertical-align:top;">${item.quantity}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;vertical-align:top;">${item.price}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;vertical-align:top;font-weight:bold;">${getItemTotalPrice(item).toFixed(2)}</td>
      </tr>`;
    }).join("");

    const deliveryInfo = orderType === "delivery" ? `
      <div style="margin:6px 0;font-size:12px;">
        <strong>📍 العنوان:</strong> ${deliveryAddress || "—"}<br/>
        ${deliveryPhone ? `<strong>📞 هاتف:</strong> ${deliveryPhone}` : ""}
        ${deliveryFeeNum > 0 ? `<br/><strong>🛵 رسوم التوصيل:</strong> ${deliveryFeeNum} ج.م` : ""}
      </div>` : "";

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
  @media print {
    body { width: 80mm; }
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>
<h2>🍗 فاتورة المطعم</h2>
<div class="center" style="font-size:11px;color:#666;">${new Date().toLocaleString("ar-EG")}</div>
<div class="divider"></div>
<div style="font-size:12px;margin-bottom:4px;">
  <strong>الزبون:</strong> ${clientName}<br/>
  <strong>نوع الطلب:</strong> ${orderTypeLabel}
</div>
${deliveryInfo}
${customerNote ? `<div style="font-size:11px;color:#555;margin:4px 0;"><strong>ملاحظة:</strong> ${customerNote}</div>` : ""}
<div class="divider"></div>
<table>
  <thead><tr>
    <th style="text-align:right;">الصنف</th>
    <th>الكمية</th>
    <th>السعر</th>
    <th>الإجمالي</th>
  </tr></thead>
  <tbody>${itemsRows}</tbody>
</table>
<div class="divider"></div>
<div style="text-align:left;font-size:13px;">
  <div>المجموع: ${subtotal.toFixed(2)} ج.م</div>
  ${orderType === "delivery" && deliveryFeeNum > 0 ? `<div>رسوم التوصيل: ${deliveryFeeNum} ج.م</div>` : ""}
  <div style="margin-top:4px;font-size:15px;font-weight:bold;border-top:2px solid #000;padding-top:4px;">
    الإجمالي: ${total.toFixed(2)} ج.م
  </div>
</div>
<div class="divider"></div>
<div class="center" style="font-size:11px;margin-top:6px;">شكراً لزيارتكم 🙏</div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) { alert("السماح بالـ popups مطلوب للطباعة"); return; }
    win.document.write(printContent);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  // ── Checkout ──
  async function checkout(e) {
    e.preventDefault();
    if (cart.length === 0) { alert(t("pos.addFirst")); return; }
    if (isRestaurant && orderType === "delivery" && !deliveryAddress.trim()) {
      alert("يرجى إدخال عنوان التوصيل"); return;
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
        createdBy: currentUser?.uid || null,
        createdByEmail: currentUser?.email || "",
        clientId: selectedClient || null,
        items: cart.map((item) => {
          const selectedExtraIdxs = cartItemExtras[item.id] || [];
          const selectedExtras = (item.extras || []).filter((_, i) => selectedExtraIdxs.includes(i));
          return {
            productId: item.id,
            productName: item.name,
            quantity: item.quantity,
            price: item.price || 0,
            extras: selectedExtras,
            note: cartItemNotes[item.id] || "",
            itemTotal: getItemTotalPrice(item),
            // حقول الملابس
            productType: item.type || "",
            productSize: item.size || "",
            productColor: item.color || "",
          };
        }),
        subtotal,
        discount: 0,
        deliveryFee: isRestaurant && orderType === "delivery" ? deliveryFeeNum : 0,
        total,
        amount: total,
        status: "paid",
        paidAmount: total,
        // حقول المطعم
        orderType: isRestaurant ? orderType : "",
        orderStatus: isRestaurant ? "new" : "",
        deliveryAddress: isRestaurant && orderType === "delivery" ? deliveryAddress : "",
        deliveryPhone: isRestaurant && orderType === "delivery" ? deliveryPhone : "",
        customerNote: isRestaurant ? customerNote : "",
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        type: "pos",
      };

      await addDoc(collection(db, "invoices"), invDoc);

      // طباعة تلقائية للمطعم
      if (isRestaurant) handleThermalPrint(invDoc);

      // reset
      setCart([]);
      setSelectedClient("");
      setOrderType("takeaway");
      setDeliveryAddress("");
      setDeliveryPhone("");
      setDeliveryFee("");
      setCustomerNote("");
      setCartItemNotes({});
      setCartItemExtras({});
      await Promise.all([fetchProducts(), fetchClients()]);
      if (!isRestaurant) alert(t("pos.ok"));
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
          <div className="loading"><div className="spinner"></div>{t("pos.loading")}</div>
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
              {isRestaurant ? "🍗 كاشير المطعم" : t("pos.title")}
            </h1>
            <p className="subtitle">{isRestaurant ? "تسجيل طلبات تيك أواي وتوصيل سريع" : t("pos.subtitle")}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20, alignItems: "start" }}>

          {/* ── المنتجات / المنيو ── */}
          <div>
            {/* بحث + فلتر الأقسام */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div className="search-wrapper" style={{ flex: 1 }}>
                <i className="fas fa-search search-icon"></i>
                <input
                  type="text"
                  placeholder={isRestaurant ? "ابحث في المنيو..." : t("pos.search")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                />
              </div>
              {isRestaurant && categories.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={() => setFilterCategory("all")}
                    style={{
                      padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 20,
                      border: `2px solid ${filterCategory === "all" ? "#f59e0b" : "#e2e8f0"}`,
                      background: filterCategory === "all" ? "#fffbeb" : "white",
                      color: filterCategory === "all" ? "#d97706" : "#64748b",
                      cursor: "pointer",
                    }}
                  >الكل</button>
                  {categories.map((cat) => (
                    <button key={cat.id}
                      onClick={() => setFilterCategory(filterCategory === cat.id ? "all" : cat.id)}
                      style={{
                        padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 20,
                        border: `2px solid ${filterCategory === cat.id ? "#f59e0b" : "#e2e8f0"}`,
                        background: filterCategory === cat.id ? "#fffbeb" : "white",
                        color: filterCategory === cat.id ? "#d97706" : "#64748b",
                        cursor: "pointer",
                      }}
                    >{cat.icon} {cat.name}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Grid الأصناف */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12 }}>
              {filteredProducts.length === 0 ? (
                <div className="empty-state" style={{ gridColumn: "1/-1" }}>
                  <div className="empty-icon"><i className="fas fa-box-open"></i></div>
                  <p>{searchTerm || filterCategory !== "all" ? t("common.noResults") : t("pos.noProducts")}</p>
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const details = getProductDetails(product);
                  const inCart = cart.find((c) => c.id === product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={product.quantity < 1}
                      style={{
                        background: "white",
                        border: `2px solid ${inCart ? "#f59e0b" : product.quantity < 1 ? "#e2e8f0" : "#e2e8f0"}`,
                        borderRadius: 12, padding: "12px",
                        cursor: product.quantity < 1 ? "not-allowed" : "pointer",
                        opacity: product.quantity < 1 ? 0.5 : 1,
                        transition: "border-color 0.2s, transform 0.15s",
                        textAlign: "right",
                        fontFamily: "Cairo, sans-serif",
                        display: "flex", flexDirection: "column", gap: 4,
                        position: "relative",
                      }}
                      onMouseEnter={(e) => {
                        if (product.quantity >= 1) {
                          e.currentTarget.style.borderColor = "#10b981";
                          e.currentTarget.style.transform = "translateY(-2px)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = inCart ? "#f59e0b" : "#e2e8f0";
                        e.currentTarget.style.transform = "none";
                      }}
                    >
                      {inCart && (
                        <span style={{
                          position: "absolute", top: 6, left: 6,
                          background: "#f59e0b", color: "white",
                          borderRadius: "50%", width: 20, height: 20,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700,
                        }}>{inCart.quantity}</span>
                      )}
                      {isRestaurant && product.category && (
                        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>
                          {getCategoryLabel(product.category)}
                        </div>
                      )}
                      <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{product.name}</div>
                      {details && <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 500 }}>{details}</div>}
                      {!isRestaurant && (
                        <div style={{ fontSize: 12, color: "#64748b" }}>{product.category || t("pos.noCat")}</div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontWeight: 800, color: "#10b981" }}>{product.price} {t("currency")}</span>
                        <span className="badge" style={{ background: product.quantity < 5 ? "#fef2f2" : "#f0fdf4", color: product.quantity < 5 ? "#dc2626" : "#16a34a", fontSize: 10 }}>
                          {product.quantity} {t("pos.remaining")}
                        </span>
                      </div>
                      {/* إضافات المنيو */}
                      {isRestaurant && (product.extras || []).length > 0 && (
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {product.extras.slice(0, 3).map((ex, i) => (
                            <span key={i} style={{ fontSize: 9, background: "#ede9fe", color: "#6d28d9", padding: "1px 6px", borderRadius: 10 }}>
                              {ex.name}{ex.price > 0 ? ` +${ex.price}` : ""}
                            </span>
                          ))}
                          {product.extras.length > 3 && <span style={{ fontSize: 9, color: "#94a3b8" }}>+{product.extras.length - 3}</span>}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── السلة ── */}
          <div className="card" style={{ position: "sticky", top: 16 }}>
            <h3 style={{ marginBottom: 14 }}>
              <i className="fas fa-shopping-cart" style={{ color: "#10b981" }}></i>
              {isRestaurant ? " الطلب" : " " + t("pos.cart")}
              {cart.length > 0 && (
                <span className="badge" style={{ marginRight: 8, background: "#10b981", color: "white" }}>{cart.length}</span>
              )}
            </h3>

            {/* نوع الطلب للمطعم */}
            {isRestaurant && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>نوع الطلب</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {ORDER_TYPES.map((ot) => (
                    <button key={ot.value} type="button"
                      onClick={() => setOrderType(ot.value)}
                      style={{
                        flex: 1, padding: "8px", fontSize: 13, fontWeight: 700,
                        border: `2px solid ${orderType === ot.value ? "#f59e0b" : "#e2e8f0"}`,
                        borderRadius: 10,
                        background: orderType === ot.value ? "#fffbeb" : "white",
                        color: orderType === ot.value ? "#d97706" : "#64748b",
                        cursor: "pointer",
                      }}
                    >{ot.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* حقول الديليفري */}
            {isRestaurant && orderType === "delivery" && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="text" placeholder="📍 عنوان التوصيل *"
                  value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                />
                <input type="tel" placeholder="📞 رقم الهاتف"
                  value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                />
                <input type="number" step="0.5" min="0" placeholder="🛵 رسوم التوصيل"
                  value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                />
              </div>
            )}

            {/* الزبون */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#64748b" }}>{isRestaurant ? "الزبون (اختياري)" : t("pos.client")}</label>
              <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}
                disabled={clients.length === 0}>
                <option value="">{isRestaurant ? "زبون جديد / نقدي" : t("pos.walkIn")}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}{client.phone ? ` — ${client.phone}` : ""}</option>
                ))}
              </select>
            </div>

            {/* ملاحظة عامة */}
            {isRestaurant && (
              <div style={{ marginBottom: 12 }}>
                <input type="text" placeholder="📝 ملاحظة عامة على الطلب"
                  value={customerNote} onChange={(e) => setCustomerNote(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            )}

            {/* أصناف السلة */}
            <div style={{ maxHeight: 340, overflowY: "auto", marginBottom: 12 }}>
              {cart.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px 0" }}>
                  <div className="empty-icon"><i className="fas fa-cart-plus"></i></div>
                  <p>{isRestaurant ? "اضغط على صنف لإضافته للطلب" : t("pos.emptyCart")}</p>
                </div>
              ) : (
                cart.map((item) => {
                  const selectedExtraIdxs = cartItemExtras[item.id] || [];
                  return (
                    <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            {item.price} {t("currency")} × {item.quantity}
                            {selectedExtraIdxs.length > 0 && (
                              <span style={{ color: "#6d28d9" }}>
                                {" "}+ {selectedExtraIdxs.reduce((s, idx) => s + (item.extras?.[idx]?.price || 0), 0) * item.quantity} {t("currency")} إضافات
                              </span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>−</button>
                        <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center" }}>{item.quantity}</span>
                        <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} className="btn-success btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}
                          disabled={item.quantity >= (item.stockQty || item.quantity)}>+</button>
                        <button onClick={() => removeFromCart(item.id)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>

                      {/* إضافات الصنف */}
                      {isRestaurant && (item.extras || []).length > 0 && (
                        <div style={{ marginTop: 6, paddingRight: 4 }}>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>الإضافات:</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {item.extras.map((ex, idx) => {
                              const isSelected = selectedExtraIdxs.includes(idx);
                              return (
                                <button key={idx} type="button"
                                  onClick={() => {
                                    const current = cartItemExtras[item.id] || [];
                                    const updated = isSelected ? current.filter((i) => i !== idx) : [...current, idx];
                                    setCartItemExtras({ ...cartItemExtras, [item.id]: updated });
                                  }}
                                  style={{
                                    padding: "2px 8px", fontSize: 11, borderRadius: 12, cursor: "pointer",
                                    border: `1px solid ${isSelected ? "#6d28d9" : "#e2e8f0"}`,
                                    background: isSelected ? "#ede9fe" : "white",
                                    color: isSelected ? "#6d28d9" : "#64748b",
                                    fontWeight: isSelected ? 700 : 400,
                                  }}
                                >
                                  {ex.name}{ex.price > 0 ? ` +${ex.price}` : ""}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ملاحظة على الصنف */}
                      {isRestaurant && (
                        <input type="text" placeholder="ملاحظة على هذا الصنف (اختياري)"
                          value={cartItemNotes[item.id] || ""}
                          onChange={(e) => setCartItemNotes({ ...cartItemNotes, [item.id]: e.target.value })}
                          style={{ marginTop: 6, width: "100%", padding: "5px 8px", border: "1px dashed #e2e8f0", borderRadius: 6, fontSize: 11, boxSizing: "border-box", background: "#fafafa" }}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* الإجمالي */}
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>{t("pos.subtotal")}</span>
                <span style={{ fontWeight: 700 }}>{subtotal.toFixed(2)} {t("currency")}</span>
              </div>
              {isRestaurant && orderType === "delivery" && deliveryFeeNum > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>🛵 رسوم التوصيل</span>
                  <span style={{ fontWeight: 700, color: "#f59e0b" }}>{deliveryFeeNum.toFixed(2)} {t("currency")}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px dashed #e2e8f0", paddingTop: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: "#1e293b" }}>{t("pos.total")}</span>
                <span style={{ fontWeight: 900, fontSize: 20, color: "#10b981" }}>{total.toFixed(2)} {t("currency")}</span>
              </div>
            </div>

            <button
              onClick={checkout}
              className="btn-primary btn-block"
              disabled={cart.length === 0 || submitting}
              style={{
                background: cart.length === 0 ? "#cbd5e1" : "linear-gradient(135deg,#10b981,#059669)",
                fontSize: 16, padding: "14px",
              }}
            >
              {submitting ? (
                <><i className="fas fa-spinner fa-spin"></i> {t("pos.completing")}</>
              ) : (
                <>
                  <i className={isRestaurant ? "fas fa-print" : "fas fa-check-circle"}></i>
                  {isRestaurant
                    ? ` تأكيد الطلب وطباعة — ${total.toFixed(2)} ${t("currency")}`
                    : ` ${t("pos.complete", { amount: total.toFixed(2) })}`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
