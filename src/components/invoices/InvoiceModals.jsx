// src/components/invoices/InvoiceModals.jsx - extracted from Invoices.js
import React, { useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { getAvailableModules } from "../../utils/modules";
import AutocompleteInput from "../common/AutocompleteInput";
import { ORDER_STATUSES, ORDER_TYPES } from "../../utils/invoiceHelpers";
import { getProductUnit, lineAmount, isKgUnit } from "../../utils/traderUnits";

export default function InvoiceModals({
  // edit
  editingInvoice, setEditingInvoice, showEditModal, setShowEditModal, onUpdateInvoice,
  // pay
  payingInvoice, showPayModal, setShowPayModal, payAmount, setPayAmount, onRecordPayment, paying,
  // return
  returningInvoice, showReturnModal, setShowReturnModal, returnQtys, setReturnQtys, returnReason, setReturnReason, onSubmitReturn, returning,
  clients, products,
}) {
  const { t } = useLanguage();
  const { userIndustry, userRole } = useAuth();
  const isRestaurant = userIndustry === "restaurant";
  const isTrader = userIndustry === "trader";
  const isClinic = userIndustry === "clinic";
  const hasInventory = getAvailableModules(userIndustry, userRole).has("inventory");
  const entityColumnLabel = isClinic ? t("in.patientColumn") || "المريض" : t("in.client") || "العميل";
  const chooseEntityPlaceholder = isClinic ? t("in.choosePatient") || "اختر المريض" : t("in.chooseClient") || "اختر العميل";

  const calculateProductAmount = (productId, quantity, weight = "") => {
    const product = products.find((p) => p.id === productId);
    if (!product) return 0;
    if (isTrader) return lineAmount(getProductUnit(product), product.price, quantity, weight);
    const qty = parseFloat(quantity);
    if (qty > 0) return (parseFloat(product.price) || 0) * qty;
    return 0;
  };

  const getEditTotalAmount = useMemo(() => {
    if (!editingInvoice?.products) return 0;
    return editingInvoice.products.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }, [editingInvoice]);

  return (
    <>
      {showEditModal && editingInvoice && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-edit" style={{ color: "#6366f1" }}></i> {isRestaurant ? "تعديل الطلب" : t("common.edit")}</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <form onSubmit={onUpdateInvoice}>
              <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                <div className="form-group">
                  <label>{isRestaurant ? "الزبون" : entityColumnLabel}</label>
                  <AutocompleteInput items={clients.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone ? `📞 ${c.phone}` : "" }))} value={editingInvoice.clientId} onChange={(id) => setEditingInvoice({ ...editingInvoice, clientId: id })} placeholder={isRestaurant ? "اختر الزبون" : chooseEntityPlaceholder} required />
                </div>
                <div className="form-group">
                  <label>{t("common.amount")}</label>
                  <input type="number" step="0.01" value={editingInvoice.products?.length > 0 ? getEditTotalAmount : editingInvoice.amount} onChange={(e) => setEditingInvoice({ ...editingInvoice, amount: e.target.value })} readOnly={editingInvoice.products?.length > 0} required />
                </div>
                {isRestaurant && (
                  <>
                    <div className="form-group">
                      <label>حالة الطلب</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {ORDER_STATUSES.map((s) => (
                          <button key={s.value} type="button" onClick={() => setEditingInvoice({ ...editingInvoice, orderStatus: s.value })} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, borderRadius: 20, border: `2px solid ${(editingInvoice.orderStatus || "new") === s.value ? s.color : "#e2e8f0"}`, background: (editingInvoice.orderStatus || "new") === s.value ? s.bg : "white", color: (editingInvoice.orderStatus || "new") === s.value ? s.color : "#94a3b8", cursor: "pointer" }}>{s.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>نوع الطلب</label>
                      <div style={{ display: "flex", gap: 10 }}>
                        {ORDER_TYPES.map((ot) => (
                          <button key={ot.value} type="button" onClick={() => setEditingInvoice({ ...editingInvoice, orderType: ot.value })} style={{ flex: 1, padding: "8px", fontSize: 13, fontWeight: 700, border: `2px solid ${(editingInvoice.orderType || "takeaway") === ot.value ? "#f59e0b" : "#e2e8f0"}`, borderRadius: 10, background: (editingInvoice.orderType || "takeaway") === ot.value ? "#fffbeb" : "white", color: (editingInvoice.orderType || "takeaway") === ot.value ? "#d97706" : "#64748b", cursor: "pointer" }}>{ot.label}</button>
                        ))}
                      </div>
                    </div>
                    {(editingInvoice.orderType || "takeaway") === "delivery" && (
                      <>
                        <div className="form-group"><label>📍 عنوان التوصيل</label><input type="text" value={editingInvoice.deliveryAddress || ""} onChange={(e) => setEditingInvoice({ ...editingInvoice, deliveryAddress: e.target.value })} /></div>
                        <div className="form-group"><label>📞 هاتف التوصيل</label><input type="tel" value={editingInvoice.deliveryPhone || ""} onChange={(e) => setEditingInvoice({ ...editingInvoice, deliveryPhone: e.target.value })} /></div>
                        <div className="form-group"><label>🛵 رسوم التوصيل</label><input type="number" step="0.5" min="0" value={editingInvoice.deliveryFee || ""} onChange={(e) => setEditingInvoice({ ...editingInvoice, deliveryFee: e.target.value })} /></div>
                      </>
                    )}
                    {(editingInvoice.orderType || "takeaway") === "dine_in" && (
                      <>
                        <div className="form-group"><label>{t("in.tableNumber") || "رقم الطاولة"}</label><input type="number" min="1" placeholder={t("in.tableNumberPh") || "مثال: 5"} value={editingInvoice.tableNumber || ""} onChange={(e) => setEditingInvoice({ ...editingInvoice, tableNumber: e.target.value })} /></div>
                        <div className="form-group"><label>📞 هاتف (اختياري)</label><input type="tel" value={editingInvoice.deliveryPhone || ""} onChange={(e) => setEditingInvoice({ ...editingInvoice, deliveryPhone: e.target.value })} /></div>
                      </>
                    )}
                    <div className="form-group"><label>📝 ملاحظة الزبون</label><input type="text" value={editingInvoice.customerNote || ""} onChange={(e) => setEditingInvoice({ ...editingInvoice, customerNote: e.target.value })} /></div>
                  </>
                )}
                {!isRestaurant && (
                  <div className="form-group"><label>{t("common.status")}</label><select value={editingInvoice.status} onChange={(e) => setEditingInvoice({ ...editingInvoice, status: e.target.value })}><option value="pending">{t("in.statusWait")}</option><option value="paid">{t("in.statusPaid")}</option><option value="overdue">{t("in.statusOver")}</option></select></div>
                )}
                <div className="form-group"><label>{t("common.description")}</label><input type="text" value={editingInvoice.description || ""} onChange={(e) => setEditingInvoice({ ...editingInvoice, description: e.target.value })} /></div>
                {!isRestaurant && (<div className="form-group"><label>{t("in.due")}</label><input type="date" value={editingInvoice.dueDate || ""} onChange={(e) => setEditingInvoice({ ...editingInvoice, dueDate: e.target.value })} /></div>)}
                {hasInventory && editingInvoice.products && (
                  <div style={{ marginTop: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "#1e293b", fontWeight: 700, display: "flex", justifyContent: "space-between" }}><span>{isRestaurant ? "أصناف الطلب" : t("in.currentProducts") || "المنتجات الحالية"}</span><span style={{ color: "#6366f1" }}>({editingInvoice.products.length})</span></h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {editingInvoice.products.map((item, idx) => {
                        const product = products.find((p) => p.id === item.productId);
                        const productName = product ? product.name : "منتج غير محدد";
                        return (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", gap: 8 }}>
                            <span style={{ fontSize: 13, color: "#334155", fontWeight: 600, flex: 1 }}>{productName}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12, color: "#64748b" }}>الكمية:</span>
                              {isTrader && isKgUnit(item.unit || getProductUnit(product)) && (
                                <input type="number" min="0" step="0.01" title={t("trader.weight")} placeholder={t("trader.weight")} value={item.weight || ""} onChange={(e) => { const weight = e.target.value; setEditingInvoice({ ...editingInvoice, products: editingInvoice.products.map((p, i) => i === idx ? { ...p, weight, amount: calculateProductAmount(p.productId, p.quantity, weight).toString() } : p) }); }} style={{ width: "80px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #f59e0b", background: "#fffbeb", textAlign: "center" }} />
                              )}
                              <input type="number" min="1" value={item.quantity} onChange={(e) => { const newQty = parseFloat(e.target.value) || 1; const newAmount = isTrader ? calculateProductAmount(item.productId, newQty, item.weight).toString() : ((product ? parseFloat(product.price) || 0 : 0) * newQty).toString(); setEditingInvoice({ ...editingInvoice, products: editingInvoice.products.map((p, i) => i === idx ? { ...p, quantity: newQty, amount: newAmount } : p) }); }} style={{ width: "60px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1", textAlign: "center" }} />
                            </div>
                            <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700, minWidth: "70px", textAlign: "left" }}>{(parseFloat(item.amount) || 0).toLocaleString()} {t("currency")}</span>
                            <button type="button" onClick={() => setEditingInvoice({ ...editingInvoice, products: editingInvoice.products.filter((_, i) => i !== idx) })} style={{ background: "#fee2e2", border: "none", color: "#ef4444", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>+ {isRestaurant ? "إضافة صنف" : t("in.addProduct") || "إضافة منتج جديد"}</label>
                      <AutocompleteInput key={`inv-edit-${editingInvoice.products?.length || 0}`} items={products.map((p) => ({ id: p.id, label: p.name, sublabel: `${t("currency")} ${p.price || 0}` }))} value="" onChange={(productId) => { if (!productId || editingInvoice.products?.some((p) => p.productId === productId)) return; setEditingInvoice({ ...editingInvoice, products: [...(editingInvoice.products || []), { productId, quantity: 1, unit: getProductUnit(products.find((p) => p.id === productId)), weight: "", amount: calculateProductAmount(productId, 1).toString() }] }); }} placeholder={isRestaurant ? "اختر صنف من المنيو..." : t("in.chooseProduct") || "اختر المنتج..."} />
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>{t("common.cancel")}</button>
                <button type="submit" className="btn-primary"><i className="fas fa-save"></i> {t("common.save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPayModal && payingInvoice && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-money-bill-wave" style={{ color: "#10b981" }}></i> {t("in.pay")}</h3>
              <button className="modal-close" onClick={() => setShowPayModal(false)}>×</button>
            </div>
            <form onSubmit={onRecordPayment}>
              <div className="modal-body">
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: "#64748b", fontSize: 13 }}>{t("in.invoiceVal")}</span><span style={{ fontWeight: 800 }}>{(payingInvoice.amount || 0).toLocaleString()} {t("currency")}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: "#64748b", fontSize: 13 }}>{t("in.prevPaid")}</span><span style={{ fontWeight: 700, color: "#10b981" }}>{(parseFloat(payingInvoice.paidAmount) || 0).toLocaleString()} {t("currency")}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b", fontSize: 13 }}>{t("in.remaining")}</span><span style={{ fontWeight: 900, color: "#ef4444" }}>{((parseFloat(payingInvoice.amount) || 0) - (parseFloat(payingInvoice.paidAmount) || 0)).toLocaleString()} {t("currency")}</span></div>
                </div>
                <div className="form-group"><label>{t("in.payAmount")}</label><input type="number" step="0.01" min="0.01" placeholder="0.00" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required autoFocus /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowPayModal(false)}>{t("common.cancel")}</button>
                <button type="submit" className="btn-primary" disabled={paying}>{paying ? <><i className="fas fa-spinner fa-spin"></i> {t("in.recording")}</> : <><i className="fas fa-check"></i> {t("in.confirmPay")}</>}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReturnModal && returningInvoice && (
        <div className="modal-overlay" onClick={() => setShowReturnModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-undo" style={{ color: "#d97706" }}></i> مرتجع بيع — هيزوّد المخزون</h3>
              <button className="modal-close" onClick={() => setShowReturnModal(false)}>×</button>
            </div>
            <form onSubmit={onSubmitReturn}>
              <div className="modal-body">
                {(returningInvoice.products || []).map((p, idx) => {
                  const prod = products.find((pr) => pr.id === p.productId);
                  return (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{prod?.name || "صنف"} <span style={{ color: "#94a3b8" }}>(مباع: {p.quantity})</span></span>
                      <input type="number" min="0" max={p.quantity} step="0.001" placeholder="مرتجع" value={returnQtys[idx] || ""} onChange={(e) => setReturnQtys({ ...returnQtys, [idx]: e.target.value })} style={{ width: 90, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 8, textAlign: "center" }} />
                    </div>
                  );
                })}
                <div className="form-group" style={{ marginTop: 12 }}><label>سبب المرتجع (اختياري)</label><input type="text" placeholder="مثال: صنف تالف" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowReturnModal(false)}>{t("common.cancel")}</button>
                <button type="submit" className="btn-primary" disabled={returning}>{returning ? "جاري الحفظ..." : "تأكيد المرتجع"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
