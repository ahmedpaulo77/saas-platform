// Guard: every t("key") used in src must exist in BOTH language blocks.
// A missing key renders the raw key to the user ("nav.expiry" on screen).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const translations = readFileSync("src/i18n/translations.js", "utf8");
const splitAt = translations.indexOf("\n  en:");
if (splitAt < 0) {
  console.error("FAIL  could not find the 'en:' block in src/i18n/translations.js");
  process.exit(1);
}
const ar = translations.slice(0, splitAt);
const en = translations.slice(splitAt);

const SKIP = new Set(["node_modules", "build", "dist", ".git", "coverage"]);
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if ([".js", ".jsx"].includes(extname(n))) acc.push(p);
  }
  return acc;
}

const CALL = /\bt\(\s*["'`]([a-z][\w]*(?:\.[\w]+)+)["'`]/g;
const used = new Map();
for (const f of walk("src")) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(CALL)) {
    if (!used.has(m[1])) used.set(m[1], relative(process.cwd(), f));
  }
}

const has = (block, key) => block.includes(`"${key}"`);
const missingAr = [], missingEn = [];
for (const [key, file] of used) {
  if (!has(ar, key)) missingAr.push([key, file]);
  if (!has(en, key)) missingEn.push([key, file]);
}

console.log(`scanned ${used.size} distinct t() keys across src/`);

if (!missingAr.length && !missingEn.length) {
  console.log("OK  every key resolves in both ar and en");
  process.exit(0);
}

if (missingAr.length) {
  console.error(`\nFAIL  ${missingAr.length} key(s) missing in Arabic:`);
  for (const [k, f] of missingAr) console.error(`  ${k}   (used in ${f})`);
}
if (missingEn.length) {
  console.error(`\nFAIL  ${missingEn.length} key(s) missing in English:`);
  for (const [k, f] of missingEn) console.error(`  ${k}   (used in ${f})`);
}
process.exit(1);
