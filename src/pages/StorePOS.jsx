// src/pages/StorePOS.jsx - نقطة بيع محلات الملابس (منفصلة عن كاشير المطعم)
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import { EGYPT_PAYMENTS, getPaymentLabel } from "../utils/paymentMethods";
import { Shirt } from "lucide-react";

const NAVY = "#1e3a8a";

const TYPE_LABELS = { men: "رجالي", women: "حريمي", kids: "أطفال", unisex: "يونيسكس" };

export default function StorePOS() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();

  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [variantCodes, setVariantCodes] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterSize, setFilterSize] = useState("all");
  const [filterColor, setFilterColor] = useState("all");
  const [selectedClient, setSelectedClient] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [storeName, setStoreName] = useState("");

  useEffect(() => {
    if (!userCompanyId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "companies", userCompanyId));
        if (snap.exists()) setStoreName((snap.data().name || "").toString());
      } catch (e) {
        console.error(e);
      }
    })();
  }, [userCompanyId]);

  const fetchProducts = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchClients = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid));
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchVariantCodes = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("variant_codes", userRole, userCompanyId, currentUser?.uid));
      setVariantCodes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    Promise.all([fetchProducts(), fetchClients(), fetchVariantCodes()]);
  }, [fetchProducts, fetchClients, fetchVariantCodes]);

  // ── خيارات الفلاتر: من variant_codes لو موجودة وإلا من المنتجات ──
  const codeSizes = variantCodes.filter((c) => c.kind === "size").map((c) => c.code || c.name);
  const codeColors = variantCodes.filter((c) => c.kind === "color").map((c) => c.name || c.code);
  const sizeOptions = (codeSizes.length > 0
    ? [...new Set(codeSizes)]
    : [...new Set(products.map((p) => (p.size || "").trim()).filter(Boolean))]
  ).sort();
  const colorOptions = (codeColors.length > 0
    ? [...new Set(codeColors)]
    : [...new Set(products.map((p) => (p.color || "").trim()).filter(Boolean))]
  ).sort();
  const typeOptions = [...new Set(products.map((p) => (p.type || "").trim()).filter(Boolean))];

  const filteredProducts = products.filter((p) => {
    const term = searchTerm.trim().toLowerCase();
    const matchSearch =
      !term ||
      (p.name || "").toLowerCase().includes(term) ||
      (p.barcode || "").toLowerCase().includes(term) ||
      (p.model || "").toLowerCase().includes(term);
    const matchType = filterType === "all" || (p.type || "") === filterType;
    const matchSize = filterSize === "all" || (p.size || "") === filterSize;
    const matchColor = filterColor === "all" || (p.color || "") === filterColor;
    return matchSearch && matchType && matchSize && matchColor;
  });

  // السكانر: Enter على باركود مطابق تماماً يضيف للسلة فوراً
  function handleSearchKeyDown(e) {
    if (e.key !== "Enter") return;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return;
    const exact = products.find((p) => (p.barcode || "").toLowerCase() === term);
    if (exact) {
      e.preventDefault();
      addToCart(exact);
      setSearchTerm("");
    }
  }

  // ── السلة ──
  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.quantity) {
          alert(t("pos.qtyOver"));
          return prev;
        }
        return prev.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      if ((product.quantity || 0) < 1) {
        alert(t("pos.notAvail"));
        return prev;
      }
      return [...prev, { ...product, quantity: 1, stockQty: product.quantity }];
    });
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  }

  function updateCartQuantity(productId, newQty) {
    if (newQty < 0) return;
    if (newQty === 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        if (newQty > (item.stockQty ?? item.quantity)) {
          alert(t("pos.qtyOver"));
          return item;
        }
        return { ...item, quantity: newQty };
      })
    );
  }

  async function handleQuickAddClient() {
    if (!newClientName.trim()) {
      alert("اكتب اسم العميل الأول");
      return;
    }
    if (!userCompanyId) return;
    setAddingClient(true);
    try {
      const phoneToSave = (newClientPhone || "").trim();
      if (phoneToSave) {
        const existing = clients.find((c) => (c.phone || "").trim() === phoneToSave);
        if (existing) {
          setSelectedClient(existing.id);
          setNewClientName("");
          setNewClientPhone("");
          setAddingClient(false);
          return;
        }
      }
      const docRef = await addDoc(collection(db, "clients"), {
        name: newClientName.trim(),
        phone: phoneToSave,
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      const newClient = { id: docRef.id, name: newClientName.trim(), phone: phoneToSave };
      setClients((prev) => [...prev, newClient]);
      setSelectedClient(docRef.id);
      setNewClientName("");
      setNewClientPhone("");
    } catch (e) {
      console.error(e);
      alert("تعذر حفظ العميل");
    }
    setAddingClient(false);
  }

  const subtotal = cart.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * item.quantity, 0);
  const discountNum = Math.max(0, parseFloat(discount) || 0);
  const total = Math.max(0, subtotal - discountNum);

  // ── طباعة فاتورة حرارية 80mm زي المطعم (باسم المحل + باركود رقم الفاتورة) ──
  function handleThermalPrint(inv, cartSnapshot, clientName) {
    const escHtml = (s) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = cartSnapshot
      .map((item) => {
        const variant = [item.size, item.color].filter(Boolean).join(" / ");
        const line = (parseFloat(item.price) || 0) * item.quantity;
        return `<tr>
        <td style="padding:3px 6px;border-bottom:1px dashed #ccc;">${escHtml(item.name)}${variant ? `<div style="font-size:10px;color:#555;">${escHtml(variant)}</div>` : ""}</td>
        <td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;">${item.quantity}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;">${escHtml(String(item.price))}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;font-weight:bold;">${line.toFixed(2)}</td>
      </tr>`;
      })
      .join("");
    const invCode = String(inv.id || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "0";
    const printContent = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8"/>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 13px; width: 80mm; padding: 8px; }
  h2 { text-align: center; font-size: 17px; margin-bottom: 2px; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f0f0f0; padding: 4px 6px; font-size: 11px; }
  .total-row { font-weight: bold; font-size: 15px; }
  svg.bc { width: 60mm; height: 12mm; display: block; margin: 4px auto 0; }
  @media print { body { width: 80mm; } @page { size: 80mm auto; margin: 0; } }
</style>
</head>
<body>
<h2>${escHtml(storeName || "فاتورة بيع")}</h2>
<div class="center" style="font-size:11px;color:#666;">${new Date().toLocaleString("ar-EG")}</div>
<div class="divider"></div>
<div style="font-size:12px;margin-bottom:4px;">
  <strong>العميل:</strong> ${escHtml(clientName || "زبون نقدي")}<br/>
  <strong>الدفع:</strong> ${escHtml(getPaymentLabel(inv.paymentMethod))}
</div>
<div class="divider"></div>
<table>
  <thead><tr>
    <th style="text-align:right;">الصنف</th>
    <th>الكمية</th>
    <th>السعر</th>
    <th>الإجمالي</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="divider"></div>
<div style="text-align:left;font-size:13px;">
  <div>المجموع: ${subtotal.toFixed(2)} ج.م</div>
  ${discountNum > 0 ? `<div>الخصم: ${discountNum.toFixed(2)} ج.م</div>` : ""}
  <div class="total-row" style="margin-top:4px;border-top:2px solid #000;padding-top:4px;">
    الإجمالي: ${total.toFixed(2)} ج.م
  </div>
</div>
<div class="divider"></div>
<svg class="bc" id="invbc"></svg>
<div class="center" style="font-size:11px;margin-top:6px;">شكراً لزيارتكم 🙏</div>
<script>
  try {
    if (window.JsBarcode) JsBarcode("#invbc", "${invCode}", { format: "CODE128", displayValue: true, fontSize: 11, height: 40, width: 1.5, margin: 0 });
    else document.getElementById("invbc").outerHTML = "<div class='center'>${invCode}</div>";
  } catch (e) { document.getElementById("invbc").outerHTML = "<div class='center'>${invCode}</div>"; }
  setTimeout(function () { window.print(); }, 400);
<\/script>
</body>
</html>`;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) {
      alert("السماح بالـ popups مطلوب للطباعة");
      return;
    }
    win.document.write(printContent);
    win.document.close();
    win.focus();
  }

  // ── Checkout ──
  async function checkout(e) {
    e?.preventDefault();
    if (cart.length === 0) {
      alert(t("pos.addFirst"));
      return;
    }
    setSubmitting(true);
    try {
      // خصم المخزون مع التحقق من التوفر
      for (const item of cart) {
        const productRef = doc(db, "inventory", item.id);
        const productDoc = await getDoc(productRef);
        if (!productDoc.exists()) throw new Error(`الصنف "${item.name}" غير موجود`);
        const currentQty = productDoc.data().quantity || 0;
        if (currentQty < item.quantity) {
          throw new Error(`الكمية المتاحة من "${item.name}" غير كافية (متاح: ${currentQty})`);
        }
        await updateDoc(productRef, { quantity: currentQty - item.quantity });
      }

      const now = new Date().toISOString();
      const invRef = await addDoc(collection(db, "invoices"), {
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        clientId: selectedClient || null,
        products: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          amount: (parseFloat(item.price) || 0) * item.quantity,
          size: item.size || "",
          color: item.color || "",
        })),
        amount: total,
        paidAmount: total,
        status: "paid",
        approval: "validated",
        validatedBy: currentUser?.uid || null,
        validatedAt: now,
        paymentMethod: paymentMethod || "cash",
        date: now,
        createdAt: now,
        type: "store-pos",
      });

      await logActivity({
        actionType: "CREATE",
        collectionName: "invoices",
        itemId: invRef.id,
        details: `Store POS sale: ${cart.length} items, total ${total}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      const cartSnapshot = [...cart];
      const clientName = clients.find((c) => c.id === selectedClient)?.name || newClientName.trim() || "";
      const payMethod = paymentMethod;
      setCart([]);
      setSelectedClient("");
      setNewClientName("");
      setNewClientPhone("");
      setDiscount("");
      setPaymentMethod("cash");
      await Promise.all([fetchProducts(), fetchClients()]);
      handleThermalPrint({ id: invRef.id, paymentMethod: payMethod }, cartSnapshot, clientName);
    } catch (err) {
      console.error(err);
      alert(err.message || t("pos.fail"));
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>
            {t("pos.loading")}
          </div>
        </div>
      </div>
    );
  }

  const selectStyle = {
    padding: "8px 10px",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 13,
    background: "white",
    fontFamily: "Cairo, sans-serif",
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content" style={{ fontFamily: "Cairo, sans-serif" }}>
        <div className="header">
          <div>
            <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shirt size={26} color={NAVY} />
              {t("storepos.title")}
            </h1>
            <p className="subtitle">{t("storepos.subtitle")}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>
          {/* ── شبكة المنتجات ── */}
          <div>
            {/* بحث + فلاتر */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div className="search-wrapper" style={{ flex: 1, minWidth: 200 }}>
                <i className="fas fa-search search-icon"></i>
                <input
                  type="text"
                  placeholder={t("storepos.search")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  autoFocus
                />
              </div>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selectStyle}>
                <option value="all">{t("storepos.allTypes")}</option>
                {typeOptions.map((tp) => (
                  <option key={tp} value={tp}>
                    {TYPE_LABELS[tp] || tp}
                  </option>
                ))}
              </select>
              <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)} style={selectStyle}>
                <option value="all">{t("storepos.allSizes")}</option>
                {sizeOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select value={filterColor} onChange={(e) => setFilterColor(e.target.value)} style={selectStyle}>
                <option value="all">{t("storepos.allColors")}</option>
                {colorOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
              {filteredProducts.length === 0 ? (
                <div className="empty-state" style={{ gridColumn: "1/-1" }}>
                  <div className="empty-icon">
                    <i className="fas fa-shirt"></i>
                  </div>
                  <p>{searchTerm || filterType !== "all" || filterSize !== "all" || filterColor !== "all" ? t("common.noResults") : t("storepos.empty")}</p>
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const inCart = cart.find((c) => c.id === product.id);
                  const out = (product.quantity || 0) < 1;
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={out}
                      style={{
                        background: "white",
                        border: `2px solid ${inCart ? "#1e3a8a" : "#e2e8f0"}`,
                        borderRadius: 14,
                        padding: 0,
                        cursor: out ? "not-allowed" : "pointer",
                        opacity: out ? 0.55 : 1,
                        transition: "border-color 0.2s, transform 0.15s, box-shadow 0.15s",
                        textAlign: "right",
                        fontFamily: "Cairo, sans-serif",
                        overflow: "hidden",
                        position: "relative",
                      }}
                      onMouseEnter={(e) => {
                        if (!out) {
                          e.currentTarget.style.borderColor = "#1e3a8a";
                          e.currentTarget.style.transform = "translateY(-3px)";
                          e.currentTarget.style.boxShadow = "0 8px 20px rgba(30,58,138,0.15)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = inCart ? "#1e3a8a" : "#e2e8f0";
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {/* صورة المنتج */}
                      <div style={{ height: 120, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <Shirt size={44} color="#94a3b8" />
                        )}
                      </div>
                      {inCart && (
                        <span
                          style={{
                            position: "absolute",
                            top: 8,
                            left: 8,
                            background: "#1e3a8a",
                            color: "white",
                            borderRadius: "50%",
                            width: 22,
                            height: 22,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {inCart.quantity}
                        </span>
                      )}
                      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {product.name}
                        </div>
                        {(product.size || product.color) && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {product.size && (
                              <span style={{ fontSize: 10, background: "#eef2ff", color: "#4338ca", padding: "1px 8px", borderRadius: 10, fontWeight: 700 }}>
                                {product.size}
                              </span>
                            )}
                            {product.color && (
                              <span style={{ fontSize: 10, background: "#eff6ff", color: "#1e3a8a", padding: "1px 8px", borderRadius: 10, fontWeight: 700 }}>
                                {product.color}
                              </span>
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <span style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 14 }}>
                            {product.price} {t("currency")}
                          </span>
                          <span
                            className="badge"
                            style={{
                              background: (product.quantity || 0) < 5 ? "#fef2f2" : "#f0fdf4",
                              color: (product.quantity || 0) < 5 ? "#dc2626" : "#16a34a",
                              fontSize: 10,
                            }}
                          >
                            {product.quantity} {t("pos.remaining")}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── سلة البيع ── */}
          <div className="card" style={{ position: "sticky", top: 16 }}>
            <h3 style={{ marginBottom: 14 }}>
              <i className="fas fa-shopping-bag" style={{ color: "#1e3a8a" }}></i> {t("storepos.cart")}
              {cart.length > 0 && (
                <span className="badge" style={{ marginRight: 8, background: "#1e3a8a", color: "white" }}>
                  {cart.length}
                </span>
              )}
            </h3>

            {/* العميل */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#64748b" }}>{t("pos.client")}</label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box" }}
              >
                <option value="">{t("pos.walkIn")}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                    {client.phone ? ` — ${client.phone}` : ""}
                  </option>
                ))}
              </select>
              {!selectedClient && (
                <div style={{ marginTop: 8, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{t("storepos.quickClient")}</div>
                  <input
                    type="text"
                    placeholder={t("storepos.clientNamePh")}
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}
                  />
                  <input
                    type="tel"
                    placeholder={t("storepos.clientPhonePh")}
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddClient}
                    disabled={addingClient || !newClientName.trim()}
                    style={{
                      padding: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      border: "none",
                      borderRadius: 8,
                      background: !newClientName.trim() ? "#e2e8f0" : "#1e3a8a",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    {addingClient ? "..." : t("storepos.saveClient")}
                  </button>
                </div>
              )}
            </div>

            {/* أصناف السلة */}
            <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
              {cart.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px 0" }}>
                  <div className="empty-icon">
                    <i className="fas fa-cart-plus"></i>
                  </div>
                  <p>{t("pos.emptyCart")}</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 8, alignItems: "center" }}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0", flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 44, height: 44, borderRadius: 8, background: "#f1f5f9", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Shirt size={22} color="#94a3b8" />
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.name}
                      </div>
                      {(item.size || item.color) && (
                        <div style={{ fontSize: 11, color: "#6366f1" }}>
                          {[item.size, item.color].filter(Boolean).join(" / ")}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {item.price} {t("currency")} × {item.quantity} = <strong style={{ color: "#1e293b" }}>{((parseFloat(item.price) || 0) * item.quantity).toFixed(2)}</strong>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>
                        −
                      </button>
                      <span style={{ fontWeight: 700, minWidth: 22, textAlign: "center" }}>{item.quantity}</span>
                      <button
                        onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                        className="btn-success btn-sm"
                        style={{ padding: "2px 8px", fontSize: 12 }}
                        disabled={item.quantity >= (item.stockQty ?? item.quantity)}
                      >
                        +
                      </button>
                      <button onClick={() => removeFromCart(item.id)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* طريقة الدفع */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>{t("pay.title")}</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
              >
                {EGYPT_PAYMENTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* الإجمالي */}
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>{t("pos.subtotal")}</span>
                <span style={{ fontWeight: 700 }}>{subtotal.toFixed(2)} {t("currency")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>{t("pos.discount")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  style={{ width: 110, padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, textAlign: "center" }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px dashed #e2e8f0", paddingTop: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: "#1e293b" }}>{t("pos.total")}</span>
                <span style={{ fontWeight: 900, fontSize: 20, color: "#1e3a8a" }}>
                  {total.toFixed(2)} {t("currency")}
                </span>
              </div>
            </div>

            <button
              onClick={checkout}
              className="btn-primary btn-block"
              disabled={cart.length === 0 || submitting}
              style={{
                background: cart.length === 0 ? "#cbd5e1" : "linear-gradient(135deg,#1e3a8a,#1e3a8a)",
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
                  <i className="fas fa-check-circle"></i> {t("storepos.checkout")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
