// src/utils/revenue.js - المصدر الواحد لحساب الأرقام المالية
//
// ⚠️ ليه الملف ده موجود؟
// قبل كده كل صفحة كانت بتحسب الإيراد بطريقتها، وطلع **4 أرقام مختلفة
// لنفس الشهور**:
//
//   Profits.js   → validated بس، مرتجعات في نفس الفترة
//   Reports.js   → validated بس، مرتجعات كل الفترات
//   Dashboard.js → أي حاجة (مش validated!)، مرتجعات
//   Sales.jsx    → total − returns، أو اعتمدت الفاتورة
//
// وكلهم بيستخدموا `inv.amount` بس — مع إن POS بيحطّ `total` (شامل توصيل).
//
// أي رقم في التطبيق دلوقتي لازم ييجي من هنا عشان صفحة وتانية ماتعارضش
// معاه. لو غيّرت تعريف "الإيراد"، غيّره هنا بس.

import { round2 } from "./traderUnits";

// نعيد تصديرها عشان الصفحات تاخد كل الحسابات المالية من ملف واحد
export { round2 };

/** الفاتورة معتمدة؟ (المستندات القديمة اللي مفيش فيها approval = معتمدة) */
export function isValidatedInvoice(inv) {
  if (!inv) return false;
  return !inv.approval || inv.approval === "validated";
}

/**
 * المبلغ المحصّل فعليًا من فاتورة واحدة.
 *
 * ⚠️ `amount` = قيمة البضاعة (بدون توصيل)، و `total` = المحصّل فعلاً.
 *    POS.js كان بيحطّ التوصيل جوّه amount (قاربه مرتين في الجدول والطباعة)،
 *   Invoices.js بيمشي على العقد الصح. فبنقرأ total الأول.
 */
export function collectedAmount(inv) {
  if (!inv) return 0;
  const total = parseFloat(inv.total);
  if (Number.isFinite(total) && total > 0) return total;
  // احتياطي: amount + توصيل (للفواتير القديمة اللي مالهاش total)
  const amount = parseFloat(inv.amount) || 0;
  const fee = parseFloat(inv.deliveryFee) || 0;
  return round2(amount + fee);
}

/**
 * الإيراد المحقق من فاتورة واحدة (بعد حالة الدفع + الاعتماد).
 *
 * ⚠️ `paidAmount` هو الحقل الموثوق الوحيد للمبلغ المحصّل: كل الكتّاب
 *    (POS.js / StorePOS.jsx / Invoices.js / recordPayment) بيحطوه = اللي
 *    اتحصّل فعلاً. `amount` = قيمة البضاعة (بدون توصيل)، `total` = المحصّل
 *    بس مش موجود في كل المستندات القديمة.
 *
 * - غير المعتمدة: 0 (لسه متأكدهاش — كانت بتتحسب إيراد في الداشبورد!)
 * - المدفوعة/الجزئية: paidAmount، ولو 0 (مستند قديم) نرجع للبديل total/amount
 */
export function invoiceRevenue(inv, { requireValidated = true } = {}) {
  if (!inv) return 0;
  if (requireValidated && !isValidatedInvoice(inv)) return 0;
  const paid = parseFloat(inv.paidAmount);
  if (Number.isFinite(paid) && paid > 0) return paid;
  if (inv.status === "paid") return collectedAmount(inv);
  return 0;
}

/** إجمالي مرتجعات البيع خلال فترة (kind === 'sale') */
export function saleReturnsTotal(returns, inRange) {
  return round2(
    (returns || []).reduce((sum, r) => {
      if (r.kind && r.kind !== "sale") return sum;
      if (inRange && !inRange(r.date || r.createdAt)) return sum;
      return sum + (parseFloat(r.amount) || 0);
    }, 0)
  );
}

/** إجمالي مرتجعات الشراء خلال فترة (kind === 'purchase') */
export function purchaseReturnsTotal(returns, inRange) {
  return round2(
    (returns || []).reduce((sum, r) => {
      if (r.kind !== "purchase") return sum;
      if (inRange && !inRange(r.date || r.createdAt)) return sum;
      return sum + (parseFloat(r.amount) || 0);
    }, 0)
  );
}

