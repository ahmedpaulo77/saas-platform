import { readFileSync } from "node:fs";

// Run the real exportInvoicePDF against a realistic invoice, capture the HTML
// it writes, and assert on the output. No browser needed: stub window.open.

const captured = { html: null, blocked: false };
globalThis.window = {
  open: () => ({
    document: {
      write: (h) => { captured.html = h; },
      close: () => {},
    },
  }),
};
// moneyShort comes from ../utils/fmt which resolves fine from src/utils
const { exportInvoicePDF } = await import("../src/utils/pdfExport.js");
const { moneyShort } = await import("../src/utils/fmt.js");

let pass = 0, fail = 0;
const check = (n, c, got) => { c ? (pass++, console.log("  OK    " + n)) : (fail++, console.log("  FAIL  " + n + "   " + (got ?? ""))); };

// A real invoice as Invoices.js / InvoiceForm.jsx write it.
const invoice = {
  id: "inv-1",
  date: "2026-03-15T10:00:00Z",
  amount: "450.00",
  clientId: "c1",
  products: [
    { productId: "p1", quantity: "2", amount: "300.00" },
    { productId: "p2", quantity: "1", amount: "150.00" },
  ],
  __products: [
    { id: "p1", name: "بنادول" },
    { id: "p2", name: "فيتامين د" },
  ],
};

console.log("--- the PDF renders at all ---");
const r = exportInvoicePDF(invoice, "أحمد", "بنادول, فيتامين د", "invoice", "ar-EG");
check("returns true", r === true, r);
check("wrote a document", !!captured.html);
const html = captured.html || "";
check("is a full HTML document", html.includes("<!DOCTYPE html>") && html.includes("</html>"));

console.log("\n--- it no longer prints 0 for money (the actual bug) ---");
const ar = moneyShort(450, "ar-EG");
check("total uses the locale digits, not 0", html.includes(ar), `expected ${ar}, got ${(html.match(/>[^<]*ج\.م/g) || []).slice(0, 3)}`);
check("no zero in a money cell", !new RegExp(">\\s*" + moneyShort(0, "ar-EG") + "\\s*ج").test(html), (html.match(/>\s*[٠-٩0-9.]+\s*ج\.م/g) || []).join(" "));
check("unit price uses the locale digits", html.includes(moneyShort(150, "ar-EG")));

console.log("\n--- it lists every line, not one blank row ---");
check("first line name present", html.includes("بنادول"));
check("second line name present", html.includes("فيتامين د"));
const rowCount = (html.match(/<tr>/g) || []).length;
check("more than one body row", rowCount >= 3, `${rowCount} <tr> total (incl. header)`);

console.log("\n--- dates follow the requested locale ---");
check("Arabic date form present", /٢٠٢٦|2026/.test(html), "no year found");
const enR = (() => { captured.html = null; exportInvoicePDF(invoice, "Ahmed", "Bandol", "invoice", "en-US"); return captured.html; })();
check("English run produced a document", !!enR);
check("English total uses Latin digits", (enR || "").includes(moneyShort(450, "en-US")));

console.log("\n--- it survives a blocked popup instead of throwing ---");
globalThis.window = { open: () => null };
let threw = false, res;
try { res = exportInvoicePDF(invoice, "أحمد", "x", "invoice", "ar-EG"); } catch (e) { threw = true; }
check("does not throw", !threw);
check("returns false so the UI can warn", res === false, res);

console.log("\n--- an invoice with no line items still renders ---");
globalThis.window = { open: () => ({ document: { write: (h) => { captured.html = h; }, close: () => {} } }) };
captured.html = null;
const bare = exportInvoicePDF({ date: "2026-03-15", amount: "99.00" }, "عميل", "منتج", "invoice", "ar-EG");
check("renders with no items", bare === true && !!captured.html);
check("shows the 99 total", (captured.html || "").includes(moneyShort(99, "ar-EG")));

console.log("\n--- XSS: a name with markup cannot break the document ---");
captured.html = null;
const evil = { ...invoice, products: [{ productId: "p1", quantity: "1", amount: "10" }], __products: [{ id: "p1", name: "<script>alert(1)</script>" }] };
exportInvoicePDF(evil, "<b>client</b>", "x", "invoice", "ar-EG");
check("script tag stripped from the name", !(captured.html || "").includes("<script>alert(1)</script>"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
