// src/utils/stock.js — محرك المخزون الموحد لكل الأنشطة
//
// المشكلة: كل صفحة كانت بتكتب منطق المخزون بنفسها على كولكشن "inventory"
// فقط. المطعم مخزونه الحقيقي "raw_materials" (الخامات)، ففاتورة الشراء
// كانت بتزوّد "المخزون" الغلط، والبيع مبيخصمش من الخامات أصلاً.
//
// القاعدة:
//   - restaurant → الهدف raw_materials (خامات)، والبيع يستهلك عبر الوصفات
//   - أي نشاط آخر → الهدف inventory (كما كان — بدون أي تغيير سلوكي)
//
// كل الدوال تعمل داخل transaction يملكه المتصل (قراءات أولاً ثم كتابات).
// لا يوجد أي كتابة Firestore هنا مباشرة — فقط tx.get/tx.update عبر المتصل.

import { doc, getDocFromCache } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { stockDelta, getProductUnit, roundQty } from "./traderUnits.js";

export const STOCK_INVENTORY = "inventory";
export const STOCK_RAW_MATERIALS = "raw_materials";

/** كولكشن المخزون الهدف حسب النشاط */
export function stockTargetFor(industry) {
  return industry === "restaurant" ? STOCK_RAW_MATERIALS : STOCK_INVENTORY;
}

/** مفتاح متوسط التكلفة حسب الهدف (inventory.avgCost / raw_materials.costPerUnit) */
export function stockCostKeyFor(target) {
  return target === STOCK_RAW_MATERIALS ? "costPerUnit" : "avgCost";
}

/** معرّف السطر — productId (مخزون) أو materialId (خامات) */
export function stockLineId(line) {
  return line?.productId || line?.materialId || "";
}

/**
 * قراءة مستندات المخزون داخل transaction المتصل.
 * @returns { refs, snaps, byId: Map(id -> snap) }
 */
export async function readStockTx(tx, target, ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  const refs = uniq.map((id) => doc(db, target, id));
  const snaps = await Promise.all(refs.map((r) => tx.get(r)));
  return { refs, snaps, byId: new Map(refs.map((r, i) => [r.id, snaps[i]])) };
}

/**
 * قراءة مستندات المخزون من الكاش المحلي (مسار الأوفلاين).
 * المستند الغائب يُرجع null ولا يرمي — المتصل يقرر (تخطي/منع).
 * @returns { refs, snaps } بنفس ترتيب ids الفريدة
 */
export async function readStockCache(target, ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  const refs = uniq.map((id) => doc(db, target, id));
  const snaps = await Promise.all(refs.map((r) => getDocFromCache(r).catch(() => null)));
  return { refs, snaps };
}

/** دلتا السطر (تاجر: وزن/عدد، غيره: كمية) */
export function lineDeltaOf(line, isTrader, fallbackUnit) {
  const unit = line?.unit || fallbackUnit || "piece";
  return isTrader
    ? stockDelta(unit, line?.quantity, line?.weight)
    : parseFloat(line?.quantity) || 0;
}

/**
 * تخطيط الإدخال (مشتريات/مرتجع بيع): زيادة الكمية + متوسط تكلفة متحرك.
 * entries: [{ ref, snap, line }] — line: { quantity, weight, unit, unitCost }
 * meta: { supplierId, supplierName } — تُختم فقط لو موجودة (لا تمس RAW مواد بلا داعي)
 */
export function planStockIn(entries, { isTrader, costKey = "avgCost", meta = {} } = {}) {
  const writes = [];
  for (const { ref, snap, line } of entries) {
    if (!snap || !snap.exists()) continue;
    const data = snap.data();
    const unit = line?.unit || getProductUnit(data);
    const delta = lineDeltaOf(line, isTrader, getProductUnit(data));
    if (!(delta > 0)) continue;
    const currentQty = parseFloat(data.quantity) || 0;
    const unitCost = parseFloat(line?.unitCost) || 0;
    const updates = {
      quantity: roundQty(currentQty + delta, unit),
    };
    if (meta.supplierId !== undefined) updates.lastSupplierId = meta.supplierId || "";
    if (meta.supplierName !== undefined) updates.lastSupplierName = meta.supplierName || "";
    if (unitCost > 0) {
      updates.lastUnitCost = unitCost;
      const oldAvg = parseFloat(data[costKey]) || parseFloat(data.purchasePrice) || 0;
      const newQty = currentQty + delta;
      updates[costKey] = roundQty(
        newQty > 0 ? (currentQty * oldAvg + delta * unitCost) / newQty : unitCost,
        unit
      );
    }
    writes.push({ ref, updates });
  }
  return writes;
}

/**
 * تخطيط الإخراج (بيع/مرتجع شراء/عكس حذف): نقص الكمية.
 * يرمي INSUFFICIENT_STOCK لو أي سطر هيخلي الرصيد سالب (إلا مع allowNegative).
 */
export function planStockOut(entries, { isTrader, allowNegative = false } = {}) {
  const writes = [];
  for (const { ref, snap, line } of entries) {
    if (!snap || !snap.exists()) continue;
    const data = snap.data();
    const unit = line?.unit || getProductUnit(data);
    const delta = lineDeltaOf(line, isTrader, getProductUnit(data));
    if (!(delta > 0)) continue;
    const currentQty = parseFloat(data.quantity) || 0;
    if (!allowNegative && currentQty - delta < 0) {
      const err = new Error("INSUFFICIENT_STOCK");
      err.details = { id: ref.id, current: currentQty, needed: delta };
      throw err;
    }
    writes.push({ ref, updates: { quantity: roundQty(currentQty - delta, unit) } });
  }
  return writes;
}

// ============================================================
// الوصفات (مطعم): الصنف (طبق) = مكونات من الخامات
// تُخزن مضمّنة في مستند الصنف: recipe: [{ materialId, qty, unit }]
// ============================================================

/** وصفة صنف من snap مستند المخزون (ترجع [] لو مفيش) */
export function recipeOf(stockSnap) {
  const r = stockSnap?.exists?.() ? stockSnap.data()?.recipe : null;
  return Array.isArray(r) ? r.filter((e) => e?.materialId && parseFloat(e?.qty) > 0) : [];
}

/**
 * تحويل سطور أطباق إلى سطور خامات عبر الوصفات.
 * dishLines: [{ productId (طبق), quantity }]
 * dishById: Map(id -> snap)
 * @returns كائن فيه materialLines (سطور الخامات) و skipped (أطباق بلا وصفة)
 */
export function expandRecipeLines(dishLines, dishById) {
  const totals = new Map();
  const skipped = [];
  for (const d of dishLines || []) {
    const id = d?.productId || "";
    const qty = parseFloat(d?.quantity) || 0;
    if (!id || !(qty > 0)) continue;
    const snap = dishById?.get?.(id);
    const recipe = recipeOf(snap);
    if (recipe.length === 0) {
      skipped.push(snap?.exists?.() ? snap.data()?.name || id : id);
      continue;
    }
    for (const e of recipe) {
      const need = (parseFloat(e.qty) || 0) * qty;
      if (!(need > 0)) continue;
      const cur = totals.get(e.materialId) || { quantity: 0, unit: e.unit || "" };
      cur.quantity = roundQty(cur.quantity + need, e.unit || cur.unit || "piece");
      if (e.unit) cur.unit = e.unit;
      totals.set(e.materialId, cur);
    }
  }
  const materialLines = [...totals.entries()].map(([materialId, v]) => ({
    productId: materialId,
    quantity: v.quantity,
    unit: v.unit || "piece",
  }));
  return { materialLines, skipped };
}
