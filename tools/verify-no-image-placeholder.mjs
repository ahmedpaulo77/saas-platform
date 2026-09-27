// Guard: a product must never get artwork standing in for its photo.
// Requirement: no photo -> show the name only. A 📦 box or a 👕 shirt implied
// the product IS a box / a shirt, which is wrong in a pharmacy, a contractor
// site or a supermarket.
//
// Deliberately narrow. It only flags a FALLBACK BRANCH on an image field.
// It must NOT flag:
//   - industry icons (icons.js: clothing -> fa-shirt) - those are section art
//   - "📦 تاجر" in translations - that is the industry's own name
//   - a <i> used as a heading next to a section title
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const SKIP = new Set(["node_modules", "build", "dist", ".git", "coverage"]);
function walk(d, acc = []) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if ([".js", ".jsx"].includes(extname(p))) acc.push(p);
  }
  return acc;
}

const IMG_FIELDS = "(?:product|prod|p|item|editingProduct|newProduct)\\.imageUrl";
// cond ? ( <img ... /> ) : ( <anything that is not an img> )
const TERNARY = new RegExp(
  IMG_FIELDS + "\\s*\\?\\s*\\(\\s*(?://[^\\n]*\\n\\s*)*<img[\\s\\S]{0,400}?\\)\\s*:\\s*\\(",
  "g"
);
// The same shape written inline without the parens.
const INLINE = new RegExp(IMG_FIELDS + "\\s*\\?\\s*<img[\\s\\S]{0,400}?\\}\\s*:\\s*", "g");

const files = walk("src");
const problems = [];

for (const f of files) {
  const text = readFileSync(f, "utf8");
  const rel = relative(process.cwd(), f);
  for (const re of [TERNARY, INLINE]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const at = m.index + m[0].length;
      const line = text.slice(0, m.index).split("\n").length;
      // show the real source that follows the ":" instead of guessing
      const after = text.slice(at, at + 120).replace(/\s+/g, " ").trim();
      problems.push(`${rel}:${line}  fallback artwork -> ${after.slice(0, 62) || "(empty)"}`);
    }
  }
  // A photo upload must still exist somewhere, or we deleted the feature.
  if (!/type="file"[^>]*accept="image/.test(text) && /imageUrl/.test(text) && rel.includes("Inventory")) {
    problems.push(`${rel}  still reads imageUrl but has no <input type="file"> - did we delete the upload?`);
  }
}

console.log(`scanned ${files.length} files for product-photo fallbacks`);

if (problems.length) {
  console.error("\nFAIL  a product-photo placeholder branch exists:");
  for (const p of problems) console.error("  " + p);
  console.error("\n  Requirement: no photo -> name only, no artwork.");
  process.exit(1);
}

console.log("OK  no product-photo placeholder - name only when there is no photo");
