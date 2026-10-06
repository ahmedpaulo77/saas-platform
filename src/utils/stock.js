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

// ============================================================
// تحويل الوحدات (مطعم): 500 جرام من خامة بالكيلو كانت تتخصم 500 كيلو!
// التحويل داخل نفس العائلة فقط (وزن/حجم/عدد) — عبر العائلات يبقى الرقم كما هو
// (السلوك القديم) بدل التخمين.
// ============================================================
const UNIT_FAMILIES = {
  weight: {
    units: {
      ton: 1e6, tonne: 1e6, kg: 1000, kilo: 1000, "كيلو": 1000, "كيلوجرام": 1000, "كجم": 1000,
      g: 1, gram: 1, grams: 1, "جرام": 1, "جم": 1,
    },
  },
  volume: {
    units: {
      liter: 1000, litre: 1000, لتر: 1000,
      ml: 1, milliliter: 1, "مل": 1, "مليلتر": 1,
      cup: 250, "كوب": 250, "كوباية": 250,
      tbsp: 15, "معلقة كبيرة": 15, "ملعقة كبيرة": 15,
      tsp: 5, "معلقة صغيرة": 5, "ملعقة صغيرة": 5,
    },
  },
  piece: {
    units: {
      piece: 1, pieces: 1, "قطعة": 1, box: 1, "علبة": 1,
      pack: 1, carton: 1, "كرتونة": 1,
    },
  },
};

function normUnit(u) {
  return String(u ?? "").trim().toLowerCase();
}

function familyOf(normName) {
  for (const [fam, def] of Object.entries(UNIT_FAMILIES)) {
    if (def.units[normName] != null) return fam;
  }
  return null;
}

/**
 * تحويل كمية من وحدة لأخرى داخل نفس العائلة.
 * يرجع { qty, converted: true/false } — لو العائلتين مختلفتين أو مجهولتين
 * يرجع الرقم كما هو (لا تخمين).
 */
export function convertQty(qty, fromUnit, toUnit) {
  const n = parseFloat(qty) || 0;
  const f = normUnit(fromUnit), t = normUnit(toUnit);
  if (!f || !t || f === t) return { qty: n, converted: !f || !t || f === t };
  const famF = familyOf(f), famT = familyOf(t);
  if (!famF || !famT || famF !== famT) return { qty: n, converted: false };
  const factor = UNIT_FAMILIES[famF].units[f] / UNIT_FAMILIES[famF].units[t];
  return { qty: n * factor, converted: true };
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
    // وحّد على وحدة المخزون (مثال: شراء بالجرام وخامة بالكيلو)
    const stockUnit = getProductUnit(data) || unit;
    const conv = convertQty(delta, unit, stockUnit);
    const deltaStock = conv.qty;
    if (!(deltaStock > 0)) continue;
    const unitCost = parseFloat(line?.unitCost) || 0;
    // سعر الوحدة بنفس وحدة المخزون (لو اتحوّلت الكمية يتحوّل السعر عكسيًا)
    const unitCostStock = conv.converted && delta > 0 ? (unitCost * delta) / deltaStock : unitCost;
    const updates = {
      quantity: roundQty(currentQty + deltaStock, stockUnit),
    };
    if (meta.supplierId !== undefined) updates.lastSupplierId = meta.supplierId || "";
    if (meta.supplierName !== undefined) updates.lastSupplierName = meta.supplierName || "";
    if (unitCostStock > 0) {
      updates.lastUnitCost = unitCostStock;
      const oldAvg = parseFloat(data[costKey]) || parseFloat(data.purchasePrice) || 0;
      const newQty = currentQty + deltaStock;
      updates[costKey] = roundQty(
        newQty > 0 ? (currentQty * oldAvg + deltaStock * unitCostStock) / newQty : unitCostStock,
        stockUnit
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
    // وحّد على وحدة المخزون قبل المقارنة (500 جرام ≠ 500 كيلو)
    const stockUnit = getProductUnit(data) || unit;
    const deltaStock = convertQty(delta, unit, stockUnit).qty;
    if (!(deltaStock > 0)) continue;
    const currentQty = parseFloat(data.quantity) || 0;
    if (!allowNegative && currentQty - deltaStock < 0) {
      const err = new Error("INSUFFICIENT_STOCK");
      err.details = { id: ref.id, current: currentQty, needed: deltaStock };
      throw err;
    }
    writes.push({ ref, updates: { quantity: roundQty(currentQty - deltaStock, stockUnit) } });
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
      // تجميع خام بدون تقريب (التقريب المبكر كان يشوّه كسور القطعة مثل 0.3)
      cur.quantity = cur.quantity + need;
      if (e.unit) cur.unit = e.unit;
      totals.set(e.materialId, cur);
    }
  }
  const materialLines = [...totals.entries()].map(([materialId, v]) => ({
    productId: materialId,
    quantity: roundQty(v.quantity, v.unit || "piece"),
    unit: v.unit || "piece",
  }));
  return { materialLines, skipped };
}
