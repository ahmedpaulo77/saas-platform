// src/utils/printPurchaseThermal.js - طباعة فاتورة شراء حرارية (80mm)
// مستخرجة حرفياً من Purchases.js > handlePrintPurchase

export function printPurchaseThermal(purchase, { suppliers, products, getPurchaseItems, variantLabel, isTrader, isKgUnit }) {
  const supplierName =
    suppliers.find((s) => s.id === purchase.supplierId)?.name || "مورد";
  const itemsRows = getPurchaseItems(purchase)
    .map((it) => {
      const prod = products.find((pr) => pr.id === it.productId);
      const name = prod?.name || "صنف";
      const variant = variantLabel(prod);
      const displayName = variant ? `${name} (${variant})` : name;
      const amount = parseFloat(it.amount) || 0;
      const qty = parseFloat(it.quantity) || 0;
      const w = parseFloat(it.weight) || 0;
      const isKg = isTrader && isKgUnit(it.unit || "piece") && w > 0;
      const qtyLabel = isKg ? `${qty} × ${it.weight} كجم` : `${qty}`;
      const unitCost = parseFloat(it.unitCost) || 0;
      return `<tr>
        <td style="padding:3px 6px;border-bottom:1px dashed #ccc;">${displayName}</td>
        <td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;">${qtyLabel}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;">${unitCost}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;font-weight:bold;">${amount.toFixed(2)}</td>
      </tr>`;
    })
    .join("");

  const paid = parseFloat(purchase.paidAmount) || 0;
  const total = parseFloat(purchase.amount) || 0;
  const printContent = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 13px; width: 80mm; padding: 8px; }
  h2 { text-align: center; font-size: 16px; margin-bottom: 4px; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f0f0f0; padding: 4px 6px; font-size: 11px; }
  .total-row { font-weight: bold; font-size: 14px; }
  @media print {
    body { width: 80mm; }
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>
<h2>🧾 فاتورة شراء</h2>
<div class="center" style="font-size:11px;color:#666;">${purchase.date ? new Date(purchase.date).toLocaleString("ar-EG") : new Date().toLocaleString("ar-EG")}</div>
<div class="divider"></div>
<div style="font-size:12px;margin-bottom:4px;">
  <strong>المورد:</strong> ${supplierName}<br/>
  ${purchase.invoiceNumber ? `<strong>رقم الفاتورة:</strong> ${purchase.invoiceNumber}<br/>` : ""}
  ${purchase.description ? `<strong>ملاحظات:</strong> ${purchase.description}` : ""}
</div>
<div class="divider"></div>
<table>
  <thead><tr>
    <th style="text-align:right;">الصنف</th>
    <th>الكمية</th>
    <th>السعر</th>
    <th>الإجمالي</th>
  </tr></thead>
  <tbody>${itemsRows}</tbody>
</table>
<div class="divider"></div>
<div style="text-align:left;font-size:13px;">
  <div>الإجمالي: ${total.toFixed(2)} ج.م</div>
  <div>المدفوع: ${paid.toFixed(2)} ج.م</div>
  <div class="total-row" style="margin-top:4px;font-size:15px;border-top:2px solid #000;padding-top:4px;">
    المتبقي: ${(total - paid).toFixed(2)} ج.م
  </div>
</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=400,height=600");
  if (!win) {
    alert("السماح بالـ popups مطلوب للطباعة");
    return;
  }
  win.document.write(printContent);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 300);
}