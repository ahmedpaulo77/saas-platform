// src/utils/pdfExport.js - تصدير الفاتورة كـ PDF (نسخة مُصلحة: أرقام + اتجاه النص العربي)
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function exportInvoicePDF(invoice, clientName, productName) {
  const qty = parseInt(invoice.quantity) || 1;
  const total = parseFloat(invoice.amount) || 0;
  const unitPrice = qty > 0 ? total / qty : 0;

 const date = invoice.date ? new Date(invoice.date).toLocaleDateString() : new Date().toLocaleDateString();
const dueDate = invoice.dueDate
  ? new Date(invoice.dueDate).toLocaleDateString()
  : new Date(Date.now() + 30 * 86400000).toLocaleDateString();

  const statusText = invoice.status === 'paid' ? 'مدفوعة' : invoice.status === 'pending' ? 'قيد الانتظار' : 'متأخرة';
  const statusColor = invoice.status === 'paid' ? '#10b981' : invoice.status === 'pending' ? '#f59e0b' : '#ef4444';

  const bodyMarkup = `
    <style>
      .invoice-pdf-root * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      .invoice-pdf-root {
        font-family: 'Tahoma', 'Arial', sans-serif;
        direction: rtl;
        background: #f8fafc;
        padding: 40px;
        width: 800px;
      }
      .rtl-text {
        unicode-bidi: plaintext;
        direction: rtl;
        display: inline-block;
      }
      .invoice-container {
        background: white;
        border-radius: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.06);
        overflow: hidden;
        border: 1px solid #e2e8f0;
      }
      .invoice-header {
        background: #4f46e5;
        padding: 30px 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .invoice-header h1 {
        color: white;
        font-size: 24px;
        font-weight: 800;
      }
      .invoice-header .invoice-number {
        color: rgba(255,255,255,0.7);
        font-size: 13px;
        margin-top: 4px;
      }
      .invoice-header .invoice-label {
        text-align: left;
      }
      .invoice-header .invoice-label h2 {
        color: white;
        font-size: 32px;
        font-weight: 800;
      }
      .invoice-meta {
        background: #f1f5f9;
        padding: 14px 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .invoice-meta-item {
        display: flex;
        flex-direction: column;
      }
      .invoice-meta-item label {
        font-size: 11px;
        color: #94a3b8;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .invoice-meta-item span {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
      }
      .invoice-meta-item .status {
        color: ${statusColor};
      }
      .invoice-body {
        padding: 30px 40px;
      }
      .invoice-client {
        display: flex;
        justify-content: space-between;
        margin-bottom: 30px;
      }
      .invoice-client .client-label {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 600;
      }
      .invoice-client .client-name {
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
        margin-top: 4px;
      }
      .invoice-client .client-email {
        font-size: 13px;
        color: #64748b;
        margin-top: 2px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
      }
      table thead {
        background: #4f46e5;
      }
      table thead th {
        color: white;
        padding: 12px 16px;
        text-align: right;
        font-size: 13px;
        font-weight: 700;
      }
      table tbody td {
        padding: 12px 16px;
        border-bottom: 1px solid #f1f5f9;
        font-size: 14px;
        color: #0f172a;
      }
      table tbody tr:last-child td {
        border-bottom: none;
      }
      table tbody tr:nth-child(even) {
        background: #f8fafc;
      }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .text-left { text-align: left; }
      .font-bold { font-weight: 700; }
      .invoice-totals {
        margin-top: 20px;
        display: flex;
        justify-content: flex-end;
      }
      .invoice-totals .totals-box {
        background: #f1f5f9;
        padding: 20px 24px;
        border-radius: 12px;
        min-width: 220px;
      }
      .invoice-totals .totals-box .total-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 14px;
        color: #475569;
      }
      .invoice-totals .totals-box .total-row:last-child {
        border-top: 2px solid #4f46e5;
        padding-top: 12px;
        margin-top: 4px;
        font-size: 18px;
        font-weight: 800;
        color: #4f46e5;
      }
      .invoice-notes {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #e2e8f0;
      }
      .invoice-notes label {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 600;
      }
      .invoice-notes p {
        font-size: 14px;
        color: #475569;
        margin-top: 4px;
      }
      .invoice-footer {
        background: #4f46e5;
        padding: 16px 40px;
        text-align: center;
        color: rgba(255,255,255,0.7);
        font-size: 13px;
      }
    </style>
    <div class="invoice-pdf-root">
      <div class="invoice-container">
        <!-- Header -->
        <div class="invoice-header">
          <div>
            <h1>SaaS PRO</h1>
            <div class="invoice-number">منصة إدارة الأعمال</div>
          </div>
          <div class="invoice-label">
            <h2>فاتورة</h2>
            <div class="invoice-number" style="text-align:left;">#${invoice.id?.slice(0, 8).toUpperCase() || 'INV-0001'}</div>
          </div>
        </div>

        <!-- Meta -->
        <div class="invoice-meta">
          <div class="invoice-meta-item">
            <label>التاريخ</label>
            <span><bdi class="rtl-text">${date}</bdi></span>
          </div>
          <div class="invoice-meta-item">
            <label>تاريخ الاستحقاق</label>
            <span><bdi class="rtl-text">${dueDate}</bdi></span>
          </div>
          <div class="invoice-meta-item">
            <label>الحالة</label>
            <span class="status"><bdi class="rtl-text">${statusText}</bdi></span>
          </div>
        </div>

        <!-- Body -->
        <div class="invoice-body">
          <!-- Client -->
          <div class="invoice-client">
            <div>
              <div class="client-label">العميل</div>
              <div class="client-name"><bdi class="rtl-text">${clientName || 'اسم العميل'}</bdi></div>
              <div class="client-email">${invoice.clientEmail || 'client@example.com'}</div>
            </div>
            <div style="text-align:left;">
              <div class="client-label">من</div>
              <div class="client-name" style="font-size:16px;">SaaS PRO</div>
              <div class="client-email">support@saaspro.com</div>
            </div>
          </div>

          <!-- Table -->
          <table>
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th>الوصف</th>
                <th style="width:70px;text-align:center;">الكمية</th>
                <th style="width:100px;text-align:left;">سعر الوحدة</th>
                <th style="width:100px;text-align:left;">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-center">1</td>
                <td><bdi class="rtl-text">${productName || invoice.description || 'المنتج / الخدمة'}</bdi></td>
                <td class="text-center">${qty}</td>
                <td class="text-left">${unitPrice.toFixed(2)} ج.م</td>
                <td class="text-left font-bold">${total.toFixed(2)} ج.م</td>
              </tr>
            </tbody>
          </table>

          <!-- Totals -->
          <div class="invoice-totals">
            <div class="totals-box">
              <div class="total-row">
                <span>المجموع الفرعي</span>
                <span>${total.toFixed(2)} ج.م</span>
              </div>
              <div class="total-row">
                <span>الضريبة (0%)</span>
                <span>0.00 ج.م</span>
              </div>
              <div class="total-row">
                <span>الإجمالي</span>
                <span>${total.toFixed(2)} ج.م</span>
              </div>
            </div>
          </div>

          <!-- Notes -->
          ${invoice.description ? `
          <div class="invoice-notes">
            <label>ملاحظات</label>
            <p><bdi class="rtl-text">${invoice.description}</bdi></p>
          </div>
          ` : ''}
        </div>

        <!-- Footer -->
        <div class="invoice-footer">
          شكراً لتعاملكم معنا! • support@saaspro.com • www.saaspro.com
        </div>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-9999px';
  container.innerHTML = bodyMarkup;
  document.body.appendChild(container);

  try {
    const element = container.querySelector('.invoice-pdf-root');
    if (!element) throw new Error('تعذر إنشاء عنصر الفاتورة');

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);

    const fileName = `invoice-${invoice.id?.slice(0, 8) || 'new'}.pdf`;
    pdf.save(fileName);
  } catch (err) {
    console.error('PDF export error:', err);
    alert('❌ حدث خطأ أثناء تصدير الفاتورة PDF، حاول مرة أخرى');
  } finally {
    document.body.removeChild(container);
  }
}