// src/utils/pdfExport.js - تصدير الفاتورة كـ PDF مع دعم العربية
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ✅ تحميل الخط العربي (مرة واحدة)
const loadArabicFont = async () => {
  try {
    // تحميل الخط من Google Fonts
    const response = await fetch('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
    const css = await response.text();
    // استخراج رابط الخط
    const fontUrl = css.match(/url\(([^)]+)\)/)?.[1];
    if (fontUrl) {
      const fontResponse = await fetch(fontUrl);
      const fontBlob = await fontResponse.arrayBuffer();
      return fontBlob;
    }
    return null;
  } catch (error) {
    console.error('Error loading font:', error);
    return null;
  }
};

export async function exportInvoicePDF(invoice, clientName, productName) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ✅ إضافة خط عربي
  const fontBlob = await loadArabicFont();
  if (fontBlob) {
    // تحويل الخط إلى base64 وإضافته
    const fontBase64 = btoa(String.fromCharCode(...new Uint8Array(fontBlob)));
    doc.addFileToVFS('Cairo-Regular.ttf', fontBase64);
    doc.addFont('Cairo-Regular.ttf', 'Cairo', 'normal');
    doc.addFileToVFS('Cairo-Bold.ttf', fontBase64);
    doc.addFont('Cairo-Bold.ttf', 'Cairo', 'bold');
  }

  const primaryColor = [99, 102, 241];    // indigo
  const darkColor    = [15, 23, 42];      // near black
  const grayColor    = [100, 116, 139];   // gray-500
  const lightGray    = [241, 245, 249];   // gray-100
  const greenColor   = [16, 185, 129];
  const amberColor   = [245, 158, 11];
  const redColor     = [239, 68, 68];

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ── Header Background ──
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageW, 45, 'F');

  // ✅ استخدام الخط العربي
  const arabicFont = fontBlob ? 'Cairo' : 'helvetica';

  // Company name (white)
  doc.setFont(arabicFont, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('SaaS PRO', 20, 22);

  // Tagline
  doc.setFont(arabicFont, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 255);
  doc.text('منصة إدارة الأعمال', 20, 30);

  // "فاتورة" label (right side)
  doc.setFont(arabicFont, 'bold');
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text('فاتورة', pageW - 20, 24, { align: 'right' });

  doc.setFont(arabicFont, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(200, 210, 255);
  doc.text(`#${invoice.id?.slice(0, 8).toUpperCase() || 'INV-0001'}`, pageW - 20, 33, { align: 'right' });

  // ── Invoice Meta Strip ──
  doc.setFillColor(...lightGray);
  doc.rect(0, 45, pageW, 22, 'F');

  const date = invoice.date ? new Date(invoice.date).toLocaleDateString('ar-EG') : new Date().toLocaleDateString('ar-EG');
  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('ar-EG')
    : new Date(Date.now() + 30 * 86400000).toLocaleDateString('ar-EG');

  doc.setFont(arabicFont, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...grayColor);

  const metaItems = [
    { label: 'التاريخ', value: date, x: 20 },
    { label: 'تاريخ الاستحقاق', value: dueDate, x: 75 },
    { label: 'الحالة', value: invoice.status === 'paid' ? 'مدفوعة' : invoice.status === 'pending' ? 'قيد الانتظار' : 'متأخرة', x: 130 },
  ];

  metaItems.forEach(({ label, value, x }) => {
    doc.setTextColor(...grayColor);
    doc.setFont(arabicFont, 'normal');
    doc.text(label, x, 52);
    doc.setFont(arabicFont, 'bold');
    doc.setFontSize(9);
    if (label === 'الحالة') {
      const col = invoice.status === 'paid' ? greenColor : invoice.status === 'pending' ? amberColor : redColor;
      doc.setTextColor(...col);
    } else {
      doc.setTextColor(...darkColor);
    }
    doc.text(value, x, 61);
    doc.setFontSize(8);
  });

  // ── Bill To / From ──
  const secY = 78;
  doc.setFillColor(255, 255, 255);

  doc.setFont(arabicFont, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.text('العميل', 20, secY);

  doc.setFont(arabicFont, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...darkColor);
  doc.text(clientName || 'اسم العميل', 20, secY + 8);

  doc.setFont(arabicFont, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.text(invoice.clientEmail || 'client@example.com', 20, secY + 15);

  // From (right side)
  doc.setFont(arabicFont, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.text('من', pageW - 20, secY, { align: 'right' });

  doc.setFont(arabicFont, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...darkColor);
  doc.text('SaaS PRO', pageW - 20, secY + 8, { align: 'right' });

  doc.setFont(arabicFont, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.text('support@saaspro.com', pageW - 20, secY + 15, { align: 'right' });

  // ── Items Table ──
  const qty = invoice.quantity || 1;
  const unitPrice = invoice.amount ? invoice.amount / qty : 0;
  const total = invoice.amount || 0;

  autoTable(doc, {
    startY: secY + 28,
    head: [['#', 'الوصف', 'الكمية', 'سعر الوحدة', 'الإجمالي']],
    body: [
      [
        '1',
        productName || invoice.description || 'المنتج / الخدمة',
        qty.toString(),
        `${unitPrice.toFixed(2)} ج.م`,
        `${total.toFixed(2)} ج.م`,
      ],
    ],
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 8,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 8,
      textColor: darkColor,
    },
    alternateRowStyles: { fillColor: lightGray },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 38, halign: 'right' },
      4: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
    },
    theme: 'grid',
    tableLineColor: lightGray,
    tableLineWidth: 0.1,
    margin: { left: 15, right: 15 },
  });

  const tableEndY = doc.lastAutoTable.finalY;

  // ── Totals Box ──
  const totalsX = pageW - 80;
  const totalsY = tableEndY + 8;

  doc.setFillColor(...lightGray);
  doc.roundedRect(totalsX - 5, totalsY, 70, 40, 3, 3, 'F');

  const rows = [
    { label: 'المجموع الفرعي', value: `${total.toFixed(2)} ج.م`, bold: false },
    { label: 'الضريبة (0%)', value: '0.00 ج.م', bold: false },
  ];

  let rY = totalsY + 9;
  rows.forEach(({ label, value }) => {
    doc.setFont(arabicFont, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...grayColor);
    doc.text(label, totalsX, rY);
    doc.setTextColor(...darkColor);
    doc.text(value, pageW - 20, rY, { align: 'right' });
    rY += 9;
  });

  // Total line
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.5);
  doc.line(totalsX - 5, rY - 1, pageW - 15, rY - 1);

  doc.setFont(arabicFont, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.text('الإجمالي', totalsX, rY + 8);
  doc.text(`${total.toFixed(2)} ج.م`, pageW - 20, rY + 8, { align: 'right' });

  // ── Notes ──
  const notesY = Math.max(tableEndY + 60, totalsY + 52);
  if (invoice.description) {
    doc.setFont(arabicFont, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...grayColor);
    doc.text('ملاحظات', 15, notesY);
    doc.setFont(arabicFont, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...darkColor);
    doc.text(invoice.description, 15, notesY + 7, { maxWidth: pageW - 90 });
  }

  // ── Footer ──
  doc.setFillColor(...primaryColor);
  doc.rect(0, pageH - 18, pageW, 18, 'F');

  doc.setFont(arabicFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 210, 255);
  doc.text('شكراً لتعاملكم معنا!  •  support@saaspro.com  •  www.saaspro.com', pageW / 2, pageH - 7, { align: 'center' });

  // Save
  const fileName = `invoice-${invoice.id?.slice(0, 8) || 'new'}.pdf`;
  doc.save(fileName);
}