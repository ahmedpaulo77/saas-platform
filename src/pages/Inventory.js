// src/pages/Inventory.js - مع دعم مقاسات ديناميكية (ملابس، أحذية، إلخ) - تظهر فقط لصناعة الملابس
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

  // ✅ الحقول الخاصة بالملابس/الأحذية تظهر بس لصناعة clothing
  const isClothing = userIndustry === "clothing";
  const isRestaurant = userIndustry === "restaurant";
    const isRealEstate = userIndustry === "real_estate";

  // ✅ تصنيفات المنيو للمطاعم
  const menuCategories = [
    { value: 'appetizers', label: '🥗 مقبلات' },
    { value: 'main', label: '🍖 أطباق رئيسية' },
    { value: 'drinks', label: '🥤 مشروبات' },
    { value: 'desserts', label: '🍰 حلويات' },
  ];  

  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    quantity: "",
    price: "",
    description: "",
    // ✅ حقول خاصة بالملابس
    type: "", // رجالي، حريمي، أطفال
    size: "", // المقاس (نص أو رقم)
    color: "", // اللون
    brand: "", // الماركة
    expiryDate: "",
  });
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // ✅ خيارات النوع
  const types = [
    { value: "men", label: "رجالي" },
    { value: "women", label: "حريمي" },
    { value: "kids", label: "أطفال" },
    { value: "unisex", label: "يونيسكس" },
  ];

  // ✅ خيارات المقاسات - ثابتة
  const sizeOptions = [
    // مقاسات الملابس
    { value: "XS", label: "XS", category: "clothing" },
    { value: "S", label: "S", category: "clothing" },
    { value: "M", label: "M", category: "clothing" },
    { value: "L", label: "L", category: "clothing" },
    { value: "XL", label: "XL", category: "clothing" },
    { value: "XXL", label: "XXL", category: "clothing" },
    { value: "XXXL", label: "XXXL", category: "clothing" },
    // مقاسات الأحذية (أرقام)
    { value: "22", label: "22", category: "shoes" },
    { value: "23", label: "23", category: "shoes" },
    { value: "24", label: "24", category: "shoes" },
    { value: "25", label: "25", category: "shoes" },
    { value: "26", label: "26", category: "shoes" },
    { value: "27", label: "27", category: "shoes" },
    { value: "28", label: "28", category: "shoes" },
    { value: "29", label: "29", category: "shoes" },
    { value: "30", label: "30", category: "shoes" },
    { value: "31", label: "31", category: "shoes" },
    { value: "32", label: "32", category: "shoes" },
    { value: "33", label: "33", category: "shoes" },
    { value: "34", label: "34", category: "shoes" },
    { value: "35", label: "35", category: "shoes" },
    { value: "36", label: "36", category: "shoes" },
    { value: "37", label: "37", category: "shoes" },
    { value: "38", label: "38", category: "shoes" },
    { value: "39", label: "39", category: "shoes" },
    { value: "40", label: "40", category: "shoes" },
    { value: "41", label: "41", category: "shoes" },
    { value: "42", label: "42", category: "shoes" },
    { value: "43", label: "43", category: "shoes" },
    { value: "44", label: "44", category: "shoes" },
    { value: "45", label: "45", category: "shoes" },
    { value: "46", label: "46", category: "shoes" },
    { value: "47", label: "47", category: "shoes" },
    { value: "48", label: "48", category: "shoes" },
    { value: "49", label: "49", category: "shoes" },
    { value: "50", label: "50", category: "shoes" },
  ];

  // ✅ خيارات الألوان
  const colors = [
    { value: "أسود", label: "⚫ أسود" },
    { value: "أبيض", label: "⚪ أبيض" },
    { value: "أحمر", label: "🔴 أحمر" },
    { value: "أزرق", label: "🔵 أزرق" },
    { value: "أخضر", label: "🟢 أخضر" },
    { value: "أصفر", label: "🟡 أصفر" },
    { value: "رمادي", label: "⬜ رمادي" },
    { value: "بني", label: "🟤 بني" },
    { value: "برتقالي", label: "🟠 برتقالي" },
    { value: "وردي", label: "💗 وردي" },
    { value: "بنفسجي", label: "🟣 بنفسجي" },
  ];

  const fetchProducts = useCallback(async () => {
    if (!userCompanyId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      const querySnapshot = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid),
      );
      const productsData = [];
      querySnapshot.forEach((d) => {
        productsData.push({ id: d.id, ...d.data() });
      });
      setProducts(productsData);
    } catch (error) {
      console.error("Error fetching products:", error);
      alert(t("inv.fetchErr"));
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid, t]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  async function addProduct(e) {
    e.preventDefault();
    if (!newProduct.name || !newProduct.quantity || !newProduct.price) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      const docRef = await addDoc(collection(db, "inventory"), {
        ...newProduct,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        quantity: parseInt(newProduct.quantity),
        price: parseFloat(newProduct.price),
        // ✅ الحقول دي تتسجل بس لو صناعة ملابس، غير كده تتبعت فاضية
        type: isClothing ? newProduct.type || "" : "",
        size: isClothing ? newProduct.size || "" : "",
        color: isClothing ? newProduct.color || "" : "",
        brand: isClothing ? newProduct.brand || "" : "",
        expiryDate: newProduct.expiryDate || "",
        createdAt: new Date().toISOString(),
      });

      // ✅ Audit Log
      await logActivity({
        actionType: "CREATE",
        collectionName: "inventory",
        itemId: docRef.id,
        details: `Created product: ${newProduct.name}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      setNewProduct({
        name: "",
        category: "",
        quantity: "",
        price: "",
        description: "",
        type: "",
        size: "",
        color: "",
        brand: "",
        expiryDate: "",
      });
      await fetchProducts();
      alert(t("inv.addOk"));
    } catch (error) {
      console.error("Error adding product:", error);
      alert(t("inv.addFail"));
    }
  }

  function openEditModal(product) {
    setEditingProduct(product);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingProduct(null);
    setShowEditModal(false);
  }

  async function updateProduct(e) {
    e.preventDefault();
    if (
      !editingProduct.name ||
      !editingProduct.quantity ||
      !editingProduct.price
    ) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      const productRef = doc(db, "inventory", editingProduct.id);
      await updateDoc(productRef, {
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
      });

      // ✅ Audit Log
      await logActivity({
        actionType: "UPDATE",
        collectionName: "inventory",
        itemId: editingProduct.id,
        details: `Updated product: ${editingProduct.name}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      await fetchProducts();
      closeEditModal();
      alert(t("inv.updOk"));
    } catch (error) {
      console.error("Error updating product:", error);
      alert(t("inv.updFail"));
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      // Get product name before deletion for audit log
      const productDoc = await getDoc(doc(db, "inventory", id));
      const productName = productDoc.exists()
        ? productDoc.data().name
        : "Unknown";

      await deleteDoc(doc(db, "inventory", id));

      // ✅ Audit Log
      await logActivity({
        actionType: "DELETE",
        collectionName: "inventory",
        itemId: id,
        details: `Deleted product: ${productName}`,
        user: {
          uid: currentUser?.uid,
          email: currentUser?.email,
          role: userRole,
          companyId: userCompanyId,
        },
      });

      await fetchProducts();
      alert(t("inv.delOk"));
    } catch (error) {
      console.error("Error deleting product:", error);
      alert(t("inv.delFail"));
    }
  }

  // ✅ فلتر حسب الفئة (للبحث عن مقاس معين)
  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.category &&
        product.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.type &&
        product.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.brand &&
        product.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.size &&
        product.size.toLowerCase().includes(searchTerm.toLowerCase())),
  );

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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>
          {userIndustry === "real_estate" ? "🏠" : "📦"}{" "}
          {t(userIndustry === "real_estate" ? "inv.title.real_estate" : "inv.title")}        </h2>

        <form onSubmit={addProduct} className="form-container">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {" "}
            <input
              type="text"
              placeholder={isRealEstate ? "اسم العقار / الوحدة" : t("inv.phName")}              value={newProduct.name}
              onChange={(e) =>
                setNewProduct({ ...newProduct, name: e.target.value })
              }
              required
            />
                        {isRestaurant ? (
              <select
                value={newProduct.category}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, category: e.target.value })
                }
                style={{
                  padding: "10px 14px",
                  border: "2px solid #e2e8f0",
                  borderRadius: "10px",
                  fontSize: "14px",
                  background: "white",
                }}
              >
                <option value="">تصنيف الصنف</option>
                {menuCategories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder={isRealEstate ? "نوع العقار (شقة / فيلا / محل...)" : t("inv.phCat")}                value={newProduct.category}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, category: e.target.value })
                }
              />
            )}
            <input
              type="number"
              placeholder={isRealEstate ? "عدد الوحدات" : t("inv.phQty")}              value={newProduct.quantity}
              onChange={(e) =>
                setNewProduct({ ...newProduct, quantity: e.target.value })
              }
              required
            />
            <input
              type="number"
              placeholder={t("inv.phPrice")}
              value={newProduct.price}
              onChange={(e) =>
                setNewProduct({ ...newProduct, price: e.target.value })
              }
              required
            />
            <input
              type="text"
              placeholder={isRealEstate ? "وصف العقار (الموقع، المساحة، عدد الغرف...)" : t("inv.phDesc")}              value={newProduct.description}
              onChange={(e) =>
                setNewProduct({ ...newProduct, description: e.target.value })
              }
            />
            {/* ✅ الحقول دي تظهر بس لصناعة الملابس */}
            {isClothing && (
              <>
                {/* النوع (رجالي/حريمي/أطفال) */}
                <select
                  value={newProduct.type}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, type: e.target.value })
                  }
                  style={{
                    padding: "10px 14px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    background: "white",
                  }}
                >
                  <option value="">النوع</option>
                  {types.map((tp) => (
                    <option key={tp.value} value={tp.value}>
                      {tp.label}
                    </option>
                  ))}
                </select>

                {/* المقاس (كل الخيارات) */}
                <select
                  value={newProduct.size}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, size: e.target.value })
                  }
                  style={{
                    padding: "10px 14px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    background: "white",
                  }}
                >
                  <option value="">المقاس</option>
                  {sizeOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label} {s.category === "shoes" ? "(حذاء)" : "(ملابس)"}
                    </option>
                  ))}
                </select>

                {/* اللون */}
                <select
                  value={newProduct.color}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, color: e.target.value })
                  }
                  style={{
                    padding: "10px 14px",
                    border: "2px solid #e2e8f0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    background: "white",
                  }}
                >
                  <option value="">اللون</option>
                  {colors.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {/* الماركة */}
                <input
                  type="text"
                  placeholder="الماركة (اختياري)"
                  value={newProduct.brand}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, brand: e.target.value })
                  }
                />
              </>
            )}
            <input
              type="date"
              placeholder={t("inv.phExpiry")}
              value={newProduct.expiryDate}
              onChange={(e) =>
                setNewProduct({ ...newProduct, expiryDate: e.target.value })
              }
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            style={{ marginTop: 12 }}
          >
            <i className="fas fa-plus"></i> {isRealEstate ? "إضافة عقار" : t("inv.add")}          </button>
        </form>

        <div style={{ marginBottom: "20px", marginTop: 20 }}>
          <input
            type="text"
            placeholder={isRealEstate ? "🔍 ابحث عن عقار بالاسم أو النوع..." : t("inv.search")}            value={searchTerm}
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

        <div className="table-container">
          <div className="table-header">
            <h3>{isRealEstate ? "قائمة العقارات" : t("inv.list")}</h3>
            <span>
              {filteredProducts.length} {isRealEstate ? "عقار" : t("inv.products")}
            </span>
          </div>
          {filteredProducts.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm
                ? t("common.noResults")
                : isRealEstate
                ? "لا توجد عقارات مسجلة حتى الآن"
                : t("inv.empty")}            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                                    <th>{isRealEstate ? "اسم العقار" : t("inv.name")}</th>
                  <th>{isRealEstate ? "نوع العقار" : t("inv.category")}</th>
                  {isClothing && (
                    <>
                      <th>النوع</th>
                      <th>المقاس</th>
                      <th>اللون</th>
                      <th>الماركة</th>
                    </>
                  )}
                  <th>{isRealEstate ? "عدد الوحدات" : t("common.quantity")}</th>                  <th>{t("inv.price")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product, index) => (
                  <tr key={product.id}>
                    <td>{index + 1}</td>
                    <td>{product.name}</td>
                    <td>
                      {isRestaurant
                        ? (menuCategories.find((c) => c.value === product.category)?.label || "-")
                        : (product.category || "-")}
                    </td>                    {isClothing && (
                      <>
                        <td>
                          {product.type === "men"
                            ? "رجالي"
                            : product.type === "women"
                              ? "حريمي"
                              : product.type === "kids"
                                ? "أطفال"
                                : product.type === "unisex"
                                  ? "يونيسكس"
                                  : "-"}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {product.size || "-"}
                        </td>
                        <td>{product.color || "-"}</td>
                        <td>{product.brand || "-"}</td>
                      </>
                    )}
                    <td>
                      <span
                        className={`badge ${
                          product.quantity < 5
                            ? "badge-expired"
                            : "badge-active"
                        }`}
                      >
                        {product.quantity}
                      </span>
                    </td>
                    <td>
                      {product.price} {t("currency")}
                    </td>
                    <td>
                      <button
                        onClick={() => openEditModal(product)}
                        className="btn-primary"
                        style={{
                          marginLeft: "8px",
                          padding: "6px 14px",
                          fontSize: "13px",
                        }}
                      >
                        <i className="fas fa-edit"></i> {t("common.edit")}
                      </button>
                      {userCanDelete && (
                        <button
                          onClick={() => deleteProduct(product.id)}
                          className="btn-danger"
                        >
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

      {showEditModal && editingProduct && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>
                <i className="fas fa-edit"></i> {isRealEstate ? "تعديل بيانات العقار" : t("inv.editTitle")}
              </h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>
                &times;
              </button>
            </div>
            <form onSubmit={updateProduct}>
                            <div style={styles.formGroup}>
                <label>{isRealEstate ? "اسم العقار" : t("inv.name")}</label>
                <input
                  type="text"
                  value={editingProduct.name}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      name: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{isRealEstate ? "نوع العقار" : t("inv.category")}</label>
                {isRestaurant ? (
                  <select
                    value={editingProduct.category || ""}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        category: e.target.value,
                      })
                    }
                    style={styles.input}
                  >
                    <option value="">تصنيف الصنف</option>
                    {menuCategories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editingProduct.category || ""}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        category: e.target.value,
                      })
                    }
                    style={styles.input}
                  />
                )}
              </div>

              {/* ✅ الحقول دي تظهر بس لصناعة الملابس */}
              {isClothing && (
                <>
                  <div style={styles.formGroup}>
                    <label>النوع</label>
                    <select
                      value={editingProduct.type || ""}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          type: e.target.value,
                        })
                      }
                      style={styles.input}
                    >
                      <option value="">اختر النوع</option>
                      {types.map((tp) => (
                        <option key={tp.value} value={tp.value}>
                          {tp.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label>المقاس</label>
                    <select
                      value={editingProduct.size || ""}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          size: e.target.value,
                        })
                      }
                      style={styles.input}
                    >
                      <option value="">اختر المقاس</option>
                      {sizeOptions.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}{" "}
                          {s.category === "shoes" ? "(حذاء)" : "(ملابس)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label>اللون</label>
                    <select
                      value={editingProduct.color || ""}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          color: e.target.value,
                        })
                      }
                      style={styles.input}
                    >
                      <option value="">اختر اللون</option>
                      {colors.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label>الماركة</label>
                    <input
                      type="text"
                      value={editingProduct.brand || ""}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          brand: e.target.value,
                        })
                      }
                      style={styles.input}
                    />
                  </div>
                </>
              )}

              <div style={styles.formGroup}>
                <label>{isRealEstate ? "عدد الوحدات" : t("common.quantity")}</label>
                <input
                  type="number"
                  value={editingProduct.quantity}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      quantity: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("inv.price")}</label>
                <input
                  type="number"
                  value={editingProduct.price}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      price: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{isRealEstate ? "وصف العقار (الموقع، المساحة، الغرف...)" : t("common.description")}</label>
                <input
                  type="text"
                  value={editingProduct.description || ""}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      description: e.target.value,
                    })
                  }
                  style={styles.input}
                />
              </div>
              <div style={{ ...styles.formGroup, display: isRealEstate ? "none" : "block" }}>                <label>تاريخ الصلاحية (اختياري)</label>
                <input
                  type="date"
                  value={editingProduct.expiryDate || ""}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      expiryDate: e.target.value,
                    })
                  }
                  style={styles.input}
                />
              </div>
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="btn-danger"
                  style={{ marginLeft: "10px" }}
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
