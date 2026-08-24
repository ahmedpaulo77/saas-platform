// src/utils/pdfExport.js - يدعم العربية والإنجليزية
export function exportInvoicePDF(invoice, clientName, productName) {
  // كشف اللغة بناءً على اسم العميل أو المنتج
  const isArabic = /[\u0600-\u06FF]/.test(clientName) || /[\u0600-\u06FF]/.test(productName);
  
  const date     = invoice.date    ? new Date(invoice.date).toLocaleDateString(isArabic ? 'ar-EG' : 'en-GB') : new Date().toLocaleDateString(isArabic ? 'ar-EG' : 'en-GB');
  const dueDate  = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString(isArabic ? 'ar-EG' : 'en-GB') : '—';
  const qty      = invoice.quantity || 1;
  const amount   = parseFloat(invoice.amount) || 0;
  const unitPrice = qty > 0 ? (amount / qty).toFixed(2) : amount.toFixed(2);

  // ترجمات حسب اللغة
  const translations = isArabic ? {
    brand: 'منصة إدارة الأعمال',
    invoice: 'فاتورة',
    date: 'التاريخ',
    due: 'تاريخ الاستحقاق',
    status: 'الحالة',
    paid: 'مدفوعة',
    pending: 'قيد الانتظار',
    overdue: 'متأخرة',
    client: 'العميل',
    from: 'من',
    desc: 'الوصف / المنتج',
    qty: 'الكمية',
    unit: 'سعر الوحدة',
    total: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    tax: 'الضريبة (0%)',
    notes: 'ملاحظات',
    thanks: 'شكراً لتعاملكم معنا',
    print: '🖨️ طباعة / حفظ PDF',
    close: 'إغلاق',
    currency: 'ج.م',
  } : {
    brand: 'Business Management Platform',
    invoice: 'INVOICE',
    date: 'Date',
    due: 'Due Date',
    status: 'Status',
    paid: 'Paid',
    pending: 'Pending',
    overdue: 'Overdue',
    client: 'Client',
    from: 'From',
    desc: 'Description / Product',
    qty: 'Qty',
    unit: 'Unit Price',
    total: 'Total',
    subtotal: 'Subtotal',
    tax: 'Tax (0%)',
    notes: 'Notes',
    thanks: 'Thank you for your business',
    print: '🖨️ Print / Save PDF',
    close: 'Close',
    currency: 'EGP',
  };

  const statusMap   = { paid: translations.paid, pending: translations.pending, overdue: translations.overdue };
  const statusColor = { paid: '#10b981',  pending: '#f59e0b',     overdue: '#ef4444' };
  const statusBg    = { paid: '#d1fae5',  pending: '#fef3c7',     overdue: '#fee2e2' };
  const statusLabel = statusMap[invoice.status]   || invoice.status;
  const statusClr   = statusColor[invoice.status] || '#64748b';
  const statusBgClr = statusBg[invoice.status]    || '#f1f5f9';

  const invoiceNum = invoice.id?.slice(0, 8).toUpperCase() || 'INV-0001';
  const dir = isArabic ? 'rtl' : 'ltr';

  const html = `<!DOCTYPE html>
<html lang="${isArabic ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width"/>
  <title>${translations.invoice} - ${invoiceNum}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Cairo:wght@400;600;700;800;900&display=swap"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: ${isArabic ? "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif" : "'Inter', 'Segoe UI', Tahoma, Arial, sans-serif"};
      direction: ${dir};
      color: #0f172a;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: white;
      position: relative;
      padding-bottom: 60px;
    }

    /* Header */
    .header {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      padding: 36px 48px 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand-name { font-size: 26px; font-weight: 900; color: white; }
    .brand-sub  { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 4px; }
    .invoice-title { font-size: 32px; font-weight: 900; color: white; text-align: ${isArabic ? 'left' : 'right'}; }
    .invoice-num   { font-size: 13px; color: rgba(255,255,255,0.7); text-align: ${isArabic ? 'left' : 'right'}; margin-top: 4px; }

    /* Meta strip */
    .meta-strip {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 48px;
      display: flex;
      gap: 48px;
      flex-wrap: wrap;
    }
    .meta-label { font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .meta-value { font-size: 14px; font-weight: 700; color: #0f172a; }
    .status-badge {
      display: inline-block;
      padding: 3px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 700;
      background: ${statusBgClr};
      color: ${statusClr};
    }

    /* Bill section */
    .bill-section {
      padding: 28px 48px;
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #f1f5f9;
    }
    .bill-label { font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
    .bill-name  { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 3px; }
    .bill-sub   { font-size: 12px; color: #64748b; }

    /* Table */
    .items-section { padding: 28px 48px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #6366f1; }
    thead th {
      padding: 12px 14px;
      color: white;
      font-size: 11px;
      font-weight: 700;
      text-align: ${isArabic ? 'right' : 'left'};
    }
    thead th:last-child { text-align: ${isArabic ? 'left' : 'right'}; }
    tbody tr { background: #f8fafc; }
    tbody td {
      padding: 16px 14px;
      font-size: 13px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
    }
    tbody td:last-child { text-align: ${isArabic ? 'left' : 'right'}; font-weight: 700; }
    .td-center { text-align: center !important; }
    .td-left   { text-align: ${isArabic ? 'left' : 'right'} !important; }

    /* Totals */
    .totals-wrap { display: flex; justify-content: flex-end; }
    .totals-box {
      width: 260px;
      background: #f8fafc;
      border-radius: 12px;
      padding: 18px 20px;
      border: 1px solid #e2e8f0;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 7px 0;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
      color: #64748b;
    }
    .totals-row:last-child {
      border-bottom: none;
      padding-top: 12px;
      font-size: 16px;
      font-weight: 900;
      color: #6366f1;
    }
    .totals-row span:last-child { font-weight: 700; color: #0f172a; }
    .totals-row:last-child span { color: #6366f1 !important; }

    /* Notes */
    .notes {
      margin-top: 24px;
      padding: 14px 18px;
      background: #f8fafc;
      border-radius: 10px;
      border-right: ${isArabic ? '4px solid #6366f1' : 'none'};
      border-left: ${isArabic ? 'none' : '4px solid #6366f1'};
    }
    .notes-label { font-size: 10px; color: #94a3b8; font-weight: 700; margin-bottom: 5px; }
    .notes-text  { font-size: 13px; color: #334155; }

    /* Footer */
    .footer {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      padding: 14px 48px;
      text-align: center;
      font-size: 11px;
      color: rgba(255,255,255,0.85);
    }

    @media print {
      body { margin: 0; }
      .page { width: 100%; margin: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-name">SaaS PRO</div>
      <div class="brand-sub">${translations.brand}</div>
    </div>
    <div>
      <div class="invoice-title">${translations.invoice}</div>
      <div class="invoice-num">#${invoiceNum}</div>
    </div>
  </div>

  <!-- Meta strip -->
  <div class="meta-strip">
    <div class="meta-item">
      <div class="meta-label">${translations.date}</div>
      <div class="meta-value">${date}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">${translations.due}</div>
      <div class="meta-value">${dueDate}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">${translations.status}</div>
      <div class="meta-value"><span class="status-badge">${statusLabel}</span></div>
    </div>
  </div>

  <!-- Bill To / From -->
  <div class="bill-section">
    <div>
      <div class="bill-label">${translations.client}</div>
      <div class="bill-name">${clientName}</div>
      <div class="bill-sub">${invoice.clientEmail || ''}</div>
    </div>
    <div style="text-align:${isArabic ? 'left' : 'right'};">
      <div class="bill-label">${translations.from}</div>
      <div class="bill-name">SaaS PRO</div>
      <div class="bill-sub">support@saaspro.com</div>
    </div>
  </div>

  <!-- Items -->
  <div class="items-section">
    <table>
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th>${translations.desc}</th>
          <th style="width:70px; text-align:center">${translations.qty}</th>
          <th style="width:110px; text-align:${isArabic ? 'left' : 'right'}">${translations.unit}</th>
          <th style="width:110px; text-align:${isArabic ? 'left' : 'right'}">${translations.total}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td>
            <strong>${productName}</strong>
            ${invoice.description ? `<br><span style="font-size:11px;color:#94a3b8">${invoice.description}</span>` : ''}
          </td>
          <td class="td-center">${qty}</td>
          <td class="td-left">${parseFloat(unitPrice).toLocaleString()} ${translations.currency}</td>
          <td class="td-left">${amount.toLocaleString()} ${translations.currency}</td>
        </tr>
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-wrap">
      <div class="totals-box">
        <div class="totals-row">
          <span>${translations.subtotal}</span>
          <span>${amount.toLocaleString()} ${translations.currency}</span>
        </div>
        <div class="totals-row">
          <span>${translations.tax}</span>
          <span>0.00 ${translations.currency}</span>
        </div>
        <div class="totals-row">
          <span>${translations.total}</span>
          <span>${amount.toLocaleString()} ${translations.currency}</span>
        </div>
      </div>
    </div>

    ${invoice.description ? `
    <div class="notes">
      <div class="notes-label">${translations.notes}</div>
      <div class="notes-text">${invoice.description}</div>
    </div>` : ''}
  </div>

  <!-- Footer -->
  <div class="footer">
    ${translations.thanks} &nbsp;•&nbsp; support@saaspro.com &nbsp;•&nbsp; www.saaspro.com
  </div>

</div>

<!-- Print button -->
<div class="no-print" style="text-align:center;padding:20px;">
  <button onclick="window.print()" style="
    padding: 12px 40px;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 16px;
    font-family: ${isArabic ? 'Cairo, sans-serif' : 'Inter, sans-serif'};
    font-weight: 700;
    cursor: pointer;
    margin-left: 12px;
  ">${translations.print}</button>
  <button onclick="window.close()" style="
    padding: 12px 24px;
    background: #f1f5f9;
    color: #334155;
    border: none;
    border-radius: 10px;
    font-size: 16px;
    font-family: ${isArabic ? 'Cairo, sans-serif' : 'Inter, sans-serif'};
    font-weight: 700;
    cursor: pointer;
  ">${translations.close}</button>
</div>

<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 800);
  };
${'<'}/script>
</body>
</html>`;

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  printWindow.document.write(html);
  printWindow.document.close();
}