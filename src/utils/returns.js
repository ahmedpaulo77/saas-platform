// src/utils/returns.js - المرتجعات (بيع/شراء) مع رد المخزون
import { collection, doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase/config";
import { logActivity } from "./auditLogger";
import { stockDelta, getProductUnit, roundQty } from "./traderUnits";

/**
 * إنشاء مرتجع ورد المخزون — ذرّي.
 *
 * ⚠️ كان فيه 4 مشاكل هنا:
 *  1) الرد على المخزون كان getDoc + updateDoc لكل سطر برّه أي transaction،
 *     فمرتجعين متزامنين كانوا بيضيّعوا زيادة.
 *  2) الـ catch كان console.warn وبيكمل — فلو سطر من 5 فشل، الباقي بيحاول،
 *     والدوك بيتكتب بمبلغ كامل. يعني العميل اتردّله فلوس كاملة والمخزون
 *     رجع جزئياً = نقص صامت.
 *  3) مرتجع الشراء (kind='purchase') كان بيطرح من غير حد أدنى = مخزون سالب.
 *  4) السطر بالكيلو اللي كميته 0 ووزنه 12.5 كان بيتخطّى من حلقة المخزون
 *     (الشرط كان على quantity) لكن المبلغ بيتحسب كامل = فلوس من غير بضاعة.
 *
 * الحل: transaction واحد فيه كل القراءات ثم كل الكتابات، والمبلغ
 * والمستند والمخزون كلهم بيتكتبوا مع بعض أو ولا حاجة.
 *
 * kind: 'sale' (مرتجع بيع → يزوّد المخزون) | 'purchase' (مرتجع شراء → ينقص المخزون)
 * lines: [{ productId, quantity, weight, unit, amount }]
 */
export async function createReturn({
  kind,
  refId,
  entityId,
  entityName,
  lines,
  reason,
  user,
  isTrader,
}) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const totalAmount = safeLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  // نحسب فرق المخزون لكل سطر *قبل* أي كتابة، بنفس منطق Billing
  const adjustments = [];
  safeLines.forEach((line) => {
    if (!line.productId) return;
    const unit = isTrader ? (line.unit || "piece") : "piece";
    // ⚠️ نفس منطق المخزون في كل مرة — قبل كده quantity was الحارس
    //    فالسطر بالكيلو (pieces=0, weight=12.5) كان بيتخطّى.
    const delta = isTrader
      ? stockDelta(unit, line.quantity, line.weight)
      : parseFloat(line.quantity) || 0;
    if (!(delta > 0)) return;
    adjustments.push({ line, unit, delta });
  });

  const returnRef = doc(collection(db, "returns"));
  const inventoryRefs = adjustments.map((a) => doc(db, "inventory", a.line.productId));

  await runTransaction(db, async (tx) => {
    // 1) كل القراءات أولاً
    const snaps = [];
    for (const ref of inventoryRefs) {
      snaps.push(await tx.get(ref));
    }

    // 2) كل الكتابات
    snaps.forEach((snap, idx) => {
      if (!snap.exists()) return;
      const { line, unit, delta } = adjustments[idx];
      const data = snap.data();
      const current = parseFloat(data.quantity) || 0;
      const effectiveUnit = unit || getProductUnit(data);

      if (kind === "sale") {
        tx.update(inventoryRefs[idx], { quantity: roundQty(current + delta, effectiveUnit) });
      } else {
        // مرتجع شراء: ما ننزلش تحت الصفر أبدًا
        const deduct = Math.min(delta, current);
        if (deduct > 0) {
          tx.update(inventoryRefs[idx], { quantity: roundQty(current - deduct, effectiveUnit) });
        } else {
          console.warn(
            `purchase return skipped restock (no stock left) for product ${line.productId}`
          );
        }
      }
    });

    tx.set(returnRef, {
      kind,
      refId: refId || null,
      entityId: entityId || null,
      entityName: entityName || "",
      items: safeLines,
      amount: totalAmount,
      reason: reason || "",
      companyId: user.companyId,
      createdBy: user.uid,
      createdByEmail: user.email || "",
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // ختم المستند المصدر (نفس الـ transaction = مفيش عدم اتساق)
    if (refId) {
      tx.set(
        doc(db, kind === "sale" ? "invoices" : "purchases", refId),
        { hasReturn: true },
        { merge: true }
      );
    }
  });

  await logActivity({
    actionType: "CREATE",
    collectionName: "returns",
    itemId: returnRef.id,
    details: `Return (${kind}) for ${entityName || entityId}, amount ${totalAmount}. Reason: ${reason || "-"}`,
    user: { uid: user.uid, email: user.email, role: user.role, companyId: user.companyId },
  });

  return returnRef.id;
}
