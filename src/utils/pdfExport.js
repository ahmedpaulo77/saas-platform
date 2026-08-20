// src/utils/pdfExport.js - Arabic PDF using HTML template
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportInvoicePDF(invoice, clientName, productName) {
  // إنشاء عنصر HTML مؤقت للفاتورة
  const container = document.createElement('div');
  container.id = 'pdf-invoice-container';

  const date     = invoice.date     ? new Date(invoice.date).toLocaleDateString('ar-EG')     : new Date().toLocaleDateString('ar-EG');
  const dueDate  = invoice.dueDate  ? new Date(invoice.dueDate).toLocaleDateString('ar-EG')  : '—';
  const qty      = invoice.quantity || 1;
  const amount   = parseFloat(invoice.amount) || 0;
  const unitPrice = qty > 0 ? (amount / qty).toFixed(2) : amount.toFixed(2);

  const statusMap = { paid: 'مدفوعة', pending: 'قيد الانتظار', overdue: 'متأخرة' };
  const statusColor = { paid: '#10b981', pending: '#f59e0b', overdue: '#ef4444' };
  const statusLabel = statusMap[invoice.status] || invoice.status;
  const statusClr   = statusColor[invoice.status] || '#64748b';

  container.innerHTML = `
    <div style="
      width: 794px;
      min-height: 1123px;
      background: white;
      font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      color: #0f172a;
      position: relative;
      padding: 0;
      box-sizing: border-box;
    ">

      <!-- Header -->
      <div style="
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        padding: 36px 48px 28px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      ">
        <div>
          <div style="font-size: 28px; font-weight: 900; color: white; letter-spacing: -1px;">SaaS PRO</div>
          <div style="font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 4px;">منصة إدارة الأعمال</div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 34px; font-weight: 900; color: white; letter-spacing: -1px;">فاتورة</div>
          <div style="font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 4px; text-align: left;">
            #${invoice.id?.slice(0, 8).toUpperCase() || 'INV-0001'}
          </div>
        </div>
      </div>

      <!-- Meta strip -->
      <div style="
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        padding: 16px 48px;
        display: flex;
        gap: 48px;
      ">
        <div>
          <div style="font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">التاريخ</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${date}</div>
        </div>
        <div>
          <div style="font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">تاريخ الاستحقاق</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${dueDate}</div>
        </div>
        <div>
          <div style="font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">الحالة</div>
          <div style="font-size: 13px; font-weight: 700; color: ${statusClr}; background: ${statusClr}15; padding: 3px 12px; border-radius: 20px; display: inline-block;">${statusLabel}</div>
        </div>
      </div>

      <!-- Bill To / From -->
      <div style="padding: 32px 48px; display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9;">
        <div>
          <div style="font-size: 10px; color: #94a3b8; font-weight: 700; margin-bottom: 8px; text-transform: uppercase;">العميل</div>
          <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">${clientName}</div>
          <div style="font-size: 13px; color: #64748b;">${invoice.clientEmail || ''}</div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 10px; color: #94a3b8; font-weight: 700; margin-bottom: 8px; text-transform: uppercase;">من</div>
          <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">SaaS PRO</div>
          <div style="font-size: 13px; color: #64748b; text-align: left;">support@saaspro.com</div>
        </div>
      </div>

      <!-- Items Table -->
      <div style="padding: 32px 48px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #6366f1;">
              <th style="padding: 14px 16px; text-align: right; color: white; font-size: 12px; font-weight: 700; border-radius: 8px 0 0 0;">#</th>
              <th style="padding: 14px 16px; text-align: right; color: white; font-size: 12px; font-weight: 700;">الوصف</th>
              <th style="padding: 14px 16px; text-align: center; color: white; font-size: 12px; font-weight: 700;">الكمية</th>
              <th style="padding: 14px 16px; text-align: left; color: white; font-size: 12px; font-weight: 700;">سعر الوحدة</th>
              <th style="padding: 14px 16px; text-align: left; color: white; font-size: 12px; font-weight: 700; border-radius: 0 8px 0 0;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background: #f8fafc;">
              <td style="padding: 16px; font-size: 13px; color: #64748b; font-weight: 600;">1</td>
              <td style="padding: 16px; font-size: 14px; font-weight: 600; color: #0f172a;">
                ${productName}
                ${invoice.description ? `<br><span style="font-size: 12px; color: #94a3b8; font-weight: 400;">${invoice.description}</span>` : ''}
              </td>
              <td style="padding: 16px; font-size: 14px; font-weight: 600; color: #0f172a; text-align: center;">${qty}</td>
              <td style="padding: 16px; font-size: 14px; font-weight: 600; color: #0f172a; text-align: left;">${parseFloat(unitPrice).toLocaleString()} ج.م</td>
              <td style="padding: 16px; font-size: 14px; font-weight: 700; color: #0f172a; text-align: left;">${amount.toLocaleString()} ج.م</td>
            </tr>
          </tbody>
        </table>

        <!-- Totals -->
        <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
          <div style="width: 280px; background: #f8fafc; border-radius: 12px; padding: 20px 24px; border: 1px solid #e2e8f0;">
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
              <span style="font-size: 13px; color: #64748b;">المجموع الفرعي</span>
              <span style="font-size: 13px; font-weight: 600;">${amount.toLocaleString()} ج.م</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
              <span style="font-size: 13px; color: #64748b;">الضريبة (0%)</span>
              <span style="font-size: 13px; font-weight: 600;">0.00 ج.م</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 12px 0 4px;">
              <span style="font-size: 16px; font-weight: 800; color: #6366f1;">الإجمالي</span>
              <span style="font-size: 18px; font-weight: 900; color: #6366f1;">${amount.toLocaleString()} ج.م</span>
            </div>
          </div>
        </div>

        ${invoice.description ? `
        <!-- Notes -->
        <div style="margin-top: 32px; padding: 16px 20px; background: #f8fafc; border-radius: 10px; border-right: 4px solid #6366f1;">
          <div style="font-size: 12px; color: #94a3b8; font-weight: 700; margin-bottom: 6px;">ملاحظات</div>
          <div style="font-size: 14px; color: #334155;">${invoice.description}</div>
        </div>
        ` : ''}
      </div>

      <!-- Footer -->
      <div style="
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        padding: 16px 48px;
        display: flex;
        justify-content: center;
        align-items: center;
      ">
        <div style="font-size: 12px; color: rgba(255,255,255,0.8); text-align: center;">
          شكراً لتعاملكم معنا  •  support@saaspro.com  •  www.saaspro.com
        </div>
      </div>

    </div>
  `;

  // أضف Cairo font
  const style = document.createElement('style');
  style.textContent = `@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');`;
  container.prepend(style);

  // أضفه للـ DOM بشكل مخفي
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  try {
    // انتظر تحميل الخط
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 500));

    const canvas = await html2canvas(container.querySelector('div'), {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: 794,
      windowWidth: 794,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth  = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`invoice-${invoice.id?.slice(0, 8) || 'new'}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
