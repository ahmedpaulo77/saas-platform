// src/components/invoices/InvoiceForm.jsx - extracted from Invoices.js
import React, { useState, useMemo } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import AutocompleteInput from "../common/AutocompleteInput";
import { ORDER_STATUSES, ORDER_TYPES, ORDER_SOURCES } from "../../utils/invoiceHelpers";
import { getProductUnit, lineAmount, isKgUnit } from "../../utils/traderUnits";
import { getAvailableModules } from "../../utils/modules";

export default function InvoiceForm({ clients, products, newInvoice, setNewInvoice, onSubmit, submitting, fetchClients }) {
  const { t } = useLanguage();
  const { userCompanyId, currentUser, userIndustry, userRole } = useAuth();
  const isCafe = userIndustry === "cafe";
  const isRestaurantOnly = userIndustry === "restaurant";
  const isRestaurant = (isRestaurantOnly || isCafe);
  const isFood = isRestaurant;
  const isTrader = userIndustry === "trader";
  const isClinic = userIndustry === "clinic";
  const hasInventory = getAvailableModules(userIndustry, userRole).has("inventory");

  const entityLabel = isClinic ? t("in.patient") || "المريض" : "العميل";
  const entityLabelReq = isClinic ? t("in.patientReq") || `${entityLabel} *` : t("in.clientReq") || `${entityLabel} *`;
  const chooseEntityPlaceholder = isClinic ? t("in.choosePatient") || "اختر المريض" : t("in.chooseClient") || "اختر العميل";
  const productLabel = isClinic ? t("in.medicine") || "الدواء" : t("in.productOpt") || "منتج (اختياري)";
  const chooseProductPlaceholder = isClinic ? t("in.chooseMedicine") || "اختر الدواء" : t("in.chooseProduct") || "اختر المنتج";
  const entityCollection = isClinic ? "patients" : "clients";

  const [showQuickAddClient, setShowQuickAddClient] = useState(false);
  const [quickClientName, setQuickClientName] = useState("");
  const [quickClientPhone, setQuickClientPhone] = useState("");
  const [quickClientAddress, setQuickClientAddress] = useState("");
  const [addingClient, setAddingClient] = useState(false);

  const calculateProductAmount = (productId, quantity, weight = "") => {
    const product = products.find((p) => p.id === productId);
    if (!product) return 0;
    if (isTrader) return lineAmount(getProductUnit(product), product.price, quantity, weight);
    const qty = parseFloat(quantity);
    if (qty > 0) return (parseFloat(product.price) || 0) * qty;
    return 0;
  };

  const getTotalAmount = useMemo(() => newInvoice.products.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0), [newInvoice.products]);

  async function handleQuickAddClient() {
    if (!quickClientName.trim()) { alert(t("common.fillRequired")); return; }
    setAddingClient(true);
    try {
      const docRef = await addDoc(collection(db, entityCollection), {
        name: quickClientName.trim(),
        phone: quickClientPhone.trim() || "",
        address: quickClientAddress.trim() || "",
        governorate: quickClientAddress.trim() || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      if (fetchClients) await fetchClients();
      setNewInvoice((prev) => ({ ...prev, clientId: docRef.id }));
      setQuickClientName(""); setQuickClientPhone(""); setQuickClientAddress(""); setShowQuickAddClient(false);
    } catch (e) { console.error(e); alert(t("common.errorGeneric")); }
    setAddingClient(false);
  }

  return (
    <div className="form-card">
      <h3><i className="fas fa-plus-circle" style={{ color: "#6366f1" }}></i>{isRestaurant ? "🛒 طلب جديد" : t("in.add")}</h3>
      <form onSubmit={onSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="form-group">
            <label>{isRestaurant ? "الزبون *" : entityLabelReq}</label>
            <AutocompleteInput
              items={clients.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone ? `📞 ${c.phone}` : "" }))}
              value={newInvoice.clientId}
              onChange={(id) => setNewInvoice({ ...newInvoice, clientId: id })}
              placeholder={isRestaurant ? "اختر الزبون أو أضف جديد" : chooseEntityPlaceholder}
              required
            />
            <button type="button" onClick={() => setShowQuickAddClient(!showQuickAddClient)} style={{ marginTop: 6, background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
              {showQuickAddClient ? "✕ إلغاء" : `+ إضافة ${isRestaurant ? "زبون" : entityLabel} جديد`}
            </button>
            {showQuickAddClient && (
              <div style={{ marginTop: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <input type="text" placeholder="الاسم *" value={quickClientName} onChange={(e) => setQuickClientName(e.target.value)} />
                <input type="text" placeholder="الهاتف (اختياري)" value={quickClientPhone} onChange={(e) => setQuickClientPhone(e.target.value)} />
                <input type="text" placeholder="📍 العنوان (اختياري)" value={quickClientAddress} onChange={(e) => setQuickClientAddress(e.target.value)} />
                <button type="button" className="btn-primary btn-sm" onClick={handleQuickAddClient} disabled={addingClient}>{addingClient ? "جاري الحفظ..." : `حفظ ${isRestaurant ? "الزبون" : entityLabel}`}</button>
              </div>
            )}
          </div>

          {hasInventory && (
            <div className="form-group">
              <label>{isRestaurant ? "🍽️ أصناف الطلب *" : productLabel}</label>
              <AutocompleteInput
                key={`inv-add-${newInvoice.products.length}`}
                items={products.map((p) => ({ id: p.id, label: p.name, sublabel: `${t("currency")} ${p.price || 0} — متاح: ${p.quantity || 0}` }))}
                value=""
                onChange={(productId) => {
                  if (!productId) return;
                  if (newInvoice.products.some((p) => p.productId === productId)) return;
                  const prod = products.find((p) => p.id === productId);
                  setNewInvoice({
                    ...newInvoice,
                    products: [...newInvoice.products, { productId, quantity: "1", unit: getProductUnit(prod), weight: "", amount: calculateProductAmount(productId, 1).toString() }],
                  });
                }}
                placeholder={isRestaurant ? (isCafe ? "ابحث واختر صنف من منيو الكافيه..." : "ابحث واختر صنف من منيو المطعم...") : chooseProductPlaceholder}
              />
            </div>
          )}

          {newInvoice.products.length > 0 && (
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#334155" }}>{isRestaurant ? "أصناف الطلب" : t("in.selectedProducts")} ({newInvoice.products.length})</h4>
              <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                {newInvoice.products.map((item, idx) => {
                  const product = products.find((p) => p.id === item.productId);
                  const productName = product ? product.name : "—";
                  const showWeight = isTrader && isKgUnit(item.unit || getProductUnit(product));
                  const recalc = (qty, weight) => calculateProductAmount(item.productId, qty, weight).toString();
                  return (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" }}>
                      <span style={{ flex: 1, fontSize: 13, color: "#475569" }}>{productName}{showWeight && item.weight ? <span style={{ color: "#b45309", fontWeight: 700 }}> ({item.weight} {t("trader.unit.kg")})</span> : null}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {showWeight && (
                          <input type="number" min="0" step="0.01" title={t("trader.weight")} placeholder={t("trader.weight")} value={item.weight || ""} onChange={(e) => { const weight = e.target.value; setNewInvoice({ ...newInvoice, products: newInvoice.products.map((p, i) => i === idx ? { ...p, weight, amount: recalc(p.quantity, weight) } : p) }); }} style={{ width: 80, padding: "4px 6px", fontSize: 12, borderRadius: 6, border: "1px solid #f59e0b", textAlign: "center", background: "#fffbeb" }} />
                        )}
                        <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => { const qty = e.target.value; const numQty = parseFloat(qty); const amount = !isNaN(numQty) && numQty > 0 ? recalc(numQty, item.weight) : ""; setNewInvoice({ ...newInvoice, products: newInvoice.products.map((p, i) => i === idx ? { ...p, quantity: qty, amount } : p) }); }} style={{ width: 60, padding: "4px 6px", fontSize: 12, borderRadius: 6, border: "1px solid #cbd5e1", textAlign: "center" }} />
                        <span style={{ fontSize: 12, color: "#6366f1", minWidth: 60 }}>{(parseFloat(item.amount) || 0).toLocaleString()} {t("currency")}</span>
                        <button type="button" onClick={() => setNewInvoice({ ...newInvoice, products: newInvoice.products.filter((_, i) => i !== idx) })} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontWeight: 700, color: "#1e293b" }}><span>الإجمالي:</span><span>{getTotalAmount.toLocaleString()} {t("currency")}</span></div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t("in.amountReq")}</label>
            <input type="number" step="0.01" placeholder="0.00" value={getTotalAmount || ""} readOnly={newInvoice.products.length > 0} onChange={(e) => { if (newInvoice.products.length === 0) setNewInvoice({ ...newInvoice, amount: e.target.value }); }} required />
          </div>

          {isRestaurant && (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>مصدر الأوردر</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ORDER_SOURCES.map((os) => (
                    <button key={os.value} type="button" onClick={() => setNewInvoice({ ...newInvoice, orderSource: os.value })} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, border: `2px solid ${(newInvoice.orderSource || "direct") === os.value ? "#6366f1" : "#e2e8f0"}`, borderRadius: 10, background: (newInvoice.orderSource || "direct") === os.value ? "#eef2ff" : "white", color: (newInvoice.orderSource || "direct") === os.value ? "#4338ca" : "#64748b", cursor: "pointer" }}>{os.label}</button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>نوع الطلب</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {ORDER_TYPES.map((ot) => (
                    <button key={ot.value} type="button" onClick={() => setNewInvoice({ ...newInvoice, orderType: ot.value })} style={{ flex: 1, padding: "10px 16px", fontSize: 14, fontWeight: 700, border: `2px solid ${newInvoice.orderType === ot.value ? "#f59e0b" : "#e2e8f0"}`, borderRadius: 10, background: newInvoice.orderType === ot.value ? "#fffbeb" : "white", color: newInvoice.orderType === ot.value ? "#d97706" : "#64748b", cursor: "pointer", transition: "all 0.2s" }}>{ot.label}</button>
                  ))}
                </div>
              </div>
              {newInvoice.orderType === "delivery" && (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>📍 عنوان التوصيل *</label><input type="text" placeholder="اكتب العنوان بالتفصيل" value={newInvoice.deliveryAddress} onChange={(e) => setNewInvoice({ ...newInvoice, deliveryAddress: e.target.value })} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>📞 رقم هاتف التوصيل</label><input type="tel" placeholder="رقم الهاتف" value={newInvoice.deliveryPhone} onChange={(e) => setNewInvoice({ ...newInvoice, deliveryPhone: e.target.value })} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>🛵 رسوم التوصيل ({t("currency")})</label><input type="number" step="0.5" min="0" placeholder="0" value={newInvoice.deliveryFee} onChange={(e) => setNewInvoice({ ...newInvoice, deliveryFee: e.target.value })} /></div>
                </>
              )}
              {newInvoice.orderType === "dine_in" && (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>{t("in.tableNumber") || "رقم الطاولة"}</label><input type="number" min="1" placeholder={t("in.tableNumberPh") || "مثال: 5"} value={newInvoice.tableNumber || ""} onChange={(e) => setNewInvoice({ ...newInvoice, tableNumber: e.target.value })} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>📞 رقم الهاتف (اختياري)</label><input type="tel" placeholder="رقم الهاتف" value={newInvoice.deliveryPhone} onChange={(e) => setNewInvoice({ ...newInvoice, deliveryPhone: e.target.value })} /></div>
                </>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}><label>📝 ملاحظة الزبون (اختياري)</label><input type="text" placeholder="" value={newInvoice.customerNote} onChange={(e) => setNewInvoice({ ...newInvoice, customerNote: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>حالة الطلب</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ORDER_STATUSES.filter((s) => s.value !== "cancelled").map((s) => (
                    <button key={s.value} type="button" onClick={() => setNewInvoice({ ...newInvoice, orderStatus: s.value })} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, borderRadius: 20, border: `2px solid ${(newInvoice.orderStatus || "new") === s.value ? s.color : "#e2e8f0"}`, background: (newInvoice.orderStatus || "new") === s.value ? s.bg : "white", color: (newInvoice.orderStatus || "new") === s.value ? s.color : "#94a3b8", cursor: "pointer" }}>{s.label}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {!isRestaurant && (
            <div className="form-group" style={{ marginBottom: 0 }}><label>{t("common.status")}</label><select value={newInvoice.status} onChange={(e) => setNewInvoice({ ...newInvoice, status: e.target.value })}><option value="pending">{t("in.statusWait")}</option><option value="paid">{t("in.statusPaid")}</option><option value="overdue">{t("in.statusOver")}</option></select></div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}><label>{t("common.description")}</label><input type="text" placeholder={t("in.notesPh")} value={newInvoice.description} onChange={(e) => setNewInvoice({ ...newInvoice, description: e.target.value })} /></div>
          {!isRestaurant && (<div className="form-group" style={{ marginBottom: 0 }}><label>{t("in.due")}</label><input type="date" value={newInvoice.dueDate} onChange={(e) => setNewInvoice({ ...newInvoice, dueDate: e.target.value })} /></div>)}
        </div>
        <div style={{ marginTop: 16 }}><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? <><i className="fas fa-spinner fa-spin"></i> {t("common.adding")}</> : <><i className="fas fa-plus"></i> {isRestaurant ? "تسجيل الطلب" : t("in.add")}</>}</button></div>
      </form>
    </div>
  );
}
