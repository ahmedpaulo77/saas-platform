// src/pages/PurchasesQuickSupplier.jsx - مورد جديد سريع
import React from "react";

export default function PurchasesQuickSupplier({
  showQuickSupplier,
  setShowQuickSupplier,
  quickSupplierName,
  setQuickSupplierName,
  quickSupplierPhone,
  setQuickSupplierPhone,
  addingSupplier,
  onAddSupplier,
  t,
}) {
  if (!showQuickSupplier) return null;

  return (
    <div style={{ marginTop: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <input type="text" placeholder="اسم المورد *" value={quickSupplierName} onChange={(e) => setQuickSupplierName(e.target.value)} />
      <input type="text" placeholder="الهاتف (اختياري)" value={quickSupplierPhone} onChange={(e) => setQuickSupplierPhone(e.target.value)} />
      <button type="button" className="btn-primary btn-sm" onClick={onAddSupplier} disabled={addingSupplier}>
        {addingSupplier ? "جاري..." : "حفظ المورد"}
      </button>
    </div>
  );
}