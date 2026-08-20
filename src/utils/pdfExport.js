// src/utils/pdfExport.js - Arabic PDF via browser print (100% correct Arabic)
export function exportInvoicePDF(invoice, clientName, productName) {
  const date     = invoice.date    ? new Date(invoice.date).toLocaleDateString('ar-EG')    : new Date().toLocaleDateString('ar-EG');
  const dueDate  = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('ar-EG') : '—';
  const qty      = invoice.quantity || 1;
  const amount   = parseFloat(invoice.amount) || 0;
  const unitPrice = qty > 0 ? (amount / qty).toFixed(2) : amount.toFixed(2);

  const statusMap   = { paid: 'مدفوعة', pending: 'قيد الانتظار', overdue: 'متأخرة' };
  const statusColor = { paid: '#10b981',  pending: '#f59e0b',     overdue: '#ef4444' };
  const statusBg    = { paid: '#d1fae5',  pending: '#fef3c7',     overdue: '#fee2e2' };
  const statusLabel = statusMap[invoice.status]   || invoice.status;
  const statusClr   = statusColor[invoice.status] || '#64748b';
  const statusBgClr = statusBg[invoice.status]    || '#f1f5f9';

  const invoiceNum = invoice.id?.slice(0, 8).toUpperCase() || 'INV-0001';

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width"/>
  <title>فاتورة - ${invoiceNum}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
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
    .invoice-title { font-size: 32px; font-weight: 900; color: white; text-align: left; }
    .invoice-num   { font-size: 13px; color: rgba(255,255,255,0.7); text-align: left; margin-top: 4px; }

    /* Meta strip */
    .meta-strip {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 48px;
      display: flex;
      gap: 48px;
    }
    .meta-item { }
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
      text-align: right;
    }
    thead th:last-child { text-align: left; }
    tbody tr { background: #f8fafc; }
    tbody td {
      padding: 16px 14px;
      font-size: 13px;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
    }
    tbody td:last-child { text-align: left; font-weight: 700; }
    .td-center { text-align: center !important; }
    .td-left   { text-align: left !important; }

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
      border-right: 4px solid #6366f1;
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
      <div class="brand-sub">منصة إدارة الأعمال</div>
    </div>
    <div>
      <div class="invoice-title">فاتورة</div>
      <div class="invoice-num">#${invoiceNum}</div>
    </div>
  </div>

  <!-- Meta strip -->
  <div class="meta-strip">
    <div class="meta-item">
      <div class="meta-label">التاريخ</div>
      <div class="meta-value">${date}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">تاريخ الاستحقاق</div>
      <div class="meta-value">${dueDate}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">الحالة</div>
      <div class="meta-value"><span class="status-badge">${statusLabel}</span></div>
    </div>
  </div>

  <!-- Bill To / From -->
  <div class="bill-section">
    <div>
      <div class="bill-label">العميل</div>
      <div class="bill-name">${clientName}</div>
      <div class="bill-sub">${invoice.clientEmail || ''}</div>
    </div>
    <div style="text-align:left;">
      <div class="bill-label">من</div>
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
          <th>الوصف / المنتج</th>
          <th style="width:70px; text-align:center">الكمية</th>
          <th style="width:110px; text-align:left">سعر الوحدة</th>
          <th style="width:110px; text-align:left">الإجمالي</th>
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
          <td class="td-left">${parseFloat(unitPrice).toLocaleString()} ج.م</td>
          <td class="td-left">${amount.toLocaleString()} ج.م</td>
        </tr>
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-wrap">
      <div class="totals-box">
        <div class="totals-row">
          <span>المجموع الفرعي</span>
          <span>${amount.toLocaleString()} ج.م</span>
        </div>
        <div class="totals-row">
          <span>الضريبة (0%)</span>
          <span>0.00 ج.م</span>
        </div>
        <div class="totals-row">
          <span>الإجمالي</span>
          <span>${amount.toLocaleString()} ج.م</span>
        </div>
      </div>
    </div>

    ${invoice.description ? `
    <div class="notes">
      <div class="notes-label">ملاحظات</div>
      <div class="notes-text">${invoice.description}</div>
    </div>` : ''}
  </div>

  <!-- Footer -->
  <div class="footer">
    شكراً لتعاملكم معنا &nbsp;•&nbsp; support@saaspro.com &nbsp;•&nbsp; www.saaspro.com
  </div>

</div>

<!-- Print button (مش بيطبع) -->
<div class="no-print" style="text-align:center;padding:20px;">
  <button onclick="window.print()" style="
    padding: 12px 40px;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 16px;
    font-family: Cairo, sans-serif;
    font-weight: 700;
    cursor: pointer;
    margin-left: 12px;
  ">🖨️ طباعة / حفظ PDF</button>
  <button onclick="window.close()" style="
    padding: 12px 24px;
    background: #f1f5f9;
    color: #334155;
    border: none;
    border-radius: 10px;
    font-size: 16px;
    font-family: Cairo, sans-serif;
    font-weight: 700;
    cursor: pointer;
  ">إغلاق</button>
</div>

<script>
  // طباعة تلقائية بعد تحميل الخطوط
  window.onload = function() {
    setTimeout(function() { window.print(); }, 800);
  };
<\/script>
</body>
</html>`;

  // فتح في نافذة جديدة
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  printWindow.document.write(html);
  printWindow.document.close();
}
