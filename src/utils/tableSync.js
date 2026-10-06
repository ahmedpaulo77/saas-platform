// src/utils/tableSync.js — ربط الطاولات بالطلبات تلقائيًا (مطعم/كافيه)
//
// المشكلة: الطاولات كانت يدوية 100% — إشغال وحجز وتحرير يدوي،
// والحذف مسموح لطاولة مشغولة، والحجز المزدوج ممكن.
// الحل هنا (قراءة/كتابة مباشرة، بلا transaction — الحجز المزدوج
// المتزامن تمامًا يبقى مسؤولية الكاشير، والحالات العادية تتظبط وحدها):
//   - فتح طلب dine_in برقم طاولة → الطاولة مشغولة تلقائيًا
//   - اكتمال/توصيل/إلغاء آخر طلب نشط على الطاولة → متاحة تلقائيًا
//     (المحجوزة reserved لا تُمس — الحجز قرار إداري)

import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase/config.js";

const ACTIVE_ORDERS = ["new", "preparing", "ready"];

/** طاولة برقمها داخل الشركة (أو null) */
export async function findTableByNumber(companyId, tableNumber) {
  const num = String(tableNumber ?? "").trim();
  if (!num || !companyId) return null;
  try {
    const snap = await getDocs(
      query(collection(db, "tables"), where("companyId", "==", companyId))
    );
    const hit = snap.docs.find((d) => String(d.data()?.number) === num);
    return hit ? { id: hit.id, ...hit.data() } : null;
  } catch (e) {
    console.warn("find table:", e?.message);
    return null;
  }
}

/** إشغال الطاولة عند فتح طلب عليها (لا يغيّر المحجوزة — يحترم قرار الإدارة) */
export async function occupyTableByNumber(companyId, tableNumber) {
  try {
    const table = await findTableByNumber(companyId, tableNumber);
    if (table && table.status !== "occupied" && table.status !== "reserved") {
      await updateDoc(doc(db, "tables", table.id), { status: "occupied" });
    }
  } catch (e) {
    console.warn("occupy table:", e?.message);
  }
}

/**
 * تحرير الطاولة لو مفيش طلبات نشطة تانية عليها.
 * excludeInvoiceId = الفاتورة اللي اتقفلت حالاً (مستثناة من الفحص).
 */
export async function releaseTableIfFree(companyId, tableNumber, excludeInvoiceId = null) {
  const num = String(tableNumber ?? "").trim();
  if (!num || !companyId) return;
  try {
    const table = await findTableByNumber(companyId, tableNumber);
    if (!table || table.status !== "occupied") return;
    const snap = await getDocs(
      query(collection(db, "invoices"), where("companyId", "==", companyId))
    );
    const stillBusy = snap.docs.some((d) => {
      if (excludeInvoiceId && d.id === excludeInvoiceId) return false;
      const o = d.data() || {};
      if (String(o.tableNumber ?? "") !== num) return false;
      return ACTIVE_ORDERS.includes(o.orderStatus || "new");
    });
    if (!stillBusy) {
      await updateDoc(doc(db, "tables", table.id), { status: "available" });
    }
  } catch (e) {
    console.warn("release table:", e?.message);
  }
}