/**
 * تكلفة البضاعة المباعة (COGS) من متوسط التكلفة.
 *
 * ⚠️ دي كانت المشكلة الكبيرة: مفيش حقل تكلفة في المشروع أصلاً.
 * `inventory.avgCost` بقى يتحسب في المشتريات (متوسط متحرك)، و
 * `lastUnitCost` كان الأرقام الوحيد. صفحة الأرباح كانت بتستخدم
 * "المدفوع من المشتريات" — ده **تدفق نقدي مش ربح** (شراء ديسمبر
 * مدفوع فبراير = ديسمبر خسارة، مارس ربح 100% والنضاعة بتاعت ديسمبر
 * مبعتش).
 *
 * @param {Array} invoices  الفواتير المعتمدة داخل الفترة
 * @param {Map<string, {avgCost:number, lastUnitCost:number}>} costByProduct
 * @returns {number}
 */
export function cogsFor(invoices, costByProduct, inRange) {
  return round2(
    (invoices || []).reduce((sum, inv) => {
      if (!isValidatedInvoice(inv)) return sum;
      if (inRange && !inRange(inv.date || inv.createdAt)) return sum;
      const lines = inv.products || inv.items || [];
      lines.forEach((l) => {
        const pid = l.productId;
        if (!pid) return;
        const info = costByProduct?.get?.(pid) || costByProduct?.[pid];
        if (!info) return;
        const unitCost =
          parseFloat(info.avgCost) || parseFloat(info.lastUnitCost) || 0;
        if (!(unitCost > 0)) return;
        const qty = parseFloat(l.quantity) || 0;
        // سطر بالكيلو: الكمية من الوزن مش من عدد القطع
        const w = parseFloat(l.weight) || 0;
        const effectiveQty = w > 0 ? w : qty;
        sum += unitCost * effectiveQty;
      });
      return sum;
    }, 0)
  );
}

/**
 * الدفعة الموحّدة: لجمع كل حاجة من الفواتير + المرتجعات + المصروفات.
 * مفيش صفحة تاني تحسبه بنفسها.
 *
 * @returns {{
 *   revenue:number, grossRevenue:number, returns:number,
 *   cogs:number, grossProfit:number,
 *   expenses:number, income:number, waste:number, otherExpenses:number,
 *   netProfit:number
 * }}
 */
export function computePeriod({
  invoices = [],
  returns = [],
  expenses = [],
  costByProduct = new Map(),
  inRange,
  // للتوافق: لو مرّرنا purchases، بنحسبه نقدي (معروض كـ "مشتريات مدفوعة")
  purchases = [],
}) {
  const range = inRange || (() => true);

  const grossRevenue = round2(
    invoices.reduce(
      (sum, inv) => (isValidatedInvoice(inv) && range(inv.date || inv.createdAt)
        ? sum + collectedAmount(inv)
        : sum),
      0
    )
  );
  // الإيراد المحقق = المحصّل فعليًا (بيتبع الدفع الجزئي)
  const revenue = round2(
    invoices.reduce(
      (sum, inv) => (range(inv.date || inv.createdAt) ? sum + invoiceRevenue(inv) : sum),
      0
    )
  );

  const saleReturns = saleReturnsTotal(returns, range);
  const purchaseReturns = purchaseReturnsTotal(returns, range);
  const cogs = cogsFor(invoices, costByProduct, range);

  let expensesOut = 0, incomeIn = 0, waste = 0;
  expenses.forEach((e) => {
    if (!range(e.date || e.createdAt)) return;
    const amt = parseFloat(e.amount) || 0;
    if ((e.direction || "out") === "in") { incomeIn += amt; return; }
    expensesOut += amt;
    if (e.category === "waste") waste += amt;
  });

  const grossProfit = round2(revenue - returns - cogs);

  return {
    grossRevenue,
    revenue,
    returns: saleReturns,
    purchaseReturns,
    cogs,
    grossProfit,
    expenses: round2(expensesOut),
    income: round2(incomeIn),
    waste: round2(waste),
    otherExpenses: round2(expensesOut - waste),
    // الربح الصافي = (إيراد محقق − مرتجعات − تكلفة البضاعة) + دخل − مصروفات
    netProfit: round2(revenue - saleReturns - cogs + incomeIn - expensesOut),
  };
}

