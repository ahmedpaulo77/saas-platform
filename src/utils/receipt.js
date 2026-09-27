// src/utils/receipt.js - 80mm thermal receipt, shared by every POS.
// Extracted from StorePOS/POS so all industries print the same shape.
// Key differences from the old inline versions:
//   1. every dynamic value is HTML-escaped (the old POS one did not escape at all,
//      so a product named `<img onerror=...>` executed inside the print window)
//   2. industry-aware title instead of "نوع الطلب / المصدر" on a pharmacy receipt
//   3. the barcode is optional and reused for the "return by barcode" flow

/** Escape before interpolating into the print window. */
export function escHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MONEY = (n) => (Number(n) || 0).toFixed(2);

const L = {
  ar: {
    invoice: "فاتورة بيع",
    clinic: "فاتورة كشف",
    order: "فاتورة طلب",
    code: "رقم",
    cashier: "الكاشير",
    client: "العميل",
    walkIn: "عميل نقدي",
    payment: "الدفع",
    item: "الصنف",
    qty: "الكمية",
    price: "السعر",
    lineTotal: "الإجمالي",
    subtotal: "المجموع",
    discount: "الخصم",
    delivery: "رسوم التوصيل",
    total: "المطلوب",
    paid: "المدفوع",
    change: "الباقي",
    thanks: "شكراً لزيارتكم",
    orderType: "نوع الطلب",
    source: "المصدر",
    table: "الطاولة",
    address: "العنوان",
    phone: "الهاتف",
    note: "ملاحظة",
    size: "المقاس",
    color: "اللون",
    type: "النوع",
    today: "اليوم",
  },
  en: {
    invoice: "Sales receipt",
    clinic: "Consultation receipt",
    order: "Order receipt",
    code: "No.",
    cashier: "Cashier",
    client: "Customer",
    walkIn: "Walk-in",
    payment: "Payment",
    item: "Item",
    qty: "Qty",
    price: "Price",
    lineTotal: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    delivery: "Delivery",
    total: "Total due",
    paid: "Paid",
    change: "Change",
    thanks: "Thank you",
    orderType: "Order type",
    source: "Source",
    table: "Table",
    address: "Address",
    phone: "Phone",
    note: "Note",
    size: "Size",
    color: "Color",
    type: "Type",
    today: "Date",
  },
};

const TITLE_BY_INDUSTRY = {
  restaurant: "order",
  cafe: "order",
  clinic: "clinic",
};

/** Firestore auto-ids are 20 chars; the tail is enough for a human to read aloud. */
export function receiptCode(docId) {
  if (!docId) return "";
  return String(docId).slice(-8).toUpperCase();
}

function row(item, labels) {
  const attrs = [];
  if (item.size) attrs.push(`${labels.size}: ${item.size}`);
  if (item.color) attrs.push(`${labels.color}: ${item.color}`);
  if (item.type) attrs.push(`${labels.type}: ${item.type}`);
  if (item.note) attrs.push(`${labels.note}: ${item.note}`);

  const attrsHtml = attrs.length
    ? `<div style="font-size:10px;color:#666;padding-right:6px;">${escHtml(attrs.join(" • "))}</div>`
    : "";
  const extrasHtml =
    Array.isArray(item.extras) && item.extras.length
      ? `<div style="font-size:10px;color:#666;padding-right:6px;">+ ${escHtml(item.extras.map((e) => e.name).join("، "))}</div>`
      : "";

  return `<tr>
    <td style="padding:3px 6px;border-bottom:1px dashed #ccc;vertical-align:top;">
      ${escHtml(item.name)}${extrasHtml}${attrsHtml}
    </td>
    <td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;vertical-align:top;">${escHtml(item.quantity)}</td>
    <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;vertical-align:top;">${MONEY(item.price)}</td>
    <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;vertical-align:top;font-weight:bold;">${MONEY(item.total)}</td>
  </tr>`;
}

/**
 * @param {object} p
 * @param {string} [p.lang]        "ar" | "en"
 * @param {string} [p.industry]    decides the title (clinic/restaurant get their own)
 * @param {string} [p.storeName]
 * @param {string} [p.code]        receipt / invoice number
 * @param {Date|string} [p.date]
 * @param {string} [p.cashier]
 * @param {string} [p.clientName]
 * @param {string} [p.paymentLabel]
 * @param {Array}  p.items         {name, quantity, price, total, size?, color?, type?, note?, extras?}
 * @param {number} [p.subtotal]
 * @param {number} [p.discount]
 * @param {number} [p.deliveryFee]
 * @param {number} p.total
 * @param {number} [p.paid]
 * @param {string} [p.footer]
 * @param {Array<{label:string,value:string}>} [p.blocks]  extra info rows
 * @param {boolean} [p.barcode]    draw a CODE128 barcode (needs JsBarcode in the opener)
 */
