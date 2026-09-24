// src/utils/invoiceHelpers.js - منطق مشترك مستخرج من Invoices.js لتقليل حجم الملف
export const ORDER_STATUSES = [
  { value: "new", label: "🆕 جديد", color: "#2563eb", bg: "#eff6ff" },
  { value: "preparing", label: "👨‍🍳 قيد التحضير", color: "#d97706", bg: "#fffbeb" },
  { value: "ready", label: "✅ جاهز", color: "#16a34a", bg: "#f0fdf4" },
  { value: "delivered", label: "🛵 تم التسليم", color: "#7c3aed", bg: "#f5f3ff" },
  { value: "cancelled", label: "❌ ملغي", color: "#dc2626", bg: "#fef2f2" },
];
export const ORDER_TYPES = [
  { value: "takeaway", label: "🥡 تيك أواي" },
  { value: "delivery", label: "🛵 توصيل" },
  { value: "dine_in", label: "🍽️ صالة" },
];
export const ORDER_SOURCES = [
  { value: "direct", label: "🏪 مباشر" },
  { value: "whatsapp", label: "💬 واتساب" },
  { value: "phone", label: "📞 تليفون" },
  { value: "talabat", label: "🛵 طلبات" },
  { value: "city_app", label: "🏙️ سيتي آب" },
];
export function getOrderStatusConfig(val) {
  return ORDER_STATUSES.find((s) => s.value === val) || ORDER_STATUSES[0];
}
export function getSourceLabel(val) {
  return ORDER_SOURCES.find((s) => s.value === (val || "").toLowerCase())?.label || val || "—";
}
export function buildThermalPrintHTML({ invoice, clientName, products, isTrader, getProductUnit, isKgUnit, t }) {
  const orderTypeLabel = ORDER_TYPES.find((o) => o.value === invoice.orderType)?.label || invoice.orderType || "";
  const itemsRows = (invoice.products || [])
    .map((p) => {
      const product = products.find((pr) => pr.id === p.productId);
      const name = product ? product.name : "صنف";
      const price = parseFloat(p.amount) || 0;
      const qty = parseFloat(p.quantity) || 1;
      const weight = parseFloat(p.weight) || 0;
      const isKg = isTrader && isKgUnit(p.unit || getProductUnit(product));
      const qtyLabel = isKg && weight > 0 ? `${qty} × ${weight} كجم` : `${qty}`;
      const divisor = isKg && weight > 0 ? weight : qty;
      const unit = (price / divisor).toFixed(2);
      return `<tr><td style="padding:3px 6px;border-bottom:1px dashed #ccc;">${name}</td><td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;">${qtyLabel}</td><td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;">${unit}</td><td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;font-weight:bold;">${price.toFixed(2)}</td></tr>`;
    })
    .join("");
  const deliveryInfo = invoice.orderType === "delivery" ? `<div style="margin:6px 0;font-size:12px;"><strong>📍 العنوان:</strong> ${invoice.deliveryAddress || "—"}<br/>${invoice.deliveryPhone ? `<strong>📞 هاتف:</strong> ${invoice.deliveryPhone}` : ""}${invoice.deliveryFee > 0 ? `<br/><strong>🛵 رسوم التوصيل:</strong> ${invoice.deliveryFee} ج.م` : ""}</div>` : invoice.orderType === "dine_in" && invoice.tableNumber ? `<div style="margin:6px 0;font-size:12px;"><strong>🪑 رقم الطاولة:</strong> ${invoice.tableNumber}</div>` : "";
  const totalWithFee = (parseFloat(invoice.amount) || 0) + (parseFloat(invoice.deliveryFee) || 0);
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:13px;width:80mm;padding:8px}h2{text-align:center;font-size:16px;margin-bottom:4px}.center{text-align:center}.divider{border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f0f0f0;padding:4px 6px;font-size:11px}.total-row{font-weight:bold;font-size:14px}@media print{body{width:80mm}@page{size:80mm auto;margin:0}}</style></head><body><h2>🍗 فاتورة المطعم</h2><div class="center" style="font-size:11px;color:#666;">${new Date().toLocaleString("ar-EG")}</div><div class="divider"></div><div style="font-size:12px;margin-bottom:4px;"><strong>الزبون:</strong> ${clientName}<br/><strong>نوع الطلب:</strong> ${orderTypeLabel}</div>${deliveryInfo}${invoice.customerNote ? `<div style="font-size:11px;color:#555;margin:4px 0;"><strong>ملاحظة:</strong> ${invoice.customerNote}</div>` : ""}<div class="divider"></div><table><thead><tr><th style="text-align:right;">الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${itemsRows}</tbody></table><div class="divider"></div><div style="text-align:left;font-size:13px;"><div>المجموع: ${(parseFloat(invoice.amount) || 0).toFixed(2)} ج.م</div>${invoice.deliveryFee > 0 ? `<div>رسوم التوصيل: ${invoice.deliveryFee} ج.م</div>` : ""}<div class="total-row" style="margin-top:4px;font-size:15px;border-top:2px solid #000;padding-top:4px;">الإجمالي: ${totalWithFee.toFixed(2)} ج.م</div></div><div class="divider"></div><div class="center" style="font-size:11px;margin-top:6px;">شكراً لزيارتكم 🙏</div></body></html>`;
}
export function openThermalPrint(html) {
  const win = window.open("", "_blank", "width=400,height=600");
  if (!win) { alert("السماح بالـ popups مطلوب للطباعة"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 300);
}
