// src/pages/Inventory.js - مع دعم مقاسات ديناميكية (ملابس، أحذية، إلخ) - تظهر فقط لصناعة الملابس
// + دعم كامل للمطاعم: أقسام من Firestore + إضافات (extras) على الأصناف
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

export default function Inventory() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();

  const isClothing = userIndustry === "clothing";
  const isRestaurant = userIndustry === "restaurant";
  const isRealEstate = userIndustry === "real_estate";

  // ── أقسام المنيو من Firestore (للمطاعم فقط) ──
  const [menuCategories, setMenuCategories] = useState([]);

  const fetchMenuCategories = useCallback(async () => {
    if (!isRestaurant || !userCompanyId) return;
    try {
      const snap = await getDocs(
        getScopedQuery("menu_categories", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setMenuCategories(data);
    } catch (err) {
      console.error("Error fetching menu categories:", err);
    }
  }, [isRestaurant, userRole, userCompanyId, currentUser?.uid]);

  // ── State ──
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // نموذج الإضافة الجديد
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    quantity: "",
    price: "",
    description: "",
    // ملابس
    type: "", size: "", color: "", brand: "",
    expiryDate: "",
    // مطعم - إضافات
    extras: [], // [{ name, price }]
    preparationNote: "", // ملاحظة تحضير افتراضية
  });

  // إضافة extra مؤقت في النموذج
  const [tempExtra, setTempExtra] = useState({ name: "", price: "" });

  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [tempEditExtra, setTempEditExtra] = useState({ name: "", price: "" });

  // ── خيارات ملابس ──
  const types = [
    { value: "men", label: "رجالي" },
    { value: "women", label: "حريمي" },
    { value: "kids", label: "أطفال" },
    { value: "unisex", label: "يونيسكس" },
  ];
  const sizeOptions = [
    { value: "XS", label: "XS", category: "clothing" },
    { value: "S", label: "S", category: "clothing" },
    { value: "M", label: "M", category: "clothing" },
    { value: "L", label: "L", category: "clothing" },
    { value: "XL", label: "XL", category: "clothing" },
    { value: "XXL", label: "XXL", category: "clothing" },
    { value: "XXXL", label: "XXXL", category: "clothing" },
    ...Array.from({ length: 29 }, (_, i) => ({ value: String(22 + i), label: String(22 + i), category: "shoes" })),
  ];
  const colors = [
    { value: "أسود", label: "⚫ أسود" }, { value: "أبيض", label: "⚪ أبيض" },
    { value: "أحمر", label: "🔴 أحمر" }, { value: "أزرق", label: "🔵 أزرق" },
    { value: "أخضر", label: "🟢 أخضر" }, { value: "أصفر", label: "🟡 أصفر" },
    { value: "رمادي", label: "⬜ رمادي" }, { value: "بني", label: "🟤 بني" },
    { value: "برتقالي", label: "🟠 برتقالي" }, { value: "وردي", label: "💗 وردي" },
    { value: "بنفسجي", label: "🟣 بنفسجي" },
  ];

  // ── Fetch ──
  const fetchProducts = useCallback(async () => {
    if (!userCompanyId) { setProducts([]); setLoading(false); return; }
    try {
      const querySnapshot = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid)
      );
      const data = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
      alert(t("inv.fetchErr"));
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid, t]);

  useEffect(() => {
    fetchProducts();
    fetchMenuCategories();
  }, [fetchProducts, fetchMenuCategories]);

  // ── helpers للإضافات ──
  function addTempExtra() {
    if (!tempExtra.name.trim()) return;
    setNewProduct((prev) => ({
      ...prev,
      extras: [...prev.extras, { name: tempExtra.name.trim(), price: parseFloat(tempExtra.price) || 0 }],
    }));
    setTempExtra({ name: "", price: "" });
  }
  function removeTempExtra(idx) {
    setNewProduct((prev) => ({ ...prev, extras: prev.extras.filter((_, i) => i !== idx) }));
  }
  function addEditExtra() {
    if (!tempEditExtra.name.trim()) return;
    setEditingProduct((prev) => ({
      ...prev,
      extras: [...(prev.extras || []), { name: tempEditExtra.name.trim(), price: parseFloat(tempEditExtra.price) || 0 }],
    }));
    setTempEditExtra({ name: "", price: "" });
  }
  function removeEditExtra(idx) {
    setEditingProduct((prev) => ({ ...prev, extras: (prev.extras || []).filter((_, i) => i !== idx) }));
  }

  // ── Add ──
  async function addProduct(e) {
    e.preventDefault();
    if (!newProduct.name || !newProduct.quantity || !newProduct.price) {
      alert(t("common.fillRequired")); return;
    }
    try {
      const docRef = await addDoc(collection(db, "inventory"), {
        ...newProduct,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        quantity: parseInt(newProduct.quantity),
        price: parseFloat(newProduct.price),
        type: isClothing ? newProduct.type || "" : "",
        size: isClothing ? newProduct.size || "" : "",
        color: isClothing ? newProduct.color || "" : "",
        brand: isClothing ? newProduct.brand || "" : "",
        expiryDate: newProduct.expiryDate || "",
        extras: isRestaurant ? (newProduct.extras || []) : [],
        preparationNote: isRestaurant ? (newProduct.preparationNote || "") : "",
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE", collectionName: "inventory", itemId: docRef.id,
        details: `Created product: ${newProduct.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewProduct({ name: "", category: "", quantity: "", price: "", description: "", type: "", size: "", color: "", brand: "", expiryDate: "", extras: [], preparationNote: "" });
      setTempExtra({ name: "", price: "" });
      await fetchProducts();
      alert(t("inv.addOk"));
    } catch (error) {
      console.error("Error adding product:", error);
      alert(t("inv.addFail"));
    }
  }

  // ── Update ──
  async function updateProduct(e) {
    e.preventDefault();
    if (!editingProduct.name || !editingProduct.quantity || !editingProduct.price) {
      alert(t("common.fillRequired")); return;
    }
    try {
      await updateDoc(doc(db, "inventory", editingProduct.id), {
        name: editingProduct.name,
        category: editingProduct.category || "",
        quantity: parseInt(editingProduct.quantity),
        price: parseFloat(editingProduct.price),
        description: editingProduct.description || "",
        type: isClothing ? editingProduct.type || "" : "",
        size: isClothing ? editingProduct.size || "" : "",
        color: isClothing ? editingProduct.color || "" : "",
        brand: isClothing ? editingProduct.brand || "" : "",
        expiryDate: editingProduct.expiryDate || "",
        extras: isRestaurant ? (editingProduct.extras || []) : [],
        preparationNote: isRestaurant ? (editingProduct.preparationNote || "") : "",
      });
      await logActivity({
        actionType: "UPDATE", collectionName: "inventory", itemId: editingProduct.id,
        details: `Updated product: ${editingProduct.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchProducts();
      setShowEditModal(false);
      setEditingProduct(null);
      alert(t("inv.updOk"));
    } catch (error) {
      console.error("Error updating product:", error);
      alert(t("inv.updFail"));
    }
  }

  // ── Delete ──
  async function deleteProduct(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      const productDoc = await getDoc(doc(db, "inventory", id));
      const productName = productDoc.exists() ? productDoc.data().name : "Unknown";
      await deleteDoc(doc(db, "inventory", id));
      await logActivity({
        actionType: "DELETE", collectionName: "inventory", itemId: id,
        details: `Deleted product: ${productName}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchProducts();
      alert(t("inv.delOk"));
    } catch (error) {
      console.error("Error deleting product:", error);
      alert(t("inv.delFail"));
    }
  }

  // ── Filter ──
  const filteredProducts = products.filter((product) => {
    const matchSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.type && product.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.brand && product.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.size && product.size.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchCat = filterCategory === "all" || product.category === filterCategory;
    return matchSearch && matchCat;
  });

  const getCategoryLabel = (catValue) => {
    const found = menuCategories.find((c) => c.id === catValue || c.name === catValue);
    if (found) return `${found.icon || ""} ${found.name}`;
    return catValue || "—";
  };

  const userCanDelete = canDelete(userRole);

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">{t("inv.loading")}</div>
        </div>
      </div>
    );
  }

  // ── الحقول الخاصة بالمطعم — مدمجة مباشرة في الـ JSX (لا تُعرَّف كـ component منفصل)
  // السبب: تعريف component جوه component بيسبب re-mount عند كل render وبيفقد الـ focus

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>
          {isRestaurant ? "🍽️" : userIndustry === "real_estate" ? "🏠" : "📦"}{" "}
          {isRestaurant ? "المنيو" : t(userIndustry === "real_estate" ? "inv.title.real_estate" : "inv.title")}
        </h2>

        {/* ── Add Form ── */}
        <form onSubmit={addProduct} className="form-container">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              type="text"
              placeholder={isRealEstate ? "اسم العقار / الوحدة" : isRestaurant ? "اسم الصنف (مثال: فراخ كرسبي)" : t("inv.phName")}
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              required
            />

            {/* أقسام وحقول المطعم */}
            {isRestaurant && (              <>
                {/* أقسام المنيو */}
                <select
                  value={newProduct.category || ""}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  style={{ padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}
                >
                  <option value="">— اختر قسم المنيو —</option>
                  {menuCategories.length === 0 && (
                    <option disabled>لا توجد أقسام — أضفها من صفحة أقسام المنيو</option>
                  )}
                  {menuCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>

                {/* ملاحظة تحضير */}
                <input
                  type="text"
                  placeholder="ملاحظة التحضير (مثال: يُقدَّم ساخناً مع صلصة)"
                  value={newProduct.preparationNote || ""}
                  onChange={(e) => setNewProduct({ ...newProduct, preparationNote: e.target.value })}
                />

                {/* الإضافات */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#374151", marginBottom: 8 }}>
                    🧩 الإضافات الاختيارية (Extras)
                  </div>
                  {(newProduct.extras || []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {(newProduct.extras || []).map((ex, idx) => (
                        <span key={idx} style={{
                          background: "#ede9fe", color: "#6d28d9", padding: "4px 10px",
                          borderRadius: 20, fontSize: 12, fontWeight: 600,
                          display: "flex", alignItems: "center", gap: 6,
                        }}>
                          {ex.name} {ex.price > 0 ? `(+${ex.price} ${t("currency")})` : ""}
                          <button
                            type="button"
                            onClick={() => removeTempExtra(idx)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", fontSize: 13, padding: 0, lineHeight: 1 }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      placeholder="اسم الإضافة (مثال: صوص حار)"
                      value={tempExtra.name}
                      onChange={(e) => setTempExtra({ ...tempExtra, name: e.target.value })}
                      style={{ flex: 2, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTempExtra(); } }}
                    />
                    <input
                      type="number" step="0.5" min="0"
                      placeholder="سعر (+)"
                      value={tempExtra.price}
                      onChange={(e) => setTempExtra({ ...tempExtra, price: e.target.value })}
                      style={{ flex: 1, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }}
                    />
                    <button type="button" onClick={addTempExtra}
                      style={{ background: "#6d28d9", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13 }}>
                      + إضافة
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* فئة للصناعات غير المطعم */}
            {!isRestaurant && (
              <input
                type="text"
                placeholder={isRealEstate ? "نوع العقار (شقة / فيلا / محل...)" : t("inv.phCat")}
                value={newProduct.category}
                onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
              />
            )}

            <input
              type="number"
              placeholder={isRealEstate ? "عدد الوحدات" : isRestaurant ? "الكمية المتاحة" : t("inv.phQty")}
              value={newProduct.quantity}
              onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })}
              required
            />
            <input
              type="number"
              placeholder={isRestaurant ? "سعر الصنف (ج.م)" : t("inv.phPrice")}
              value={newProduct.price}
              onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
              required
            />
            <input
              type="text"
              placeholder={isRealEstate ? "وصف العقار..." : isRestaurant ? "وصف الصنف (اختياري)" : t("inv.phDesc")}
              value={newProduct.description}
              onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
            />

            {/* حقول الملابس */}
            {isClothing && (
              <>
                <select value={newProduct.type} onChange={(e) => setNewProduct({ ...newProduct, type: e.target.value })}
                  style={{ padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}>
                  <option value="">النوع</option>
                  {types.map((tp) => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
                </select>
                <select value={newProduct.size} onChange={(e) => setNewProduct({ ...newProduct, size: e.target.value })}
                  style={{ padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}>
                  <option value="">المقاس</option>
                  {sizeOptions.map((s) => <option key={s.value} value={s.value}>{s.label} {s.category === "shoes" ? "(حذاء)" : "(ملابس)"}</option>)}
                </select>
                <select value={newProduct.color} onChange={(e) => setNewProduct({ ...newProduct, color: e.target.value })}
                  style={{ padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}>
                  <option value="">اللون</option>
                  {colors.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <input type="text" placeholder="الماركة (اختياري)" value={newProduct.brand}
                  onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })} />
              </>
            )}

            {!isRestaurant && (
              <input type="date" placeholder={t("inv.phExpiry")} value={newProduct.expiryDate}
                onChange={(e) => setNewProduct({ ...newProduct, expiryDate: e.target.value })} />
            )}
          </div>
          <button type="submit" className="btn-primary" style={{ marginTop: 12 }}>
            <i className="fas fa-plus"></i>{" "}
            {isRealEstate ? "إضافة عقار" : isRestaurant ? "إضافة صنف للمنيو" : t("inv.add")}
          </button>
        </form>

        {/* ── Filters ── */}
        <div style={{ marginBottom: "20px", marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder={isRealEstate ? "🔍 ابحث عن عقار..." : isRestaurant ? "🔍 ابحث في المنيو..." : t("inv.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: "12px 16px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "15px", outline: "none" }}
          />
          {isRestaurant && menuCategories.length > 0 && (
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{ padding: "12px 16px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}
            >
              <option value="all">كل الأقسام</option>
              {menuCategories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          )}
        </div>

        {/* ── Table ── */}
        <div className="table-container">
          <div className="table-header">
            <h3>{isRealEstate ? "قائمة العقارات" : isRestaurant ? "أصناف المنيو" : t("inv.list")}</h3>
            <span>{filteredProducts.length} {isRealEstate ? "عقار" : isRestaurant ? "صنف" : t("inv.products")}</span>
          </div>
          {filteredProducts.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm || filterCategory !== "all" ? t("common.noResults") : isRealEstate ? "لا توجد عقارات" : isRestaurant ? "لا توجد أصناف في المنيو بعد" : t("inv.empty")}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{isRealEstate ? "اسم العقار" : isRestaurant ? "الصنف" : t("inv.name")}</th>
                  <th>{isRealEstate ? "نوع العقار" : isRestaurant ? "القسم" : t("inv.category")}</th>
                  {isClothing && <><th>النوع</th><th>المقاس</th><th>اللون</th><th>الماركة</th></>}
                  {isRestaurant && <th>الإضافات</th>}
                  <th>{isRealEstate ? "عدد الوحدات" : t("common.quantity")}</th>
                  <th>{t("inv.price")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product, index) => (
                  <tr key={product.id}>
                    <td>{index + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{product.name}</div>
                      {isRestaurant && product.preparationNote && (
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{product.preparationNote}</div>
                      )}
                      {product.description && !isRestaurant && (
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{product.description}</div>
                      )}
                    </td>
                    <td>{isRestaurant ? getCategoryLabel(product.category) : (product.category || "—")}</td>
                    {isClothing && (
                      <>
                        <td>{product.type === "men" ? "رجالي" : product.type === "women" ? "حريمي" : product.type === "kids" ? "أطفال" : product.type === "unisex" ? "يونيسكس" : "—"}</td>
                        <td style={{ fontWeight: 600 }}>{product.size || "—"}</td>
                        <td>{product.color || "—"}</td>
                        <td>{product.brand || "—"}</td>
                      </>
                    )}
                    {isRestaurant && (
                      <td>
                        {(product.extras || []).length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {product.extras.map((ex, i) => (
                              <span key={i} style={{ background: "#ede9fe", color: "#6d28d9", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                                {ex.name}{ex.price > 0 ? ` +${ex.price}` : ""}
                              </span>
                            ))}
                          </div>
                        ) : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>}
                      </td>
                    )}
                    <td>
                      <span className={`badge ${product.quantity < 5 ? "badge-expired" : "badge-active"}`}>
                        {product.quantity}
                      </span>
                    </td>
                    <td>{product.price} {t("currency")}</td>
                    <td>
                      <button onClick={() => { setEditingProduct({ ...product }); setShowEditModal(true); }}
                        className="btn-primary" style={{ marginLeft: "8px", padding: "6px 14px", fontSize: "13px" }}>
                        <i className="fas fa-edit"></i> {t("common.edit")}
                      </button>
                      {userCanDelete && (
                        <button onClick={() => deleteProduct(product.id)} className="btn-danger">
                          <i className="fas fa-trash"></i> {t("common.delete")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {showEditModal && editingProduct && (
        <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-edit"></i> {isRealEstate ? "تعديل بيانات العقار" : isRestaurant ? "تعديل صنف المنيو" : t("inv.editTitle")}</h3>
              <button onClick={() => setShowEditModal(false)} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={updateProduct}>
              <div style={{ ...styles.formGroup, maxHeight: "65vh", overflowY: "auto", padding: "0 4px" }}>
                {/* الاسم */}
                <div style={styles.formGroup}>
                  <label>{isRealEstate ? "اسم العقار" : isRestaurant ? "اسم الصنف" : t("inv.name")}</label>
                  <input type="text" value={editingProduct.name} required style={styles.input}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />
                </div>

                {/* القسم / الفئة */}
                <div style={styles.formGroup}>
                  <label>{isRestaurant ? "قسم المنيو" : isRealEstate ? "نوع العقار" : t("inv.category")}</label>
                  {isRestaurant ? (
                    <select value={editingProduct.category || ""} style={styles.input}
                      onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}>
                      <option value="">— اختر القسم —</option>
                      {menuCategories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={editingProduct.category || ""} style={styles.input}
                      onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} />
                  )}
                </div>

                {/* ملاحظة التحضير للمطعم */}
                {isRestaurant && (
                  <div style={styles.formGroup}>
                    <label>ملاحظة التحضير</label>
                    <input type="text" value={editingProduct.preparationNote || ""} style={styles.input}
                      placeholder="مثال: يُقدَّم ساخناً مع صلصة"
                      onChange={(e) => setEditingProduct({ ...editingProduct, preparationNote: e.target.value })} />
                  </div>
                )}

                {/* ملابس */}
                {isClothing && (
                  <>
                    <div style={styles.formGroup}>
                      <label>النوع</label>
                      <select value={editingProduct.type || ""} style={styles.input}
                        onChange={(e) => setEditingProduct({ ...editingProduct, type: e.target.value })}>
                        <option value="">اختر النوع</option>
                        {types.map((tp) => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
                      </select>
                    </div>
                    <div style={styles.formGroup}>
                      <label>المقاس</label>
                      <select value={editingProduct.size || ""} style={styles.input}
                        onChange={(e) => setEditingProduct({ ...editingProduct, size: e.target.value })}>
                        <option value="">اختر المقاس</option>
                        {sizeOptions.map((s) => <option key={s.value} value={s.value}>{s.label} {s.category === "shoes" ? "(حذاء)" : "(ملابس)"}</option>)}
                      </select>
                    </div>
                    <div style={styles.formGroup}>
                      <label>اللون</label>
                      <select value={editingProduct.color || ""} style={styles.input}
                        onChange={(e) => setEditingProduct({ ...editingProduct, color: e.target.value })}>
                        <option value="">اختر اللون</option>
                        {colors.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div style={styles.formGroup}>
                      <label>الماركة</label>
                      <input type="text" value={editingProduct.brand || ""} style={styles.input}
                        onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })} />
                    </div>
                  </>
                )}

                <div style={styles.formGroup}>
                  <label>{isRealEstate ? "عدد الوحدات" : t("common.quantity")}</label>
                  <input type="number" value={editingProduct.quantity} required style={styles.input}
                    onChange={(e) => setEditingProduct({ ...editingProduct, quantity: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label>{t("inv.price")}</label>
                  <input type="number" value={editingProduct.price} required style={styles.input}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label>{isRealEstate ? "وصف العقار" : t("common.description")}</label>
                  <input type="text" value={editingProduct.description || ""} style={styles.input}
                    onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })} />
                </div>

                {!isRestaurant && (
                  <div style={{ ...styles.formGroup, display: isRealEstate ? "none" : "block" }}>
                    <label>تاريخ الصلاحية (اختياري)</label>
                    <input type="date" value={editingProduct.expiryDate || ""} style={styles.input}
                      onChange={(e) => setEditingProduct({ ...editingProduct, expiryDate: e.target.value })} />
                  </div>
                )}

                {/* إضافات المطعم في التعديل */}
                {isRestaurant && (
                  <div style={styles.formGroup}>
                    <label>الإضافات الاختيارية</label>
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
                      {(editingProduct.extras || []).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                          {(editingProduct.extras || []).map((ex, idx) => (
                            <span key={idx} style={{ background: "#ede9fe", color: "#6d28d9", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                              {ex.name} {ex.price > 0 ? `(+${ex.price} ${t("currency")})` : ""}
                              <button type="button" onClick={() => removeEditExtra(idx)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", fontSize: 13, padding: 0 }}>×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="text" placeholder="اسم الإضافة"
                          value={tempEditExtra.name}
                          onChange={(e) => setTempEditExtra({ ...tempEditExtra, name: e.target.value })}
                          style={{ flex: 2, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEditExtra(); } }}
                        />
                        <input type="number" step="0.5" min="0" placeholder="سعر (+)"
                          value={tempEditExtra.price}
                          onChange={(e) => setTempEditExtra({ ...tempEditExtra, price: e.target.value })}
                          style={{ flex: 1, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }}
                        />
                        <button type="button" onClick={addEditExtra}
                          style={{ background: "#6d28d9", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13 }}>
                          + إضافة
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-danger" style={{ marginLeft: "10px" }}>
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
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
    justifyContent: "center", alignItems: "center", zIndex: 1000, backdropFilter: "blur(4px)",
  },
  modalContent: {
    backgroundColor: "white", borderRadius: "16px", padding: "24px",
    width: "90%", maxWidth: "520px", maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  modalHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: "20px", paddingBottom: "12px", borderBottom: "2px solid #f1f5f9",
  },
  closeBtn: {
    background: "none", border: "none", fontSize: "24px",
    cursor: "pointer", color: "#94a3b8", lineHeight: 1,
  },
  formGroup: { marginBottom: "16px" },
  input: {
    width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0",
    borderRadius: "10px", fontSize: "14px", boxSizing: "border-box",
  },
  modalFooter: {
    display: "flex", justifyContent: "flex-end",
    paddingTop: "16px", borderTop: "1px solid #f1f5f9", marginTop: 8,
  },
};
