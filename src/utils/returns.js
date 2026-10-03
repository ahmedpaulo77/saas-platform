// src/utils/returns.js - المرتجعات (بيع/شراء) مع رد المخزون
import { collection, doc, runTransaction, writeBatch } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { logActivity } from "./auditLogger.js";
import { stockDelta, getProductUnit, roundQty } from "./traderUnits.js";
import { isOffline } from "./offline.js";
import { readStockCache } from "./stock.js";

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
 * target: كولكشن المخزون ('inventory' افتراضيًا، 'raw_materials' للمطعم)
 * stockLines: سطور حركة المخزون الفعلية إن اختلفت عن lines (مرتجع بيع مطعم:
 *   lines = الأطباق للتوثيق ومنع التكرار، stockLines = الخامات الموسّعة بالوصفة)
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
  target = "inventory",
  stockLines = null,
}) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const totalAmount = safeLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  // نحسب فرق المخزون لكل سطر *قبل* أي كتابة، بنفس منطق Billing
  // (stockLines للفصل بين التوثيق والحركة — انظر الترويسة)
  const moveLines = Array.isArray(stockLines) ? stockLines : safeLines;
  const adjustments = [];
  moveLines.forEach((line) => {
    if (!line.productId) return;
    const unit = isTrader ? (line.unit || "piece") : "piece";
    // ⚠️ نفس منطق المخزون في كل مرة — قبل كده quantity was الحارس
    //    فالسطر بالكيلو (pieces=0, weight=12.5) كان بيتخطّى.
    const delta = isTrader
      ? stockDelta(unit, line.quantity, line.weight)
      : parseFloat(line.quantity) || 0;
    if (!(delta > 0)) return;
    // نحفظ اسم الصنف عشان رسالة الخطأ تكون واضحة للمستخدم
    adjustments.push({ line, unit, delta, productName: line.productName || line.name || line.productId });
  });

  const returnRef = doc(collection(db, "returns"));
  const inventoryRefs = adjustments.map((a) => doc(db, target, a.line.productId));

  // نفس الكتابات على tx (أونلاين/ذرّي) أو batch (أوفلاين/queued) —
  // التواقيع متطابقة: update(ref, data) و set(ref, data, opts).
  const applyWrites = (w, snaps) => {
    snaps.forEach((snap, idx) => {
      if (!snap || !snap.exists()) return;
      const { line, unit, delta, productName } = adjustments[idx];
      const data = snap.data();
      const current = parseFloat(data.quantity) || 0;
      const effectiveUnit = unit || getProductUnit(data);

      if (kind === "sale") {
        w.update(inventoryRefs[idx], { quantity: roundQty(current + delta, effectiveUnit) });
      } else {
        // مرتجع شراء: لو الكمية المرتجعة أكبر من الرصيد → خطأ صريح.
        // الـ transaction كلها بتتلغي ومفيش حاجة بتتسجل.
        if (delta > current) {
          throw new Error(
            `الرصيد لا يكفي لمرتجع الصنف: ${productName || data.name || line.productId}، المتاح ${current}`
          );
        }
        w.update(inventoryRefs[idx], { quantity: roundQty(current - delta, effectiveUnit) });
      }
    });

    w.set(returnRef, {
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

    // ختم المستند المصدر
    if (refId) {
      w.set(
        doc(db, kind === "sale" ? "invoices" : "purchases", refId),
        { hasReturn: true },
        { merge: true }
      );
    }
  };

  if (isOffline()) {
    // أوفلاين: قراءة الكاش + batch تُحفظ محليًا وتتزامن لاحقًا.
    // ملاحظة أمانة: ليست ذرّية عبر الأجهزة — جهازان أوفلاين قد
    // يتجاوزا الكمية، وتُحل عند التزامن (آخر كتابة تكسب).
    const { refs, snaps } = await readStockCache(target, adjustments.map((a) => a.line.productId));
    const byId = new Map(refs.map((r, i) => [r.id, snaps[i]]));
    const batch = writeBatch(db);
    applyWrites(batch, adjustments.map((a) => byId.get(a.line.productId) || null));
    await batch.commit();
  } else {
    await runTransaction(db, async (tx) => {
      // 1) كل القراءات أولاً
      const snaps = [];
      for (const ref of inventoryRefs) {
        snaps.push(await tx.get(ref));
      }
      // 2) كل الكتابات
      applyWrites(tx, snaps);
    });
  }

  await logActivity({
    actionType: "CREATE",
    collectionName: "returns",
    itemId: returnRef.id,
    details: `Return (${kind}) for ${entityName || entityId}, amount ${totalAmount}. Reason: ${reason || "-"}`,
    user: { uid: user.uid, email: user.email, role: user.role, companyId: user.companyId },
  });

  return returnRef.id;
}
