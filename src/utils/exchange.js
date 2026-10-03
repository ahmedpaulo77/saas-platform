// src/utils/exchange.js — دوال الاستبدال النقية (بدون Firebase — قابلة للاختبار)
// الاستبدال = مرتجع للقطعة القديمة + فاتورة بيع للقطعة البديلة، مربوطين ببعض.
//
// ⚠️ ملاحظة أمانة: منطق buildExchangeReturnLines مكرر عمدًا من submitSaleReturn
// في Invoices.js بدل استخراجه لدالة مشتركة — مسار المرتجع حرج وشغال ومختبر،
// وإعادة الهيكلة فيه مخاطرة أكبر من التكرار. أي تغيير في معادلة المرتجع
// لازم يتطبق هنا وهناك معًا.

import { round2 } from "./traderUnits.js";

// مدة الاستبدال المسموحة من تاريخ الفاتورة الأصلية (أيام)
export const EXCHANGE_WINDOW_DAYS = 14;

// هل الفاتورة داخل مدة الاستبدال؟ (اليوم 14 نفسه مقبول — الرفض من اليوم 15)
export function isWithinExchangeWindow(invoiceDate, now = new Date(), windowDays = EXCHANGE_WINDOW_DAYS) {
  if (!invoiceDate) return false;
  const start = new Date(invoiceDate).getTime();
  if (Number.isNaN(start)) return false;
  const diffMs = new Date(now).getTime() - start;
  if (diffMs < 0) return false; // تاريخ مستقبلي = مرفوض
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= windowDays;
}

// نسبة الخصم على الفاتورة الأصلية (StorePOS يسجل السطور قبل الخصم)
// تُستخدم لتخفيض مبلغ الرد — نفس قاعدة submitSaleReturn
export function discountRatioOf(invoice) {
  const subtotal = parseFloat(invoice?.subtotal) || 0;
  const discount = parseFloat(invoice?.discount) || 0;
  return subtotal > 0 && discount > 0 ? (subtotal - discount) / subtotal : 1;
}

// سطور المرتجع لعملية الاستبدال — نفس معادلة المرتجع العادي:
// الكمية مكبوحة بالمتبقي (المباع − المرتجع سابقًا)، والمبلغ متناسب + نسبة الخصم
export function buildExchangeReturnLines(sourceLines, returnQtys, priorMap = {}, discountRatio = 1) {
  const lines = Array.isArray(sourceLines) ? sourceLines : [];
  return lines
    .map((p, idx) => {
      const rq = parseFloat(returnQtys?.[idx]) || 0;
      const oq = parseFloat(p.quantity) || 0;
      const already = parseFloat(priorMap?.[p.productId]) || 0;
      const remaining = Math.max(0, oq - already);
      const allowed = Math.min(rq, remaining);
      const ratio = oq > 0 ? allowed / oq : 0;
      return {
        productId: p.productId,
        productName: p.productName || p.name || "",
        quantity: allowed,
        weight: p.weight || "",
        unit: p.unit || "",
        amount: round2((parseFloat(p.amount) || 0) * ratio * discountRatio),
      };
    })
    .filter((l) => l.quantity > 0 && l.productId);
}

// سطور فاتورة البديل من اختيارات المستخدم
export function buildExchangeSaleLines(picks, products) {
  const list = Array.isArray(picks) ? picks : [];
  const out = [];
  for (const pick of list) {
    const qty = parseFloat(pick?.qty) || 0;
    if (!(qty > 0) || !pick?.productId) continue;
    const prod = (products || []).find((p) => p.id === pick.productId);
    if (!prod) continue;
    const price = parseFloat(prod.price) || 0;
    out.push({
      productId: prod.id,
      productName: prod.name || "",
      quantity: qty,
      amount: round2(price * qty),
      price,
      size: prod.size || "",
      color: prod.color || "",
    });
  }
  return out;
}

// ملخص الاستبدال: المسترد (خارج من الدرج) مقابل الجديد (داخل للدرج) والفرق
// diff > 0 → العميل يدفع فرق | diff < 0 → العميل يسترد فرق (خارج من الدرج) | = 0 → متساوي
export function computeExchangeSummary(returnLines, saleLines) {
  const refundTotal = round2(
    (Array.isArray(returnLines) ? returnLines : []).reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  );
  const newTotal = round2(
    (Array.isArray(saleLines) ? saleLines : []).reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  );
  return { refundTotal, newTotal, diff: round2(newTotal - refundTotal) };
}