export function buildReceiptHtml(p) {
  const labels = L[p.lang === "en" ? "en" : "ar"] || L.ar;
  const titleKey = TITLE_BY_INDUSTRY[p.industry] || "invoice";
  const discount = Number(p.discount) || 0;
  const deliveryFee = Number(p.deliveryFee) || 0;
  const paid = p.paid === undefined || p.paid === null ? null : Number(p.paid) || 0;
  const change = paid === null ? null : round2(paid - (Number(p.total) || 0));

  const rows = (p.items || []).map((it) => row(it, labels)).join("");
  const when =
    p.date instanceof Date ? p.date.toLocaleString("ar-EG") : p.date || new Date().toLocaleString("ar-EG");
  // فاتورة إنجليزية لازم dir=ltr عشان أعمدة الجدول تتقري صح.
  // (ده عكس السايدبار اللي فيها العربية/الإنجليزية بتفضل يمين.)
  const isEn = p.lang === "en";

  const blocks = (p.blocks || [])
    .filter((b) => b && b.value)
    .map((b) => `<div><strong>${escHtml(b.label)}:</strong> ${escHtml(b.value)}</div>`)
    .join("");

  const changeHtml =
    change === null
      ? ""
      : `<div>${labels.change}: ${MONEY(change)}</div>`;

  return `<!DOCTYPE html>
<html dir="${isEn ? "ltr" : "rtl"}" lang="${isEn ? "en" : "ar"}">
<head>
<meta charset="UTF-8"/>
<title>${escHtml(labels[titleKey])}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 13px; width: 80mm; padding: 8px; }
  h2 { text-align: center; font-size: 16px; margin-bottom: 4px; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f0f0f0; padding: 4px 6px; font-size: 11px; }
  .total-row { font-weight: bold; font-size: 15px; }
  svg.bc { width: 70mm; height: 12mm; display: block; margin: 4px auto 0; }
  @media print { body { width: 80mm; } @page { size: 80mm auto; margin: 0; } }
</style>
</head>
<body>
${p.storeName ? `<div class="center" style="font-size:14px;font-weight:bold;margin-bottom:2px;">${escHtml(p.storeName)}</div>` : ""}
<h2>${escHtml(labels[titleKey])}</h2>
<div class="center" style="font-size:11px;color:#666;">${escHtml(when)}</div>
${p.code ? `<div class="center" style="font-size:12px;">${labels.code} <strong>${escHtml(p.code)}</strong></div>` : ""}
<div class="divider"></div>
<div style="font-size:12px;margin-bottom:4px;">
  ${p.cashier ? `<div><strong>${labels.cashier}:</strong> ${escHtml(p.cashier)}</div>` : ""}
  <div><strong>${labels.client}:</strong> ${escHtml(p.clientName || labels.walkIn)}</div>
  ${p.paymentLabel ? `<div><strong>${labels.payment}:</strong> ${escHtml(p.paymentLabel)}</div>` : ""}
  ${blocks}
</div>
<div class="divider"></div>
<table>
  <thead><tr>
    <th style="text-align:right;">${labels.item}</th>
    <th>${labels.qty}</th>
    <th>${labels.price}</th>
    <th>${labels.lineTotal}</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="divider"></div>
<div style="text-align:left;font-size:13px;">
  <div>${labels.subtotal}: ${MONEY(p.subtotal)}</div>
  ${discount > 0 ? `<div>${labels.discount}: ${MONEY(discount)}</div>` : ""}
  ${deliveryFee > 0 ? `<div>${labels.delivery}: ${MONEY(deliveryFee)}</div>` : ""}
  <div class="total-row" style="margin-top:4px;border-top:2px solid #000;padding-top:4px;">
    ${labels.total}: ${MONEY(p.total)}
  </div>
  ${paid === null ? "" : `<div>${labels.paid}: ${MONEY(paid)}</div>${changeHtml}`}
</div>
<div class="divider"></div>
${p.barcode ? `<svg class="bc" id="invbc"></svg>` : ""}
<div class="center" style="font-size:12px;margin-top:6px;font-weight:bold;">${escHtml(p.footer || labels.thanks)}</div>
</body>
</html>`;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Open the receipt and trigger the browser print dialog.
 * @returns {{ok: boolean, reason?: string}} reason is "popup-blocked" when the
 *          browser refused the window, so the caller can show a manual option.
 */
export function printReceipt(payload, opts = {}) {
  const docId = payload.code || "";
  const html = buildReceiptHtml(payload).replace(
    "</body>",
    `<script>
      try {
        if (${payload.barcode === false ? "false" : "window.JsBarcode"}) {
          window.JsBarcode("#invbc", ${JSON.stringify(docId)}, { format: "CODE128", displayValue: true, fontSize: 11, height: 40, width: 1.4, margin: 0 });
        }
      } catch (e) { /* barcode is optional - never block the print */ }
    <\/script>
    </body>`
  );

  const win = window.open("", "_blank", "width=400,height=650");
  if (!win) return { ok: false, reason: "popup-blocked" };
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try { win.print(); } catch (_) { /* user may have closed it early */ }
    if (opts.keepOpen !== true) win.close();
  }, 350);
  return { ok: true };
}
