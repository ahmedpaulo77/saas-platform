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
import { db, storage } from "../firebase/config";

import { useAuth } from "../context/AuthContext";
import { getScopedQuery, canDelete } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import Pagination from "../components/common/Pagination";
import * as XLSX from "xlsx";

export default function Inventory() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();

  const isClothing = userIndustry === "clothing";
  const isCafe = userIndustry === "cafe";
  const isRestaurantOnly = userIndustry === "restaurant";
  const isRestaurant = (isRestaurantOnly || isCafe);
  const isFood = isRestaurant;
  const isRealEstate = userIndustry === "real_estate";
  const isTrader = userIndustry === "trader";
  const isPharmacy = userIndustry === "pharmacy";
  const isFashion = isClothing; // أزياء: ملابس/أحذية/إكسسوارات

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
        // تاجر
     // أزياء
    type: "", size: "", color: "", brand: "", model: "",
    expiryDate: "",
    barcode: "", // سوبر ماركت / صيدلية
    purchasePrice: "", // سعر الشراء (رأس المال) — صيدلية/ماركت
    minQuantity: "", // صيدلية: حد الطلب (النواقص)
    drugCategory: "", // صيدلية: التصنيف الدوائي
    activeIngredient: "", // صيدلية: المادة الفعالة (للبدائل)
    // مطعم - إضافات
    extras: [], // [{ name, price }]
    preparationNote: "", // ملاحظة تحضير افتراضية
    unit: "kg",
  });

  // إضافة extra مؤقت في النموذج
  const [tempExtra, setTempExtra] = useState({ name: "", price: "" });

  // ── صور المنتجات (Firebase Storage: products/{companyId}/...) ──
  const [newImageFile, setNewImageFile] = useState(null);
  const [newImagePreview, setNewImagePreview] = useState("");
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);

  function handleNewImageChange(e) {
    const file = e.target.files?.[0];
    setNewImageFile(file || null);
    setNewImagePreview(file ? URL.createObjectURL(file) : "");
  }
  function handleEditImageChange(e) {
    const file = e.target.files?.[0];
    setEditImageFile(file || null);
    setEditImagePreview(file ? URL.createObjectURL(file) : "");
  }
  // ضغط الصورة وتحويلها base64 (بدون Storage — تعمل على الخطة المجانية)
  function fileToBase64(file, maxSize = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const scale = Math.min(1, maxSize / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function uploadProductImage(file) {
    if (!file) return "";
    return await fileToBase64(file);
  }

  // مولّد الـ variants (أزياء): موديل + مقاسات × ألوان
  const [genModel, setGenModel] = useState("");
  const [genSizes, setGenSizes] = useState([]);
  const [genColors, setGenColors] = useState([]);
  const [genType, setGenType] = useState("");
  const [genBrand, setGenBrand] = useState("");
  const [genPrice, setGenPrice] = useState("");
  const [genQty, setGenQty] = useState("");
  const [generating, setGenerating] = useState(false);

  // الراكد: آخر بيع لكل صنف من الفواتير
  const [lastSaleByProduct, setLastSaleByProduct] = useState({});
  const [deadDays, setDeadDays] = useState(30);

  const fetchLastSales = useCallback(async () => {
    if (!isFashion || !userCompanyId) return;
    try {
      const snap = await getDocs(getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid));
      const map = {};
      snap.docs.forEach((d) => {
        const inv = d.data();
        const dt = new Date(inv.date || inv.createdAt || 0).getTime();
        (inv.products || inv.items || []).forEach((it) => {
          if (!it.productId) return;
          if (!map[it.productId] || dt > map[it.productId]) map[it.productId] = dt;
        });
      });
      setLastSaleByProduct(map);
    } catch (err) { console.error(err); }
  }, [isFashion, userRole, userCompanyId, currentUser?.uid]);

  async function generateVariants(e) {
    e.preventDefault();
    if (!genModel.trim() || genSizes.length === 0 || genColors.length === 0 || !genPrice) {
      alert(t("common.fillRequired"));
      return;
    }
    setGenerating(true);
    try {
      const now = new Date().toISOString();
      let created = 0, skipped = 0;
      for (const size of genSizes) {
        for (const color of genColors) {
          const exists = products.some(
            (p) => (p.model || "") === genModel.trim() && p.size === size && p.color === color
          );
          if (exists) { skipped++; continue; }
          await addDoc(collection(db, "inventory"), {
            name: `${genModel.trim()} - ${size} - ${color}`,
            model: genModel.trim(),
            category: "",
            quantity: parseInt(genQty) || 0,
            price: parseFloat(genPrice) || 0,
            description: "",
            type: genType || "",
            size, color,
            brand: genBrand || "",
            expiryDate: "",
            barcode: "",
            companyId: userCompanyId,
            createdBy: currentUser?.uid,
            createdAt: now,
          });
          created++;
        }
      }
      await logActivity({
        actionType: "CREATE", collectionName: "inventory", itemId: "-",
        details: `Generated ${created} variants for model: ${genModel} (skipped ${skipped})`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setGenModel(""); setGenSizes([]); setGenColors([]); setGenType(""); setGenBrand(""); setGenPrice(""); setGenQty("");
      await fetchProducts();
      alert(`تم إنشاء ${created} صنف${skipped ? ` (تخطي ${skipped} موجود)` : ""}`);
    } catch (err) {
      console.error(err);
      alert(t("inv.addFail"));
    }
    setGenerating(false);
  }

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
  // القيم الافتراضية — تُستخدم فقط لو الشركة معملتش أكوادها الخاصة في صفحة الأكواد
  const DEFAULT_SIZES = [
    { value: "XS", label: "XS", category: "clothing" },
    { value: "S", label: "S", category: "clothing" },
    { value: "M", label: "M", category: "clothing" },
    { value: "L", label: "L", category: "clothing" },
    { value: "XL", label: "XL", category: "clothing" },
    { value: "XXL", label: "XXL", category: "clothing" },
    { value: "XXXL", label: "XXXL", category: "clothing" },
    ...Array.from({ length: 29 }, (_, i) => ({ value: String(22 + i), label: String(22 + i), category: "shoes" })),
  ];
  const DEFAULT_COLORS = [
    { value: "أسود", label: "أسود", hex: "#111827" }, { value: "أبيض", label: "أبيض", hex: "#f8fafc" },
    { value: "أحمر", label: "أحمر", hex: "#dc2626" }, { value: "أزرق", label: "أزرق", hex: "#2563eb" },
    { value: "أخضر", label: "أخضر", hex: "#16a34a" }, { value: "أصفر", label: "أصفر", hex: "#eab308" },
    { value: "رمادي", label: "رمادي", hex: "#94a3b8" }, { value: "بني", label: "بني", hex: "#92400e" },
    { value: "برتقالي", label: "برتقالي", hex: "#ea580c" }, { value: "وردي", label: "وردي", hex: "#ec4899" },
    { value: "بنفسجي", label: "بنفسجي", hex: "#7c3aed" }, { value: "بيج", label: "بيج", hex: "#d6c39a" },
    { value: "كحلي", label: "كحلي", hex: "#1e3a8a" }, { value: "زيتي", label: "زيتي", hex: "#3f6212" },
  ];
  // ── أكواد الشركة الخاصة: صفحة الأكواد هي المصدر الأساسي ──
  const [customSizes, setCustomSizes] = useState([]);
  const [customColors, setCustomColors] = useState([]);
  const fetchVariantCodes = useCallback(async () => {
    if (!isClothing || !userCompanyId) { setCustomSizes([]); setCustomColors([]); return; }
    try {
      const snap = await getDocs(
        getScopedQuery("variant_codes", userRole, userCompanyId, currentUser?.uid)
      );
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCustomSizes(all.filter((v) => v.kind === "size" && v.name).map((v) => ({ value: v.name, label: v.code ? `${v.name} (${v.code})` : v.name, category: "custom", code: v.code || "" })));
      setCustomColors(all.filter((v) => v.kind === "color" && v.name).map((v) => ({ value: v.name, label: v.code ? `${v.name} (${v.code})` : v.name, hex: "#64748b", code: v.code || "" })));
    } catch (err) {
      console.error("Error fetching variant codes:", err);
    }
  }, [isClothing, userRole, userCompanyId, currentUser?.uid]);
  // لو الشركة عاملة أكوادها → نستخدمها، غير كده الافتراضية
  const sizeOptions = customSizes.length > 0 ? customSizes : DEFAULT_SIZES;
  const colors = customColors.length > 0 ? customColors : DEFAULT_COLORS;
  // نقطة لون رجالي نظيفة بدل الإيموجي
  const colorDot = (hex) => (
    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: hex, border: "1px solid #cbd5e1", flexShrink: 0 }} />
  );

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
    fetchLastSales();
    fetchVariantCodes();
  }, [fetchProducts, fetchMenuCategories, fetchLastSales, fetchVariantCodes]);

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
    setUploading(true);
    try {
      let imageUrl = "";
      if (newImageFile) imageUrl = await uploadProductImage(newImageFile);
      const docRef = await addDoc(collection(db, "inventory"), {
        ...newProduct,
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        quantity: isTrader ? parseFloat(newProduct.quantity) : parseInt(newProduct.quantity),
        price: parseFloat(newProduct.price),
                 unit: isTrader ? newProduct.unit || "piece" : "",
        type: isClothing ? newProduct.type || "" : "",
        size: isClothing ? newProduct.size || "" : "",
        color: isClothing ? newProduct.color || "" : "",
        brand: isClothing ? newProduct.brand || "" : "",
        model: isClothing ? (newProduct.model || "").trim() : "",
        expiryDate: newProduct.expiryDate || "",
        barcode: (newProduct.barcode || "").trim(),
        purchasePrice: isMarket ? (parseFloat(newProduct.purchasePrice) || 0) : 0,
        minQuantity: isPharmacy ? (parseFloat(newProduct.minQuantity) || 0) : 0,
        drugCategory: isPharmacy ? (newProduct.drugCategory || "") : "",
        activeIngredient: isPharmacy ? (newProduct.activeIngredient || "").trim() : "",
        extras: isRestaurantOnly ? (newProduct.extras || []) : [],
        preparationNote: isRestaurant ? (newProduct.preparationNote || "") : "",
        imageUrl,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE", collectionName: "inventory", itemId: docRef.id,
        details: `Created product: ${newProduct.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNewProduct({ name: "", category: "", quantity: "", price: "", description: "", type: "", size: "", color: "", brand: "", model: "", expiryDate: "", barcode: "", purchasePrice: "", minQuantity: "", drugCategory: "", activeIngredient: "", extras: [], preparationNote: "", unit: "kg" });
      setTempExtra({ name: "", price: "" });
      setNewImageFile(null);
      setNewImagePreview("");
      await fetchProducts();
      alert(t("inv.addOk"));
    } catch (error) {
      console.error("Error adding product:", error);
      alert(t("inv.addFail"));
    } finally {
      setUploading(false);
    }
  }

  // ── Update ──
  async function updateProduct(e) {
    e.preventDefault();
    if (!editingProduct.name || !editingProduct.quantity || !editingProduct.price) {
      alert(t("common.fillRequired")); return;
    }
    setUploading(true);
    try {
      let imageUrl = editingProduct.imageUrl || "";
      if (editImageFile) imageUrl = await uploadProductImage(editImageFile);
      await updateDoc(doc(db, "inventory", editingProduct.id), {
        name: editingProduct.name,
        category: editingProduct.category || "",
        quantity: isTrader ? parseFloat(editingProduct.quantity) : parseInt(editingProduct.quantity),
        price: parseFloat(editingProduct.price),
        unit: isTrader ? (editingProduct.unit || "kg") : "",
        description: editingProduct.description || "",
         type: isClothing ? editingProduct.type || "" : "",
        size: isClothing ? editingProduct.size || "" : "",
        color: isClothing ? editingProduct.color || "" : "",
        brand: isClothing ? editingProduct.brand || "" : "",
        model: isClothing ? (editingProduct.model || "").trim() : "",
        expiryDate: editingProduct.expiryDate || "",
        barcode: (editingProduct.barcode || "").trim(),
        purchasePrice: isMarket ? (parseFloat(editingProduct.purchasePrice) || 0) : 0,
        minQuantity: isPharmacy ? (parseFloat(editingProduct.minQuantity) || 0) : 0,
        drugCategory: isPharmacy ? (editingProduct.drugCategory || "") : "",
        activeIngredient: isPharmacy ? (editingProduct.activeIngredient || "").trim() : "",
        extras: isRestaurantOnly ? (editingProduct.extras || []) : [],
        preparationNote: isRestaurant ? (editingProduct.preparationNote || "") : "",
        imageUrl,
      });
      await logActivity({
        actionType: "UPDATE", collectionName: "inventory", itemId: editingProduct.id,
        details: `Updated product: ${editingProduct.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchProducts();
      setShowEditModal(false);
      setEditingProduct(null);
      setEditImageFile(null);
      setEditImagePreview("");
      alert(t("inv.updOk"));
    } catch (error) {
      console.error("Error updating product:", error);
      alert(t("inv.updFail"));
    } finally {
      setUploading(false);
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
  const [filterModel, setFilterModel] = useState("all");
  const modelOptions = [...new Set(products.map((p) => (p.model || "").trim()).filter(Boolean))].sort();
  const filteredProducts = products.filter((product) => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      product.name.toLowerCase().includes(term) ||
      (product.category && product.category.toLowerCase().includes(term)) ||
      (product.type && product.type.toLowerCase().includes(term)) ||
      (product.brand && product.brand.toLowerCase().includes(term)) ||
      (product.size && product.size.toLowerCase().includes(term)) ||
      (product.model && product.model.toLowerCase().includes(term)) ||
      (product.barcode && product.barcode.toLowerCase().includes(term)) ||
      (product.activeIngredient && product.activeIngredient.toLowerCase().includes(term));
    const matchCat = filterCategory === "all" || product.category === filterCategory;
    const matchModel = filterModel === "all" || (product.model || "") === filterModel;
    return matchSearch && matchCat && matchModel;
  });

  // ── الجرد: تسوية الكمية الفعلية ──
  const [countCode, setCountCode] = useState("");
  const [countQty, setCountQty] = useState("");
  const [counting, setCounting] = useState(false);
  const isMarket = userIndustry === "super_market" || userIndustry === "pharmacy";

  async function handleStockCount(e) {
    e.preventDefault();
    const code = countCode.trim().toLowerCase();
    if (!code || countQty === "") return;
    const found = products.find(
      (p) => (p.barcode || "").toLowerCase() === code || p.id === countCode.trim() || p.name.toLowerCase() === code
    );
    if (!found) { alert("الصنف مش موجود — اتأكد من الباركود أو الاسم"); return; }
    const actual = parseFloat(countQty);
    if (isNaN(actual) || actual < 0) { alert("اكتب كمية فعلية صحيحة"); return; }
    const oldQty = parseFloat(found.quantity) || 0;
    const diff = actual - oldQty;
    if (diff === 0) { alert("مفيش فرق — الكمية مطابقة"); return; }
    setCounting(true);
    try {
      await updateDoc(doc(db, "inventory", found.id), { quantity: actual });
      await logActivity({
        actionType: "UPDATE", collectionName: "inventory", itemId: found.id,
        details: `Stock count: ${found.name} ${oldQty} → ${actual} (diff ${diff > 0 ? "+" : ""}${diff})`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setCountCode("");
      setCountQty("");
      await fetchProducts();
      alert(`تمت التسوية: ${found.name}\nالسيستم: ${oldQty} → الفعلي: ${actual} (الفرق ${diff > 0 ? "+" : ""}${diff})`);
    } catch (err) {
      console.error(err);
      alert(t("inv.updFail"));
    }
    setCounting(false);
  }

  const getCategoryLabel = (catValue) => {
    const found = menuCategories.find((c) => c.id === catValue || c.name === catValue);
    if (found) return `${found.icon || ""} ${found.name}`;
    return catValue || "—";
  };

  // ── فتح بحث DrugEye (دليل الأدوية) مع نسخ الاسم للحصق ──
  async function openDrugEye(productName) {
    try {
      await navigator.clipboard.writeText(productName || "");
    } catch { /* تجاهل — الفتح هو المهم */ }
    window.open("https://drugeye.pharorg.com/drugeyeapp/android-search/drugeye-android-live-go.aspx", "_blank");
  }

  // ── البدائل (صيدلية): نفس المادة الفعالة من المخزون ──
  const [altProduct, setAltProduct] = useState(null);
  function getAlternatives(product) {
    const key = (product.activeIngredient || "").trim().toLowerCase();
    if (!key) return [];
    return products.filter(
      (p) => p.id !== product.id && (p.activeIngredient || "").trim().toLowerCase() === key
    );
  }

  // ── استيراد أسعار Excel (ماركت/صيدلية): مطابقة بالباركود ──
  const [importing, setImporting] = useState(false);

  function downloadPriceTemplate() {
    const rows = products.map((p) => ({
      "الباركود": p.barcode || "",
      "الاسم": p.name || "",
      "سعر البيع": p.price || 0,
      "سعر الشراء": p.purchasePrice || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ "الباركود": "622200200001", "الاسم": "مثال", "سعر البيع": 0, "سعر الشراء": 0 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأسعار");
    XLSX.writeFile(wb, "price-template.xlsx");
  }

  async function handlePriceImport(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const byBarcode = {};
      products.forEach((p) => { if (p.barcode) byBarcode[String(p.barcode).trim()] = p; });
      let updated = 0;
      const notFound = [];
      for (const row of rows) {
        const code = String(row["الباركود"] ?? row["barcode"] ?? "").trim();
        if (!code) continue;
        const prod = byBarcode[code];
        const sell = parseFloat(row["سعر البيع"] ?? row["price"]);
        const cost = parseFloat(row["سعر الشراء"] ?? row["purchasePrice"]);
        if (!prod) { notFound.push(code); continue; }
        const patch = {};
        if (!isNaN(sell) && sell >= 0) patch.price = sell;
        if (!isNaN(cost) && cost >= 0) patch.purchasePrice = cost;
        if (Object.keys(patch).length === 0) continue;
        await updateDoc(doc(db, "inventory", prod.id), patch);
        updated++;
      }
      await logActivity({
        actionType: "UPDATE", collectionName: "inventory", itemId: "-",
        details: `Price import: ${updated} updated, ${notFound.length} not found`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchProducts();
      alert(`تم تحديث ${updated} صنف${notFound.length ? `\nباركود غير موجود (${notFound.length}): ${notFound.slice(0, 10).join("، ")}${notFound.length > 10 ? "..." : ""}` : ""}`);
    } catch (err) {
      console.error(err);
      alert("تعذر قراءة الملف — اتأكد أنه Excel بعناوين: الباركود، سعر البيع، سعر الشراء");
    }
    setImporting(false);
  }
  function handlePrintLabels() {
    const withCode = filteredProducts.filter((p) => p.barcode);
    if (withCode.length === 0) { alert("مفيش أصناف ليها باركود في العرض الحالي"); return; }
    const labels = withCode.map((p) => `
      <div style="border:1px dashed #999;border-radius:6px;padding:8px;text-align:center;width:180px;">
        <div style="font-weight:bold;font-size:12px;">${p.name}</div>
        <div style="font-family:monospace;font-size:14px;letter-spacing:2px;margin:6px 0;">*${p.barcode}*</div>
        <div style="font-size:11px;">${p.barcode}</div>
        <div style="font-weight:bold;font-size:13px;margin-top:4px;">${p.price} ج.م</div>
      </div>`).join("");
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) { alert("السماح بالـ popups مطلوب للطباعة"); return; }
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/><style>body{font-family:Cairo,Arial;display:flex;flex-wrap:wrap;gap:10px;padding:16px;}@media print{body{padding:0;}}</style></head><body>${labels}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

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
          {isRestaurant ? (isCafe ? "☕ منيو الكافيه" : "🍽️ منيو المطعم") : userIndustry === "real_estate" ? "🏠" : "📦"}{" "}
          {!isRestaurant && t(userIndustry === "real_estate" ? "inv.title.real_estate" : "inv.title")}
        </h2>

        {/* ── Add Form ── */}
        <form onSubmit={addProduct} className="form-container">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              type="text"
              placeholder={isRealEstate ? "اسم العقار / الوحدة" : isRestaurant ? (isCafe ? "اسم الصنف (مثال: كابتشينو / لاتيه)" : "اسم الصنف (مثال: فراخ كرسبي)") : t("inv.phName")}
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
                  <option value="">{isCafe ? "— اختر قسم منيو الكافيه —" : "— اختر قسم منيو المطعم —"}</option>
                  {menuCategories.length === 0 && (
                    <option disabled>{isCafe ? "لا توجد أقسام — أضفها من صفحة أقسام منيو الكافيه" : "لا توجد أقسام — أضفها من صفحة أقسام منيو المطعم"}</option>
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

                {isRestaurantOnly && ( <>
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
                </>)}
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

            {isTrader && (
              <select
                value={newProduct.unit || "kg"}
                onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                style={{ padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}
              >
                <option value="kg">{t("trader.unit.kg")}</option>
                <option value="piece">{t("trader.unit.piece")}</option>
                <option value="carton">{t("trader.unit.carton")}</option>
              </select>
            )}

            <input
              type="number"
              min="0"
              step={isTrader ? "0.001" : "1"}
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
            {/* سعر الشراء — ماركت/صيدلية (لرأس المال) */}
            {isMarket && (
              <input
                type="number" step="0.01" min="0"
                placeholder="سعر الشراء (ج.م) — لحساب رأس المال"
                value={newProduct.purchasePrice}
                onChange={(e) => setNewProduct({ ...newProduct, purchasePrice: e.target.value })}
              />
            )}
            {/* الباركود — ماركت/صيدلية فقط */}
            {isMarket && (
              <input
                type="text"
                placeholder="الباركود (اختياري — للبيع بالسكانر)"
                value={newProduct.barcode}
                onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
              />
            )}
            {/* حقول الصيدلية: التصنيف + حد الطلب + المادة الفعالة */}
            {isPharmacy && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
                  <input
                    type="text"
                    placeholder="التصنيف الدوائي (مثال: مسكنات، مضاد حيوي...)"
                    value={newProduct.drugCategory}
                    onChange={(e) => setNewProduct({ ...newProduct, drugCategory: e.target.value })}
                  />
                  <input
                    type="number" min="0" step="1"
                    placeholder="حد الطلب"
                    value={newProduct.minQuantity}
                    onChange={(e) => setNewProduct({ ...newProduct, minQuantity: e.target.value })}
                  />
                </div>
                <input
                  type="text"
                  placeholder="المادة الفعالة (مثال: باراسيتامول — للبدائل)"
                  value={newProduct.activeIngredient}
                  onChange={(e) => setNewProduct({ ...newProduct, activeIngredient: e.target.value })}
                />
              </>
            )}
            <input
              type="text"
              placeholder={isRealEstate ? "وصف العقار..." : isRestaurant ? "وصف الصنف (اختياري)" : t("inv.phDesc")}
              value={newProduct.description}
              onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
            />
            {/* حقول الملابس */}
            {isClothing && (
              <>
                <input type="text" placeholder="اسم الموديل (مثال: تيشرت قطن كلاسيك)" value={newProduct.model || ""}
                  onChange={(e) => setNewProduct({ ...newProduct, model: e.target.value })} />
                <select value={newProduct.type} onChange={(e) => setNewProduct({ ...newProduct, type: e.target.value })}
                  style={{ padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}>
                  <option value="">النوع</option>
                  {types.map((tp) => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
                </select>
                <select value={newProduct.size} onChange={(e) => setNewProduct({ ...newProduct, size: e.target.value })}
                  style={{ padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}>
                  <option value="">المقاس</option>
                  {sizeOptions.map((s) => <option key={s.value} value={s.value}>{s.label} {s.category === "shoes" ? "(حذاء)" : s.category === "clothing" ? "(ملابس)" : ""}</option>)}
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

            {/* صورة المنتج */}
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                📷 صورة المنتج (اختياري)
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {(newImagePreview) ? (
                  <img src={newImagePreview} alt="preview" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "2px solid #e2e8f0" }} />
                ) : (
                  <span style={{ width: 56, height: 56, borderRadius: 10, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📦</span>
                )}
                <input type="file" accept="image/*" onChange={handleNewImageChange} />
              </div>
            </div>

            {isMarket && (
              <input type="date" placeholder={t("inv.phExpiry")} value={newProduct.expiryDate}
                onChange={(e) => setNewProduct({ ...newProduct, expiryDate: e.target.value })} />
            )}
          </div>
          <button type="submit" className="btn-primary" style={{ marginTop: 12 }} disabled={uploading}>
            <i className="fas fa-plus"></i>{" "}
            {uploading ? "جاري الرفع..." : (isRealEstate ? "إضافة عقار" : isRestaurant ? (isCafe ? "إضافة صنف لمنيو الكافيه" : "إضافة صنف لمنيو المطعم") : t("inv.add"))}
          </button>
        </form>

        {/* ── مولّد الموديلات (أزياء) ── */}
        {isFashion && (
          <div className="form-card" style={{ border: "2px solid #ec489955", marginTop: 20 }}>
            <h3>
              <i className="fas fa-shirt" style={{ color: "#ec4899" }}></i>
              👔 توليد موديل — مقاسات × ألوان بضغطة واحدة
            </h3>
            <form onSubmit={generateVariants}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>اسم الموديل *</label>
                  <input type="text" placeholder="مثال: تيشرت قطن كلاسيك"
                    value={genModel} onChange={(e) => setGenModel(e.target.value)} required
                    style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>النوع</label>
                    <select value={genType} onChange={(e) => setGenType(e.target.value)}
                      style={{ width: "100%", padding: "10px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, background: "white" }}>
                      <option value="">—</option>
                      {types.map((tp) => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>السعر *</label>
                    <input type="number" min="0" placeholder="0" value={genPrice} onChange={(e) => setGenPrice(e.target.value)} required
                      style={{ width: "100%", padding: "10px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>رصيد مبدئي</label>
                    <input type="number" min="0" step="1" placeholder="0" value={genQty} onChange={(e) => setGenQty(e.target.value)}
                      style={{ width: "100%", padding: "10px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>المقاسات * ({genSizes.length})</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sizeOptions.map((s) => {
                    const on = genSizes.includes(s.value);
                    return (
                      <button key={s.value + s.category} type="button"
                        onClick={() => setGenSizes(on ? genSizes.filter((v) => v !== s.value) : [...genSizes, s.value])}
                        style={{ padding: "4px 12px", fontSize: 12, fontWeight: 700, borderRadius: 20, cursor: "pointer", border: `2px solid ${on ? "#ec4899" : "#e2e8f0"}`, background: on ? "#fdf2f8" : "white", color: on ? "#be185d" : "#64748b" }}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>الألوان * ({genColors.length})</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {colors.map((c) => {
                    const on = genColors.includes(c.value);
                    return (
                      <button key={c.value} type="button"
                        onClick={() => setGenColors(on ? genColors.filter((v) => v !== c.value) : [...genColors, c.value])}
                        style={{ padding: "4px 12px", fontSize: 12, fontWeight: 700, borderRadius: 20, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, border: `2px solid ${on ? "#1e3a8a" : "#e2e8f0"}`, background: on ? "#eff6ff" : "white", color: on ? "#1e3a8a" : "#64748b" }}>
                        {colorDot(c.hex)}{c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="text" placeholder="الماركة (اختياري)" value={genBrand} onChange={(e) => setGenBrand(e.target.value)}
                  style={{ flex: 1, padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14 }} />
                <button type="submit" className="btn-primary" disabled={generating}>
                  <i className="fas fa-magic"></i> {generating ? "جاري التوليد..." : `توليد ${genSizes.length * genColors.length} صنف`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── الراكد (أزياء) ── */}
        {isFashion && (
          (() => {
            const cutoff = Date.now() - deadDays * 24 * 60 * 60 * 1000;
            const dead = products.filter((p) => {
              if ((parseFloat(p.quantity) || 0) <= 0) return false;
              const last = lastSaleByProduct[p.id];
              return !last || last < cutoff;
            });
            if (dead.length === 0) return null;
            return (
              <div className="form-card" style={{ border: "2px solid #f59e0b55", marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}><i className="fas fa-box-open" style={{ color: "#d97706" }}></i> 🐢 الراكد ({dead.length})</h3>
                  <select value={deadDays} onChange={(e) => setDeadDays(parseInt(e.target.value))}
                    style={{ marginRight: "auto", padding: "4px 8px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}>
                    <option value={14}>بدون بيع 14 يوم</option>
                    <option value={30}>بدون بيع 30 يوم</option>
                    <option value={60}>بدون بيع 60 يوم</option>
                    <option value={90}>بدون بيع 90 يوم</option>
                  </select>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>أصناف برصيد ومتباعتش في الفترة — رشحها لخصم أو تصفية.</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {dead.slice(0, 24).map((p) => {
                    const last = lastSaleByProduct[p.id];
                    return (
                      <span key={p.id} title={last ? `آخر بيع: ${new Date(last).toLocaleDateString("ar-EG")}` : "متباعش خالص"} style={{ background: "#fffbeb", color: "#92400e", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                        {p.model || p.name} {p.size ? `(${p.size}${p.color ? "/" + p.color : ""})` : ""} ×{p.quantity}
                      </span>
                    );
                  })}
                  {dead.length > 24 && <span style={{ fontSize: 12, color: "#94a3b8" }}>+{dead.length - 24}</span>}
                </div>
              </div>
            );
          })()
        )}

        {/* ── الجرد ── */}
        {isMarket && (
          <div className="form-card" style={{ border: "2px solid #10b98155", marginTop: 20 }}>
            <h3>
              <i className="fas fa-clipboard-check" style={{ color: "#10b981" }}></i>
              📋 الجرد — تسوية الكمية الفعلية
            </h3>
            <form onSubmit={handleStockCount}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 160px auto", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                    الباركود أو اسم الصنف
                  </label>
                  <input type="text" placeholder="اسكان أو اكتب الباركود..."
                    value={countCode} onChange={(e) => setCountCode(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                    الكمية الفعلية *
                  </label>
                  <input type="number" min="0" step="1" placeholder="0"
                    value={countQty} onChange={(e) => setCountQty(e.target.value)} required
                    style={{ width: "100%", padding: "10px 14px", border: "2px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }} />
                </div>
                <button type="submit" className="btn-primary" disabled={counting}>
                  <i className="fas fa-check"></i> {counting ? "جاري..." : "تسوية"}
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                بتكتب الفعلي اللي عديته على الرف، والسيستم يحسب الفرق ويسجله في سجل النشاطات.
              </div>
            </form>
          </div>
        )}

        {/* ── النواقص (صيدلية) ── */}
        {isPharmacy && (
          (() => {
            const shortages = products.filter((p) => {
              const q = parseFloat(p.quantity) || 0;
              const min = parseFloat(p.minQuantity) || 0;
              return min > 0 ? q <= min : q <= 0;
            });
            if (shortages.length === 0) return null;
            return (
              <div className="form-card" style={{ border: "2px solid #ef444455", marginBottom: 20 }}>
                <h3>
                  <i className="fas fa-exclamation-triangle" style={{ color: "#ef4444" }}></i>
                  ⚠️ النواقص ({shortages.length})
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {shortages.slice(0, 20).map((p) => (
                    <span key={p.id} style={{ background: "#fef2f2", color: "#dc2626", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                      {p.name} ({p.quantity || 0})
                    </span>
                  ))}
                  {shortages.length > 20 && (
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>+{shortages.length - 20} أخرى</span>
                  )}
                </div>
              </div>
            );
          })()
        )}

        {/* ── رأس مال البضاعة (ماركت/صيدلية) ── */}
        {isMarket && (
          (() => {
            const capital = products.reduce((s, p) => s + (parseFloat(p.quantity) || 0) * (parseFloat(p.purchasePrice) || 0), 0);
            const retail = products.reduce((s, p) => s + (parseFloat(p.quantity) || 0) * (parseFloat(p.price) || 0), 0);
            const noCost = products.filter((p) => !(parseFloat(p.purchasePrice) > 0)).length;
            return (
              <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", marginBottom: 20 }}>
                <div className="stat-card indigo">
                  <div className="stat-icon"><i className="fas fa-vault"></i></div>
                  <div className="stat-value" style={{ fontSize: 17 }}>{capital.toLocaleString()}</div>
                  <div className="stat-label">رأس المال (بسعر الشراء) {t("currency")}</div>
                </div>
                <div className="stat-card green">
                  <div className="stat-icon"><i className="fas fa-tag"></i></div>
                  <div className="stat-value" style={{ fontSize: 17 }}>{retail.toLocaleString()}</div>
                  <div className="stat-label">القيمة بسعر البيع {t("currency")}</div>
                </div>
                <div className="stat-card amber">
                  <div className="stat-icon"><i className="fas fa-chart-line"></i></div>
                  <div className="stat-value" style={{ fontSize: 17, color: retail - capital >= 0 ? "#16a34a" : "#dc2626" }}>{(retail - capital).toLocaleString()}</div>
                  <div className="stat-label">الهامش المتوقع</div>
                </div>
                {noCost > 0 && (
                  <div className="stat-card red">
                    <div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div>
                    <div className="stat-value">{noCost}</div>
                    <div className="stat-label">أصناف بلا سعر شراء</div>
                  </div>
                )}
              </div>
            );
          })()
        )}

        {/* ── Filters ── */}
        <div style={{ marginBottom: "20px", marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder={isRealEstate ? "🔍 ابحث عن عقار..." : isRestaurant ? (isCafe ? "🔍 ابحث في منيو الكافيه..." : "🔍 ابحث في منيو المطعم...") : t("inv.search")}
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
          {isFashion && modelOptions.length > 0 && (
            <select
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              style={{ padding: "12px 16px", border: "2px solid #e2e8f0", borderRadius: "10px", fontSize: "14px", background: "white" }}
            >
              <option value="all">كل الموديلات</option>
              {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>

        {/* ── Table ── */}
        <div className="table-container">
          <div className="table-header">
            <h3>{isRealEstate ? "قائمة العقارات" : isRestaurant ? (isCafe ? "أصناف منيو الكافيه" : "أصناف منيو المطعم") : t("inv.list")}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span>{filteredProducts.length} {isRealEstate ? "عقار" : isRestaurant ? "صنف" : t("inv.products")}</span>
              {isMarket && (
                <button type="button" onClick={handlePrintLabels} className="btn-secondary btn-sm">
                  <i className="fas fa-print"></i> طباعة ملصقات
                </button>
              )}
              {isMarket && (
                <>
                  <button type="button" onClick={downloadPriceTemplate} className="btn-secondary btn-sm" title="ملف Excel بأصنافك وأسعارها الحالية — عدّل الأسعار وارفعه تاني">
                    <i className="fas fa-download"></i> نموذج الأسعار
                  </button>
                  <label className="btn-secondary btn-sm" style={{ cursor: importing ? "wait" : "pointer", opacity: importing ? 0.6 : 1 }} title="ارفع شيت الأسعار بعد تعديله (مطابقة بالباركود)">
                    <i className="fas fa-upload"></i> {importing ? "جاري..." : "استيراد أسعار"}
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handlePriceImport} disabled={importing} style={{ display: "none" }} />
                  </label>
                </>
              )}
            </div>
          </div>
          {filteredProducts.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm || filterCategory !== "all" ? t("common.noResults") : isRealEstate ? "لا توجد عقارات" : isRestaurant ? (isCafe ? "لا توجد أصناف في منيو الكافيه بعد" : "لا توجد أصناف في منيو المطعم بعد") : t("inv.empty")}
            </p>
          ) : (
            <Pagination
              data={filteredProducts}
              pageSize={20}
              resetKey={`${searchTerm}-${filterCategory}-${filterModel}`}
              empty={<p style={{ textAlign: "center", padding: "20px", color: "#999" }}>{t("common.noResults")}</p>}
              render={(pageItems, total, start) => (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{isRealEstate ? "اسم العقار" : isRestaurant ? "الصنف" : t("inv.name")}</th>
                  <th>{isRealEstate ? "نوع العقار" : isRestaurant ? "القسم" : t("inv.category")}</th>
                  {isClothing && <><th>الموديل</th><th>النوع</th><th>المقاس</th><th>اللون</th><th>الماركة</th></>}
                  {isRestaurantOnly && <th>الإضافات</th>}
                  {isPharmacy && <th>التصنيف</th>}
                  {isMarket && <th>الباركود</th>}
                  {isTrader && <th>{t("trader.unit")}</th>}
                  <th>{isRealEstate ? "عدد الوحدات" : t("common.quantity")}</th>
                  <th>{t("inv.price")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((product, index) => (
                  <tr key={product.id}>
                    <td>{start + index + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                        ) : (
                          <span style={{ width: 40, height: 40, borderRadius: 8, background: "#f1f5f9", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📦</span>
                        )}
                        <span>{product.name}</span>
                        {isPharmacy && (
                          <button type="button" onClick={() => openDrugEye(product.name)} title="بحث في دليل DrugEye (الاسم بيتنسخ تلقائي)"
                            style={{ background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe", borderRadius: 8, padding: "2px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                            🔍 DrugEye
                          </button>
                        )}
                        {isPharmacy && (product.activeIngredient || "").trim() && (
                          <button type="button" onClick={() => setAltProduct(product)} title={`البدائل بنفس المادة: ${product.activeIngredient}`}
                            style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac", borderRadius: 8, padding: "2px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                            🔄 البدائل ({getAlternatives(product).length})
                          </button>
                        )}
                      </div>
                      {isPharmacy && product.activeIngredient && (
                        <div style={{ fontSize: 11, color: "#7c3aed" }}>المادة: {product.activeIngredient}</div>
                      )}
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
                        <td style={{ fontWeight: 700, color: "#be185d" }}>{product.model || "—"}</td>
                        <td>{product.type === "men" ? "رجالي" : product.type === "women" ? "حريمي" : product.type === "kids" ? "أطفال" : product.type === "unisex" ? "يونيسكس" : "—"}</td>
                        <td style={{ fontWeight: 600 }}>{product.size || "—"}</td>
                        <td>{product.color || "—"}</td>
                        <td>{product.brand || "—"}</td>
                      </>
                    )}
                    {isTrader && (
                      <td>{t(`trader.unit.${product.unit || "piece"}`)}</td>
                    )}
                    {isPharmacy && (
                      <td style={{ fontSize: 12, color: "#64748b" }}>{product.drugCategory || "—"}</td>
                    )}
                    {isMarket && (
                      <td style={{ fontFamily: "monospace", fontSize: 12, direction: "ltr" }}>{product.barcode || "—"}</td>
                    )}
                    {isRestaurantOnly && (
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
                    <td>{product.price} {t("currency")}
                      {isMarket && (parseFloat(product.purchasePrice) > 0) && (
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>شراء: {product.purchasePrice}</div>
                      )}
                    </td>
                    <td>
                      <button onClick={() => { setEditingProduct({ ...product }); setEditImageFile(null); setEditImagePreview(""); setShowEditModal(true); }}
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
            />
           )}
         </div>
      </div>

      {/* ── مودال البدائل (صيدلية) ── */}
      {altProduct && (
        <div style={styles.modalOverlay} onClick={() => setAltProduct(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-exchange-alt" style={{ color: "#15803d" }}></i> بدائل {altProduct.name}</h3>
              <button onClick={() => setAltProduct(null)} style={styles.closeBtn}>&times;</button>
            </div>
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>
              المادة الفعالة: <strong>{altProduct.activeIngredient}</strong>
            </div>
            {getAlternatives(altProduct).length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 16 }}>مفيش بدائل بنفس المادة في مخزونك — سجّل المادة الفعالة للأصناف عشان تظهر هنا</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {getAlternatives(altProduct).map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
                    <strong>{p.name}</strong>
                    <span style={{ color: "#64748b" }}>{p.drugCategory || ""}</span>
                    <span style={{ marginRight: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      <span className={`badge ${parseFloat(p.quantity) < 5 ? "badge-expired" : "badge-active"}`}>متاح: {p.quantity}</span>
                      <strong style={{ color: "#16a34a" }}>{p.price} {t("currency")}</strong>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {showEditModal && editingProduct && (
        <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-edit"></i> {isRealEstate ? "تعديل بيانات العقار" : isRestaurant ? (isCafe ? "تعديل صنف منيو الكافيه" : "تعديل صنف منيو المطعم") : t("inv.editTitle")}</h3>
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
                  <label>{isRestaurant ? (isCafe ? "قسم منيو الكافيه" : "قسم منيو المطعم") : isRealEstate ? "نوع العقار" : t("inv.category")}</label>
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
                {/* الباركود */}
                {isMarket && (
                  <div style={styles.formGroup}>
                    <label>الباركود</label>
                    <input type="text" value={editingProduct.barcode || ""} style={{ ...styles.input, fontFamily: "monospace", direction: "ltr" }}
                      placeholder="مثال: 6221001001234"
                      onChange={(e) => setEditingProduct({ ...editingProduct, barcode: e.target.value })} />
                  </div>
                )}
                {/* سعر الشراء */}
                {isMarket && (
                  <div style={styles.formGroup}>
                    <label>سعر الشراء ({t("currency")})</label>
                    <input type="number" min="0" step="0.01" value={editingProduct.purchasePrice || ""} style={styles.input}
                      onChange={(e) => setEditingProduct({ ...editingProduct, purchasePrice: e.target.value })} />
                  </div>
                )}
                {/* حقول الصيدلية */}
                {isPharmacy && (
                  <>
                    <div style={styles.formGroup}>
                      <label>التصنيف الدوائي</label>
                      <input type="text" value={editingProduct.drugCategory || ""} style={styles.input}
                        onChange={(e) => setEditingProduct({ ...editingProduct, drugCategory: e.target.value })} />
                    </div>
                    <div style={styles.formGroup}>
                      <label>المادة الفعالة (للبدائل)</label>
                      <input type="text" value={editingProduct.activeIngredient || ""} style={styles.input}
                        placeholder="مثال: باراسيتامول"
                        onChange={(e) => setEditingProduct({ ...editingProduct, activeIngredient: e.target.value })} />
                    </div>
                    <div style={styles.formGroup}>
                      <label>حد الطلب (تنبيه النواقص)</label>
                      <input type="number" min="0" step="1" value={editingProduct.minQuantity || ""} style={styles.input}
                        onChange={(e) => setEditingProduct({ ...editingProduct, minQuantity: e.target.value })} />
                    </div>
                  </>
                )}
                {isTrader && (
                  <div style={styles.formGroup}>
                    <label>{t("trader.unit")}</label>
                    <select value={editingProduct.unit || "piece"} style={styles.input}
                      onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}>
                      <option value="piece">{t("trader.unit.piece")}</option>
                      <option value="kg">{t("trader.unit.kg")}</option>
                      <option value="carton">{t("trader.unit.carton")}</option>
                    </select>
                  </div>
                )}
                {/* ملابس */}
                {isClothing && (
                  <>
                    <div style={styles.formGroup}>
                      <label>اسم الموديل</label>
                      <input type="text" value={editingProduct.model || ""} style={styles.input}
                        onChange={(e) => setEditingProduct({ ...editingProduct, model: e.target.value })} />
                    </div>
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
                        {sizeOptions.map((s) => <option key={s.value} value={s.value}>{s.label} {s.category === "shoes" ? "(حذاء)" : s.category === "clothing" ? "(ملابس)" : ""}</option>)}
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
                  <label>📷 صورة المنتج</label>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {(editImagePreview || editingProduct.imageUrl) ? (
                      <img src={editImagePreview || editingProduct.imageUrl} alt="preview" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "2px solid #e2e8f0" }} />
                    ) : (
                      <span style={{ width: 56, height: 56, borderRadius: 10, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📦</span>
                    )}
                    <input type="file" accept="image/*" onChange={handleEditImageChange} />
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label>{isRealEstate ? "عدد الوحدات" : t("common.quantity")}</label>
                  <input type="number" min="0" step={isTrader ? "0.001" : "1"} value={editingProduct.quantity} required style={styles.input}
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

                {isMarket && (
                  <div style={styles.formGroup}>
                    <label>تاريخ الصلاحية (اختياري)</label>
                    <input type="date" value={editingProduct.expiryDate || ""} style={styles.input}
                      onChange={(e) => setEditingProduct({ ...editingProduct, expiryDate: e.target.value })} />
                  </div>
                )}

                {/* إضافات المطعم في التعديل */}
                {isRestaurantOnly && (
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
                <button type="submit" className="btn-primary" disabled={uploading}>
                  <i className="fas fa-save"></i> {uploading ? "جاري الرفع..." : t("common.save")}
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
