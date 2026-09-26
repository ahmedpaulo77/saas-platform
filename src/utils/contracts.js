// src/utils/contracts.js — مخططات موحّدة للمستندات اللي كانت ليها نسختين
//
// 🔴 المشكلة: كل مستند من دول كان بيتكتب من **صفحتين** بمخططين مختلفين،
// فالمستند اللي بيتعمل من صفحة بيبان غلط في التانية:
//
// certificates:
//   Projects.js    → number, deduction, net, notes   (مفيش paidAmount!)
//   Certificates  → paidAmount, description          (مفيش deduction/net!)
//   → المستند اللي من /projects بيظهر في /certificates بـ paidAmount=undefined
//     يعني 100% مستحق، والفلوس بتتناقض (amount vs net).
//
// viewings:
//   Buyers.js   → buyerId/buyerName/sellerId/unitName   (مفيش time!)
//   Viewings.jsx → propertyId/clientId/clientName/time
//   → معاينة من /buyers بتظهر في /viewings بأعمدة فاضية، و Viewings.jsx
//     كان بيعمل new Date("" + "T" + "00:00") = Invalid Date في الترتيب.
//
// الحل: المصدر الواحد. الكتّاب يكتبوا الشكل الكامل، والقراء يقرأوا
// `normalize*` فبتشتغل مع القديم والجديد.

import { round2 } from "./traderUnits";

// ============================================================
// certificates — المستخلصات
// ============================================================

/**
 * شكل المستخلّص الموحّد (اكتب الحقول دي كلها في أي مستند جديد).
 * @param {object} c
 */
export function buildCertificate(c = {}) {
  const amount = round2(c.amount);
  const deduction = round2(c.deduction);
  const net = round2(amount - deduction);
  const paid = round2(c.paidAmount);
  return {
    projectId: c.projectId || "",
    projectName: c.projectName || "",
    number: c.number || "",
    amount,
    deduction,
    net,
    paidAmount: paid,
    // ملاحظة: نحتفظ بـ notes و description الاتنين — القديم من
    // /projects والحديث من /certificates. القارئ بيفضّل description.
    description: c.description || c.notes || "",
    notes: c.notes || c.description || "",
    status: c.status || "pending",
    dueDate: c.dueDate || null,
    companyId: c.companyId,
    createdBy: c.createdBy || null,
    createdAt: c.createdAt || new Date().toISOString(),
  };
}

/** المستخلّص في الشكل الموحّد — بيشتغل مع القديم والحديث */
export function normalizeCertificate(cert) {
  if (!cert) return null;
  const amount = parseFloat(cert.amount) || 0;
  const deduction = parseFloat(cert.deduction) || 0;
  // net: لو مكتوب (من /projects) خُده، وإلا اشتقه من amount - deduction،
  // وإلا (مستند من /certificates) الـ amount هو نفسه الصافي.
  const net = Number.isFinite(parseFloat(cert.net))
    ? parseFloat(cert.net)
    : amount - deduction;
  return {
    ...cert,
    amount: round2(amount),
    deduction: round2(deduction),
    net: round2(net),
    paidAmount: round2(parseFloat(cert.paidAmount) || 0),
    description: cert.description || cert.notes || "",
  };
}

/** صافي المستخلّص (بعد الخصم) — بيشتغل مع القديم والحديث */
export function certificateNet(cert) {
  return normalizeCertificate(cert)?.net ?? 0;
}

/** المتبقي على المستخلّص = الصافي − المحصّل */
export function certificateRemaining(cert) {
  const c = normalizeCertificate(cert);
  if (!c) return 0;
  return round2(Math.max(0, c.net - c.paidAmount));
}

// ============================================================
// viewings — المعاينات العقارية
// ============================================================

export const VIEWING_STATUSES = ["scheduled", "confirmed", "visited", "cancelled"];

/**
 * شكل المعاينة الموحّد.
 *
 * ⚠️ `time` بقى مطلوب فعليًا: Viewings.jsx كان بيعمل
 * `new Date(date + "T" + (time || "00:00"))` فسجل من /buyers (مفيش time)
 * كان بيدي Invalid Date في الترتيب.
 *
 * parties: بنخزّن البائع/المشتري في نفس الحقول (sellerId/buyerId)
 * والـ client كـ alias — عشان الصفحتين تشتغلا على نفس البيانات.
 */
export function buildViewing(v = {}) {
  const date = v.date || "";
  const time = v.time || "00:00";
  return {
    // العقار: المشتري (viewer) والـ client نفس الشخص، والبائع = صاحب الوحدة
    property: v.propertyId || v.property || "",
    propertyId: v.propertyId || v.property || "",
    propertyName: v.propertyName || v.unitName || "",
    // المشتري
    client: v.clientId || v.buyerId || "",
    clientId: v.clientId || v.buyerId || "",
    clientName: v.clientName || v.buyerName || "",
    clientType: v.clientType || "",
    buyerId: v.buyerId || v.clientId || "",
    buyerName: v.buyerName || v.clientName || "",
    // البائع / الوحدة
    sellerId: v.sellerId || "",
    unitName: v.unitName || v.propertyName || "",
    date,
    time,
    status: v.status || "scheduled",
    notes: v.notes || "",
    companyId: v.companyId,
    createdBy: v.createdBy || null,
    createdAt: v.createdAt || new Date().toISOString(),
  };
}

/** المعاينة في الشكل الموحّد — بيشتغل مع القديم والحديث */
export function normalizeViewing(v) {
  if (!v) return null;
  return {
    ...v,
    propertyId: v.propertyId || v.property || "",
    propertyName: v.propertyName || v.unitName || "",
    clientId: v.clientId || v.buyerId || v.client || "",
    clientName: v.clientName || v.buyerName || "",
    buyerId: v.buyerId || v.clientId || v.client || "",
    buyerName: v.buyerName || v.clientName || "",
    // ⚠️ default "00:00" مش "" — عشان التاريخ ميبقاش Invalid Date
    time: v.time || "00:00",
    date: v.date || "",
  };
}

/** Date صالحة للمعاينة (ترتيب/فلترة) — بترجع null لو المستند ناقص */
export function viewingDate(v) {
  const n = normalizeViewing(v);
  if (!n || !n.date) return null;
  // نضيف T عشان يتفسّر وقت **محلي** مش UTC.
  // ("2026-03-01" لوحدها = UTC — بيقفزيوم قبل)
  const d = new Date(`${n.date}T${n.time || "00:00"}`);
  return isNaN(d.getTime()) ? null : d;
}
