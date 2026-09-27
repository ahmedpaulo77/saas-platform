// Exercise the shared receipt util without a browser.
import { buildReceiptHtml, escHtml, receiptCode } from "../src/utils/receipt.js";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  OK    " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
};

console.log("--- escHtml ---");
check("escapes < >", escHtml("<b>x</b>") === "&lt;b&gt;x&lt;/b&gt;", escHtml("<b>x</b>"));
check("escapes quotes", escHtml('a"b\'c') === "a&quot;b&#39;c", escHtml('a"b\'c'));
check("escapes & first", escHtml("a & <b>") === "a &amp; &lt;b&gt;", escHtml("a & <b>"));
check("null -> empty", escHtml(null) === "" && escHtml(undefined) === "");

console.log("\n--- receiptCode ---");
check("takes last 8 upper", receiptCode("abcdefghijklmnopqrst") === "MNOPQRST", receiptCode("abcdefghijklmnopqrst"));
check("empty id -> empty", receiptCode("") === "" && receiptCode(null) === "");
check("short id passes through", receiptCode("abc") === "ABC", receiptCode("abc"));

console.log("\n--- title per industry ---");
const item = { name: "بنادول", quantity: 2, price: 35, total: 70 };
for (const [industry, needle, why] of [
  ["clinic", "فاتورة كشف", "clinic"],
  ["restaurant", "فاتورة طلب", "restaurant"],
  ["cafe", "فاتورة طلب", "cafe"],
  ["pharmacy", "فاتورة بيع", "pharmacy"],
  ["clothing", "فاتورة بيع", "clothing"],
  ["trader", "فاتورة بيع", "trader"],
  [undefined, "فاتورة بيع", "no industry"],
]) {
  const h = buildReceiptHtml({ industry, items: [item], total: 70, subtotal: 70 });
  check(`${why} -> ${needle}`, h.includes(needle), needle);
}

console.log("\n--- XSS: hostile product name must not inject ---");
const evil = {
  name: '<img src=x onerror="window.__pwned=1">',
  quantity: 1, price: 10, total: 10,
};
const h = buildReceiptHtml({ items: [evil], total: 10, subtotal: 10 });
check("no raw <img> in output", !h.includes("<img"), "raw tag leaked");
check("escaped form present", h.includes("&lt;img src=x onerror="), "escaped tag missing");
check("no raw onerror attribute", !/onerror=/.test(h.replace(/&lt;img[^&]*onerror=/, "")), "attribute leaked");

console.log("\n--- totals block ---");
const withMoney = buildReceiptHtml({
  items: [item], subtotal: 100, discount: 10, deliveryFee: 15, total: 105, paid: 120,
});
check("subtotal shown", withMoney.includes("المجموع: 100.00"));
check("discount shown", withMoney.includes("الخصم: 10.00"));
check("delivery shown", withMoney.includes("رسوم التوصيل: 15.00"));
check("total shown", withMoney.includes("المطلوب: 105.00"));
check("change computed 15.00", withMoney.includes("الباقي: 15.00"), withMoney.match(/الباقي: [\d.]+/)?.[0]);
const noMoney = buildReceiptHtml({ items: [item], subtotal: 100, discount: 0, total: 100 });
check("no discount line when 0", !noMoney.includes("الخصم:"));
check("no change line when paid is null", !noMoney.includes("الباقي:"));

console.log("\n--- restaurant-only blocks stay out of a pharmacy receipt ---");
const pharmacy = buildReceiptHtml({
  items: [item], total: 70, subtotal: 70,
  blocks: [], // what POS passes for a pharmacy
});
check("no 'نوع الطلب' on pharmacy", !pharmacy.includes("نوع الطلب"));
const restaurant = buildReceiptHtml({
  items: [item], total: 70, subtotal: 70,
  blocks: [{ label: "نوع الطلب", value: "توصيل" }],
});
check("'نوع الطلب' present when passed", restaurant.includes("نوع الطلب"));

console.log("\n--- language ---");
const en = buildReceiptHtml({ lang: "en", items: [item], total: 70, subtotal: 70 });
check("english item header", en.includes("Item"));
check("english total due", en.includes("Total due"));
check("english dir=ltr", en.includes('dir="ltr"'));
const ar = buildReceiptHtml({ lang: "ar", items: [item], total: 70, subtotal: 70 });
check("arabic dir=rtl", ar.includes('dir="rtl"'));

console.log("\n--- item attributes (clothing size/color) ---");
const clothing = buildReceiptHtml({
  items: [{ name: "قميص", quantity: 1, price: 100, total: 100, size: "L", color: "أزرق" }],
  subtotal: 100, total: 100,
});
check("size shown", clothing.includes("المقاس: L"));
check("color shown", clothing.includes("اللون: أزرق"));

console.log("\n--- barcode / print CSS ---");
const bc = buildReceiptHtml({ items: [item], total: 70, subtotal: 70, barcode: true });
check("barcode svg rendered", bc.includes('id="invbc"'));
check("80mm print page", bc.includes("size: 80mm auto"));

console.log("\n--- empty cart must not crash ---");
const empty = buildReceiptHtml({ items: [], total: 0, subtotal: 0 });
check("renders with no items", empty.includes("</html>"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
