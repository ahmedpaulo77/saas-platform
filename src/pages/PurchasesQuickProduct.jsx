// src/pages/PurchasesQuickProduct.jsx - منتج جديد سريع
import React from "react";

export default function PurchasesQuickProduct({
  showQuickProduct,
  setShowQuickProduct,
  quickProductName,
  setQuickProductName,
  quickProductPrice,
  setQuickProductPrice,
  quickProductSize,
  setQuickProductSize,
  quickProductColor,
  setQuickProductColor,
  quickProductCode,
  setQuickProductCode,
  addingProduct,
  onAddProduct,
  isClothing,
  quickSizeOptions,
  quickColorOptions,
  t,
}) {
  if (!showQuickProduct) return null;

  return (
    <div style={{ marginTop: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <input type="text" placeholder="اسم المنتج *" value={quickProductName} onChange={(e) => setQuickProductName(e.target.value)} />
      <input type="number" placeholder="سعر الشراء (اختياري)" value={quickProductPrice} onChange={(e) => setQuickProductPrice(e.target.value)} />
      <input type="text" placeholder="الكود (اختياري — مثال: 7060)" value={quickProductCode} onChange={(e) => setQuickProductCode(e.target.value)} />
      {/* المقاس واللون مفهوم ملابس بس — تاجر/صيدلية/مطعم
          مش بيستفيدوا منهم، ووجودهم بيلخبط الكاشير وبيملأ
          المنتج بصفر فاضي. فلashion بس. */}
      {isClothing && (
        <div style={{ display: "flex", gap: 8 }}>
          {quickSizeOptions.length > 0 ? (
            <select value={quickProductSize} onChange={(e) => setQuickProductSize(e.target.value)} style={{ flex: 1 }}>
              <option value="">المقاس (اختياري)</option>
              {quickSizeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input type="text" placeholder="المقاس (اختياري)" value={quickProductSize} onChange={(e) => setQuickProductSize(e.target.value)} style={{ flex: 1 }} />
          )}
          {quickColorOptions.length > 0 ? (
            <select value={quickProductColor} onChange={(e) => setQuickProductColor(e.target.value)} style={{ flex: 1 }}>
              <option value="">اللون (اختياري)</option>
              {quickColorOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input type="text" placeholder="اللون (اختياري)" value={quickProductColor} onChange={(e) => setQuickProductColor(e.target.value)} style={{ flex: 1 }} />
          )}
        </div>
      )}
      <button type="button" className="btn-primary btn-sm" onClick={onAddProduct} disabled={addingProduct}>{addingProduct ? "جاري..." : "حفظ المنتج"}</button>
    </div>
  );
}