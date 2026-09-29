// src/pages/PurchaseReturnModal.jsx - مودال مرتجع الشراء
import React from "react";

export default function PurchaseReturnModal({
  showReturnModal,
  setShowReturnModal,
  returningPurchase,
  returnQtys,
  setReturnQtys,
  returnReason,
  setReturnReason,
  returning,
  onSubmit,
  t,
  getPurchaseItems,
  products,
  variantLabel,
}) {
  if (!showReturnModal || !returningPurchase) return null;

  return (
    <div className="modal-overlay" onClick={() => setShowReturnModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-undo" style={{ color: "#d97706" }}></i> مرتجع شراء — هينقص المخزون
          </h3>
          <button className="modal-close" onClick={() => setShowReturnModal(false)}>×</button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body">
            {getPurchaseItems(returningPurchase).map((it, idx) => {
              const prod = products.find((pr) => pr.id === it.productId);
              return (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{prod?.name || "صنف"}{variantLabel(prod) ? ` (${variantLabel(prod)})` : ""} <span style={{ color: "#94a3b8" }}>(مشترى: {it.quantity})</span></span>
                  <input type="number" min="0" max={it.quantity} step="0.001" placeholder="مرتجع"
                    value={returnQtys[idx] || ""}
                    onChange={(e) => setReturnQtys({ ...returnQtys, [idx]: e.target.value })}
                    style={{ width: 90, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 8, textAlign: "center" }} />
                </div>
              );
            })}
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>سبب المرتجع (اختياري)</label>
              <input type="text" placeholder="مثال: أصناف تالفة"
                value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={() => setShowReturnModal(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={returning}>
              {returning ? "جاري الحفظ..." : "تأكيد المرتجع"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}