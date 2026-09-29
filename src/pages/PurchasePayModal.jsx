// src/pages/PurchasePayModal.jsx - مودال تسجيل دفعة للمورد
import React from "react";

export default function PurchasePayModal({
  showPayModal,
  setShowPayModal,
  payingPurchase,
  payAmount,
  setPayAmount,
  paying,
  onRecordPayment,
  t,
  locale,
  moneyShort,
}) {
  if (!showPayModal || !payingPurchase) return null;

  return (
    <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-money-bill-wave" style={{ color: "#10b981" }}></i> {t("pur.pay")}
          </h3>
          <button className="modal-close" onClick={() => setShowPayModal(false)}>
            ×
          </button>
        </div>
        <form onSubmit={onRecordPayment}>
          <div className="modal-body">
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--gray-500)", fontSize: 13 }}>{t("pur.purchaseVal")}</span>
                <span style={{ fontWeight: 800 }}>
                  {moneyShort(payingPurchase.amount || 0, locale)} {t("currency")}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--gray-500)", fontSize: 13 }}>{t("in.prevPaid")}</span>
                <span style={{ fontWeight: 700, color: "#10b981" }}>
                  {moneyShort(payingPurchase.paidAmount, locale)} {t("currency")}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--gray-500)", fontSize: 13 }}>{t("in.remaining")}</span>
                <span style={{ fontWeight: 900, color: "#ef4444" }}>
                  {moneyShort(
                    (parseFloat(payingPurchase.amount) || 0) -
                      (parseFloat(payingPurchase.paidAmount) || 0),
                    locale
                  )}{" "}
                  {t("currency")}
                </span>
              </div>
            </div>
            <div className="form-group">
              <label>{t("in.payAmount")}</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={() => setShowPayModal(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={paying}>
              {paying ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> {t("in.recording")}
                </>
              ) : (
                <>
                  <i className="fas fa-check"></i> {t("in.confirmPay")}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}