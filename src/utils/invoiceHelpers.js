// src/utils/invoiceHelpers.js - منطق مشترك مستخرج من Invoices.js لتقليل حجم الملف
//
// ⚠️ `completed` و `delivered` لازم يبقوا مع بعض في نفس الترتيب.
//    Kitchen.js كان بيحطّ الحالةTerminal = "completed"، وهي **مش موجودة**
//    في القايمة دي — فـ getOrderStatusConfig بيرجع fallback على الأول
//    (ORDER_STATUSES[0]) والطلب المُنهيّ كان بيظهر "🆕 جديد"! والشارة
//    كانت بتعرض "← جديد" وبالضغط ترجّع الطلب للمطبخ كأنه جديد.
//    (الـ Rules أصلاً كانت سامحة بالحالتين: 'completed','delivered')
export const ORDER_STATUSES = [
  { value: "new", label: "🆕 جديد", color: "#2563eb", bg: "#eff6ff" },
  { value: "preparing", label: "👨‍🍳 قيد التحضير", color: "#d97706", bg: "#fffbeb" },
  { value: "ready", label: "✅ جاهز", color: "#16a34a", bg: "#f0fdf4" },
  { value: "completed", label: "🍽️ تم التنفيذ", color: "#7c3aed", bg: "#f5f3ff" },
  { value: "delivered", label: "🛵 تم التسليم", color: "#7c3aed", bg: "#f5f3ff" },
  { value: "cancelled", label: "❌ ملغي", color: "#dc2626", bg: "#fef2f2" },
];
export const ORDER_TYPES = [
  { value: "takeaway", label: "🥡 تيك أواي" },
  { value: "delivery", label: "🛵 توصيل" },
  { value: "dine_in", label: "🍽️ صالة" },
];
export const ORDER_SOURCES = [
  { value: "direct", label: "🏪 مباشر" },
  { value: "whatsapp", label: "💬 واتساب" },
  { value: "phone", label: "📞 تليفون" },
  { value: "talabat", label: "🛵 طلبات" },
  { value: "city_app", label: "🏙️ سيتي آب" },
];
export function getOrderStatusConfig(val) {
  return ORDER_STATUSES.find((s) => s.value === val) || ORDER_STATUSES[0];
}
export function getSourceLabel(val) {
  return ORDER_SOURCES.find((s) => s.value === (val || "").toLowerCase())?.label || val || "—";
}
export function buildThermalPrintHTML({ invoice, clientName, products, isTrader, getProductUnit, isKgUnit, t, isCafe = false }) {
  const foodLabel = isCafe ? "الكافيه" : "المطعم";
  const foodIcon = isCafe ? "☕" : "🍽️";
  const orderTypeLabel = ORDER_TYPES.find((o) => o.value === invoice.orderType)?.label || invoice.orderType || "";
  const itemsRows = (invoice.products || [])
    .map((p) => {
      const product = products.find((pr) => pr.id === p.productId);
      const name = product ? product.name : "صنف";
      const price = parseFloat(p.amount) || 0;
      const qty = parseFloat(p.quantity) || 1;
      const weight = parseFloat(p.weight) || 0;
      const isKg = isTrader && isKgUnit(p.unit || getProductUnit(product));
      const qtyLabel = isKg && weight > 0 ? `${qty} × ${weight} كجم` : `${qty}`;
      const divisor = isKg && weight > 0 ? weight : qty;
      const unit = (price / divisor).toFixed(2);
      return `<tr><td style="padding:3px 6px;border-bottom:1px dashed #ccc;">${name}</td><td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;">${qtyLabel}</td><td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;">${unit}</td><td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;font-weight:bold;">${price.toFixed(2)}</td></tr>`;
    })
    .join("");
  const deliveryInfo = invoice.orderType === "delivery" ? `<div style="margin:6px 0;font-size:12px;"><strong>📍 العنوان:</strong> ${invoice.deliveryAddress || "—"}<br/>${invoice.deliveryPhone ? `<strong>📞 هاتف:</strong> ${invoice.deliveryPhone}` : ""}${invoice.deliveryFee > 0 ? `<br/><strong>🛵 رسوم التوصيل:</strong> ${invoice.deliveryFee} ج.م` : ""}</div>` : invoice.orderType === "dine_in" && invoice.tableNumber ? `<div style="margin:6px 0;font-size:12px;"><strong>🪑 رقم الطاولة:</strong> ${invoice.tableNumber}</div>` : "";
  const totalWithFee = (parseFloat(invoice.amount) || 0) + (parseFloat(invoice.deliveryFee) || 0);
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:13px;width:80mm;padding:8px}h2{text-align:center;font-size:16px;margin-bottom:4px}.center{text-align:center}.divider{border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f0f0f0;padding:4px 6px;font-size:11px}.total-row{font-weight:bold;font-size:14px}@media print{body{width:80mm}@page{size:80mm auto;margin:0}}</style></head><body><h2>${foodIcon} فاتورة ${foodLabel}</h2><div class="center" style="font-size:11px;color:#666;">${new Date().toLocaleString("ar-EG")}</div><div class="divider"></div><div style="font-size:12px;margin-bottom:4px;"><strong>الزبون:</strong> ${clientName}<br/><strong>نوع الطلب:</strong> ${orderTypeLabel}</div>${deliveryInfo}${invoice.customerNote ? `<div style="font-size:11px;color:#555;margin:4px 0;"><strong>ملاحظة:</strong> ${invoice.customerNote}</div>` : ""}<div class="divider"></div><table><thead><tr><th style="text-align:right;">الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${itemsRows}</tbody></table><div class="divider"></div><div style="text-align:left;font-size:13px;"><div>المجموع: ${(parseFloat(invoice.amount) || 0).toFixed(2)} ج.م</div>${invoice.deliveryFee > 0 ? `<div>رسوم التوصيل: ${invoice.deliveryFee} ج.م</div>` : ""}<div class="total-row" style="margin-top:4px;font-size:15px;border-top:2px solid #000;padding-top:4px;">الإجمالي: ${totalWithFee.toFixed(2)} ج.م</div></div><div class="divider"></div><div class="center" style="font-size:11px;margin-top:6px;">شكراً لزيارتكم 🙏</div></body></html>`;
}
export function buildClinicThermalHTML({ invoice, patientName, company, t }) {
  const lines = (invoice.products || [])
    .map((p) => {
      const name = p.productName || "كشف";
      const price = parseFloat(p.amount) || 0;
      const qty = parseFloat(p.quantity) || 1;
      return `<tr><td style="padding:3px 6px;border-bottom:1px dashed #ccc;">${name}</td><td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;">${qty}</td><td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;font-weight:bold;">${price.toFixed(2)}</td></tr>`;
    })
    .join("");
  const total = parseFloat(invoice.total ?? invoice.amount) || 0;
  const paid = parseFloat(invoice.paidAmount) || 0;
  const remain = Math.max(0, total - paid);
  const cName = company?.name || "العيادة";
  const cPhone = company?.phone || "";
  const cAddr = company?.address || "";
  const doc = company?.doctorName || invoice.doctorName || "";
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"/><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:13px;width:80mm;padding:8px}h2{text-align:center;font-size:16px;margin-bottom:2px}.center{text-align:center}.divider{border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f0f0f0;padding:4px 6px;font-size:11px}.total-row{font-weight:bold;font-size:15px}@media print{body{width:80mm}@page{size:80mm auto;margin:0}}</style></head><body><h2>🩺 ${cName}</h2>${doc ? `<div class="center" style="font-size:12px;">${doc}</div>` : ""}${cPhone || cAddr ? `<div class="center" style="font-size:11px;color:#555;">${cPhone}${cPhone && cAddr ? " • " : ""}${cAddr}</div>` : ""}<div class="center" style="font-size:11px;color:#666;">${new Date().toLocaleString("ar-EG")}</div><div class="divider"></div><div style="font-size:12px;margin-bottom:4px;"><strong>المريض:</strong> ${patientName || "—"}<br/><strong>رقم الفاتورة:</strong> ${invoice.id ? String(invoice.id).slice(0, 8) : "—"}</div><div class="divider"></div><table><thead><tr><th style="text-align:right;">الخدمة</th><th>العدد</th><th>المبلغ</th></tr></thead><tbody>${lines}</tbody></table><div class="divider"></div><div style="text-align:left;font-size:13px;"><div>الإجمالي: ${total.toFixed(2)} ج.م</div><div>المدفوع: ${paid.toFixed(2)} ج.م</div>${remain > 0 ? `<div><strong>المتبقي: ${remain.toFixed(2)} ج.م</strong></div>` : `<div>مدفوعة بالكامل ✅</div>`}</div><div class="divider"></div><div class="center" style="font-size:11px;margin-top:6px;">نتمنى لكم الشفاء العاجل 🙏</div></body></html>`;
}
export function buildVisitSummaryHTML({ company, patient, appointment, prescription, invoice, dentalPlan, attachments = [] }) {
  // ورقة المريض وهو ماشي (A4): التشخيص + الأدوية + المتابعة + خطة الأسنان + الحساب
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cName = company?.name || "العيادة";
  const doctor = prescription?.doctor || company?.doctorName || appointment?.doctor || "";
  const specialty = company?.specialty || "";
  const meds = (prescription?.medicines || []).map((m, i) =>
    `<tr><td>${i + 1}</td><td><strong>${esc(m.name)}</strong>${m.notes ? `<br/><small>${esc(m.notes)}</small>` : ""}</td><td>${esc(m.dose || "—")}</td><td>${esc(m.frequency || "—")}</td><td>${esc(m.duration || "—")}</td></tr>`
  ).join("");
  const planRows = (dentalPlan?.items || []).map((x, i) =>
    `<tr><td>${i + 1}</td><td>🦷 ${esc(x.tooth)}</td><td>${esc(x.procedure)}</td><td>${Number(x.price) || 0}</td><td>${x.status === "done" ? "تم ✅" : "متبقي"}</td></tr>`
  ).join("");
  const invLines = (invoice?.products || []).map((p) =>
    `<tr><td>${esc(p.productName || "خدمة")}</td><td>${p.quantity || 1}</td><td>${Number(p.amount) || 0}</td></tr>`
  ).join("");
  const total = Number(invoice?.total ?? invoice?.amount ?? 0) || 0;
  const paid = Number(invoice?.paidAmount ?? 0) || 0;
  const remain = Math.max(0, total - paid);
  const typeLabel = { lab: "🧪 تحليل", xray: "🩻 أشعة", ultrasound: "📡 سونار", report: "📋 تقرير", other: "📎 مرفق" };
  const attBlocks = (attachments || []).map((m) =>
    `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:6px;text-align:center;break-inside:avoid"><div style="font-weight:800;font-size:12px">${esc(typeLabel[m.type] || "📎 مرفق")} — ${esc(m.title || "")}</div><div style="font-size:11px;color:#64748b">${esc(m.date || "")}</div>${m.fileData ? `<img src="${m.fileData}" alt="${esc(m.title || "")}" style="max-width:100%;max-height:220px;margin-top:4px;border-radius:6px"/>` : (m.link ? `<div style="font-size:11px">🔗 ${esc(m.link)}</div>` : "")}${m.notes ? `<div style="font-size:11px;color:#475569;margin-top:2px">${esc(m.notes)}</div>` : ""}</div>`
  ).join("");
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/><title>ملخص الزيارة — ${esc(patient?.name || "")}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo','Segoe UI',Tahoma,sans-serif;padding:28px;color:#0f172a}h1{font-size:22px}h2{font-size:15px;margin:18px 0 8px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:6px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}th{background:#f1f5f9;padding:7px 10px;text-align:right;border:1px solid #e2e8f0}td{padding:7px 10px;border:1px solid #e2e8f0}.hdr{display:flex;gap:14px;align-items:center;border-bottom:3px double #059669;padding-bottom:12px}.hdr img{width:64px;height:64px;object-fit:contain;border-radius:12px;border:1px solid #e2e8f0}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;font-size:13px;margin-top:8px}.follow{background:#f0fdf4;border:1px solid #6ee7b7;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:800;color:#15803d;margin-top:10px}.totals{display:flex;gap:18px;font-size:15px;font-weight:900;margin-top:8px}.footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px;font-size:12px;color:#64748b}.sign{border-top:1px solid #0f172a;padding-top:4px;min-width:150px;text-align:center;color:#0f172a;font-weight:800}@media print{@page{size:A4;margin:14mm}.noprint{display:none}}</style></head><body>
  <div class="hdr">${company?.logoUrl ? `<img src="${company.logoUrl}" alt="logo"/>` : `<div style="font-size:40px">🩺</div>`}
  <div style="flex:1;text-align:center"><h1>${esc(cName)}</h1>${specialty ? `<div style="color:#059669;font-weight:800;font-size:14px">${esc(specialty)}</div>` : ""}<div style="font-size:12px;color:#64748b">${esc(company?.address || "")}${company?.address && company?.phone ? " • " : ""}${esc(company?.phone || "")}</div></div>
  <div style="text-align:center;font-size:12px;color:#64748b">ملخص الزيارة<br/><strong>${esc(appointment?.date || new Date().toISOString().split("T")[0])}</strong></div></div>
  <div class="box">👤 <strong style="font-size:15px">${esc(patient?.name || "—")}</strong>${patient?.age ? ` • السن: ${esc(patient.age)}` : ""}${patient?.phone ? ` • <span dir="ltr">${esc(patient.phone)}</span>` : ""}${doctor ? `<br/>👨‍⚕️ الطبيب: <strong>${esc(doctor)}</strong>` : ""}${appointment?.time ? ` • 🕐 ${esc(appointment.time)}` : ""}</div>
  ${prescription?.diagnosis ? `<h2>التشخيص</h2><div class="box">${esc(prescription.diagnosis)}</div>` : ""}
  ${meds ? `<h2>💊 العلاج</h2><table><thead><tr><th>#</th><th>الدواء</th><th>الجرعة</th><th>طريقة الاستخدام</th><th>المدة</th></tr></thead><tbody>${meds}</tbody></table>` : ""}
  ${prescription?.notes ? `<div class="box">📝 تعليمات: ${esc(prescription.notes)}</div>` : ""}
  ${planRows ? `<h2>🦷 خطة الأسنان</h2><table><thead><tr><th>#</th><th>الضرس</th><th>الإجراء</th><th>السعر</th><th>الحالة</th></tr></thead><tbody>${planRows}</tbody></table>` : ""}
  ${prescription?.followUpDate ? `<div class="follow">🔁 ميعاد المتابعة: ${esc(prescription.followUpDate)}</div>` : ""}
  ${attBlocks ? `<h2>📎 التحاليل والأشعة</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">${attBlocks}</div>` : ""}
  ${invLines ? `<h2>🧾 الحساب</h2><table><thead><tr><th>الخدمة</th><th>العدد</th><th>المبلغ</th></tr></thead><tbody>${invLines}</tbody></table><div class="totals"><span>الإجمالي: ${total} ج.م</span><span style="color:#16a34a">المدفوع: ${paid} ج.م</span><span style="color:#d97706">المتبقي: ${remain} ج.م</span></div>` : ""}
  <div class="footer"><div>${esc(company?.rxFooter || "نتمنى لكم الشفاء العاجل")}<br/>${esc(company?.phone || "")}</div><div class="sign">توقيع الطبيب / ختم العيادة</div></div>
  <div class="noprint" style="text-align:center;margin-top:18px"><button onclick="window.print()" style="background:#059669;color:#fff;border:none;border-radius:10px;padding:10px 28px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">🖨️ طباعة</button></div>
  </body></html>`;
}
export function openSheetPrint(html) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("السماح بالـ popups مطلوب للطباعة"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
}
export function openThermalPrint(html) {
  const win = window.open("", "_blank", "width=400,height=600");
  if (!win) { alert("السماح بالـ popups مطلوب للطباعة"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 300);
}
