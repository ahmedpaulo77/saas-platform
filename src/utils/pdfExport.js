// src/utils/pdfExport.js - تصدير الفاتورة كـ PDF احترافي
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportInvoicePDF(invoice, clientName, productName) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

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

  // decorative circle
  doc.setFillColor(255, 255, 255, 0.05);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.1);

  // Company name (white)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('SaaS PRO', 20, 22);

  // Tagline
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 255);
  doc.text('Business Management Platform', 20, 30);

  // "INVOICE" label (right side)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text('INVOICE', pageW - 20, 24, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(200, 210, 255);
  doc.text(`#${invoice.id?.slice(0, 8).toUpperCase() || 'INV-0001'}`, pageW - 20, 33, { align: 'right' });

  // ── Invoice Meta Strip ──
  doc.setFillColor(...lightGray);
  doc.rect(0, 45, pageW, 22, 'F');

  const date = invoice.date ? new Date(invoice.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('en-GB')
    : new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-GB');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...grayColor);

  const metaItems = [
    { label: 'DATE', value: date, x: 20 },
    { label: 'DUE DATE', value: dueDate, x: 75 },
    { label: 'STATUS', value: invoice.status === 'paid' ? 'PAID' : invoice.status === 'pending' ? 'PENDING' : 'OVERDUE', x: 130 },
  ];

  metaItems.forEach(({ label, value, x }) => {
    doc.setTextColor(...grayColor);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, 52);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    if (label === 'STATUS') {
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

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.text('BILL TO', 20, secY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...darkColor);
  doc.text(clientName || 'Client Name', 20, secY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.text(invoice.clientEmail || 'client@example.com', 20, secY + 15);

  // From (right side)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.text('FROM', pageW - 20, secY, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...darkColor);
  doc.text('SaaS PRO', pageW - 20, secY + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...grayColor);
  doc.text('support@saaspro.com', pageW - 20, secY + 15, { align: 'right' });

  // ── Items Table ──
  const qty = invoice.quantity || 1;
  const unitPrice = invoice.amount ? invoice.amount / qty : 0;
  const total = invoice.amount || 0;

  autoTable(doc, {
    startY: secY + 28,
    head: [['#', 'Description', 'Qty', 'Unit Price', 'Total']],
    body: [
      [
        '1',
        productName || invoice.description || 'Product / Service',
        qty.toString(),
        `${unitPrice.toFixed(2)} EGP`,
        `${total.toFixed(2)} EGP`,
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
    { label: 'Subtotal', value: `${total.toFixed(2)} EGP`, bold: false },
    { label: 'Tax (0%)', value: '0.00 EGP', bold: false },
  ];

  let rY = totalsY + 9;
  rows.forEach(({ label, value }) => {
    doc.setFont('helvetica', 'normal');
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

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.text('TOTAL', totalsX, rY + 8);
  doc.text(`${total.toFixed(2)} EGP`, pageW - 20, rY + 8, { align: 'right' });

  // ── Notes ──
  const notesY = Math.max(tableEndY + 60, totalsY + 52);
  if (invoice.description) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...grayColor);
    doc.text('NOTES', 15, notesY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...darkColor);
    doc.text(invoice.description, 15, notesY + 7, { maxWidth: pageW - 90 });
  }

  // ── Footer ──
  doc.setFillColor(...primaryColor);
  doc.rect(0, pageH - 18, pageW, 18, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 210, 255);
  doc.text('Thank you for your business!  •  support@saaspro.com  •  www.saaspro.com', pageW / 2, pageH - 7, { align: 'center' });

  // Save
  const fileName = `invoice-${invoice.id?.slice(0, 8) || 'new'}.pdf`;
  doc.save(fileName);
}
