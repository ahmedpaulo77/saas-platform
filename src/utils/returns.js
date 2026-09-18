// src/utils/returns.js - المرتجعات (بيع/شراء) مع رد المخزون
import { collection, addDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { logActivity } from "./auditLogger";
import { stockDelta } from "./traderUnits";

/**
 * إنشاء مرتجع ورد المخزون
 * kind: 'sale' (مرتجع بيع → يزوّد المخزون) | 'purchase' (مرتجع شراء → ينقص المخزون)
 * lines: [{ productId, quantity, amount }]
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
  const totalAmount = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  // رد المخزون أولاً
  for (const line of lines) {
    const qty = parseFloat(line.quantity) || 0;
    if (!line.productId || qty <= 0) continue;
    try {
      const ref = doc(db, "inventory", line.productId);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const current = parseFloat(snap.data().quantity) || 0;
      let delta = qty;
      if (isTrader) {
        delta = stockDelta(line.unit || "piece", line.quantity, line.weight);
      }
      const next = kind === "sale" ? current + delta : current - delta;
      await updateDoc(ref, { quantity: next });
    } catch (e) {
      console.warn("return stock adjust:", e.message);
    }
  }

  const docRef = await addDoc(collection(db, "returns"), {
    kind,
    refId: refId || null,
    entityId: entityId || null,
    entityName: entityName || "",
    items: lines,
    amount: totalAmount,
    reason: reason || "",
    companyId: user.companyId,
    createdBy: user.uid,
    createdByEmail: user.email || "",
    date: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  await logActivity({
    actionType: "CREATE",
    collectionName: "returns",
    itemId: docRef.id,
    details: `Return (${kind}) for ${entityName || entityId}, amount ${totalAmount}. Reason: ${reason || "-"}`,
    user: { uid: user.uid, email: user.email, role: user.role, companyId: user.companyId },
  });

  return docRef.id;
}
