// وحدات التاجر: كجم / قطعة / كرتونة — حساب المبلغ وخصم/زيادة المخزون

export const TRADER_UNITS = [
  { value: "kg", labelKey: "trader.unit.kg" },
  { value: "piece", labelKey: "trader.unit.piece" },
  { value: "carton", labelKey: "trader.unit.carton" },
];

export function isTraderIndustry(industry) {
  return industry === "trader";
}

export function getProductUnit(product) {
  return product?.unit || "piece";
}

export function isKgUnit(unit) {
  return unit === "kg";
}

/** المخزون للكيلو بالوزن، ولباقي الوحدات بالعدد */
export function stockDelta(unit, quantity, weight) {
  const qty = parseFloat(quantity) || 0;
  const w = parseFloat(weight) || 0;
  if (isKgUnit(unit)) return w > 0 ? w : qty;
  return qty;
}

/** سعر الكيلو × الوزن، أو سعر الوحدة × العدد */
export function lineAmount(unit, price, quantity, weight) {
  const p = parseFloat(price) || 0;
  const qty = parseFloat(quantity) || 0;
  const w = parseFloat(weight) || 0;
  if (isKgUnit(unit)) return p * (w > 0 ? w : qty);
  return p * qty;
}

export function formatTraderLine(item, product, t) {
  const name = product?.name || "—";
  const unit = item.unit || getProductUnit(product);
  const qty = item.quantity || 0;
  const w = parseFloat(item.weight) || 0;
  const unitLabel = t(`trader.unit.${unit}`) || unit;
  if (w > 0) return `${name} (${qty} × ${w} ${t("trader.unit.kg")})`;
  return `${name} (${qty} ${unitLabel})`;
}
