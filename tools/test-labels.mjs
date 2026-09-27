// The label printer builds the barcode from product code + size + color.
// Verify the fix: non-fashion must NOT get a "-0-0" suffix.
const asciiSafe = (s, fb) => {
  const v = String(s ?? "").replace(/[^\x20-\x7E]/g, "").trim();
  return v || fb || "0";
};

function buildLabel({ isClothing, prod, it, purchaseId, colorMap = {}, sizeMap = {} }) {
  const brand = "Pharma Co";
  const model = (prod.model || prod.name || "").toString().trim() || "—";
  const size = isClothing ? (prod.size ?? it.size ?? "").toString().trim() : "";
  const color = isClothing ? (prod.color ?? it.color ?? "").toString().trim() : "";
  const colorCode = size || color ? asciiSafe(colorMap[color.toLowerCase()] ?? color, "") : "";
  const sizeCode = size || color ? asciiSafe(sizeMap[size.toLowerCase()] ?? size, "") : "";
  const sizeColorLine = size && color ? `${sizeCode}-of ${color}` : sizeCode || color || "";

  let barcodeValue = (prod.barcode || it.barcode || "").toString().trim();
  if (!barcodeValue) {
    const prodCode = (prod.code || it.code || "").toString().trim();
    const base = prodCode
      ? asciiSafe(prodCode, "0000")
      : asciiSafe(String(purchaseId || prod.id || "0000").slice(0, 4), "0000");
    barcodeValue = isClothing ? `${base}-${colorCode}-${sizeCode}`.replace(/-{2,}/g, "-") : base;
  }
  return { barcode: asciiSafe(barcodeValue, String(purchaseId || "0000").slice(0, 4)), sizeColorLine, model };
}

let pass = 0, fail = 0;
const check = (n, c, got) => { c ? (pass++, console.log("  OK    " + n)) : (fail++, console.log("  FAIL  " + n + "  got=" + got)); };

const colorMap = { "red": "R", "أسود": "K" };
const sizeMap = { "xl": "XL", "l": "L" };

console.log("--- the bug: pharmacy used to print 7060-0-0 ---");
const pharm = buildLabel({ isClothing: false, prod: { code: "7060", name: "بنادول", size: "", color: "" }, it: {}, purchaseId: "abc123" });
check("pharmacy barcode is just the code", pharm.barcode === "7060", pharm.barcode);
check("pharmacy has no size/color line", pharm.sizeColorLine === "", JSON.stringify(pharm.sizeColorLine));

console.log("\n--- pharmacy that somehow has stale size/color in the doc ---");
const stale = buildLabel({ isClothing: false, prod: { code: "7060", name: "بنادول", size: "XL", color: "أسود" }, it: {}, purchaseId: "abc123" });
check("stale size/color ignored in barcode", stale.barcode === "7060", stale.barcode);
check("stale size/color ignored in the line", stale.sizeColorLine === "", JSON.stringify(stale.sizeColorLine));

console.log("\n--- clothing keeps its variant suffix ---");
const cloth = buildLabel({ isClothing: true, prod: { code: "7060", name: "قميص", size: "XL", color: "أسود" }, it: {}, purchaseId: "abc123", colorMap, sizeMap });
check("clothing barcode keeps the suffix", cloth.barcode === "7060-K-XL", cloth.barcode);
check("clothing keeps the size-color line", cloth.sizeColorLine === "XL-of أسود", cloth.sizeColorLine);

console.log("\n--- clothing with a name-mapped colour code ---");
const cloth2 = buildLabel({ isClothing: true, prod: { code: "1234", name: "بنطلون", size: "L", color: "red" }, it: {}, purchaseId: "abc123", colorMap, sizeMap });
check("uses variant_codes mapping", cloth2.barcode === "1234-R-L", cloth2.barcode);

console.log("\n--- an explicit barcode always wins, both industries ---");
for (const [ind, name] of [[false, "pharmacy"], [true, "clothing"]]) {
  const r = buildLabel({ isClothing: ind, prod: { barcode: "8901234567890", code: "7060", size: "XL", color: "أسود" }, it: {}, purchaseId: "x", colorMap, sizeMap });
  check(`${name} respects a real barcode`, r.barcode === "8901234567890", r.barcode);
}

console.log("\n--- no code at all still yields a printable value ---");
// The fallback is the first 4 chars of the doc id, so "zzz999" -> "zzz9".
const noCode = buildLabel({ isClothing: false, prod: { name: "صنف" }, it: {}, purchaseId: "zzz999" });
check("falls back to a 4-char id, no dashes", noCode.barcode === "zzz9", noCode.barcode);

console.log("\n--- Arabic-only product name must not break Code128 ---");
const arab = buildLabel({ isClothing: false, prod: { name: "بنادول" }, it: {}, purchaseId: "p1" });
check("barcode stays ASCII", /^[\x20-\x7E]+$/.test(arab.barcode), JSON.stringify(arab.barcode));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
