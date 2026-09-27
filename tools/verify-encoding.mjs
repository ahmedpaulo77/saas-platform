// Guard: catch Arabic mojibake (UTF-8 bytes decoded as Windows-1252, then re-saved).
// Symptom in the browser: "Ø§Ù„ØªØ´ØºÙŠÙ„Ø§Øª" instead of "التشكيلات".
// This is invisible in a diff that only touches code, and it breaks the whole page.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ARABIC_ONE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
// Only Ø and Ù in quantity: they are the actual mojibake signature of Arabic.
// A single "é" in a French comment is fine and must not fail the build.
const MOJIBAKE_ONE = /[\u00D8\u00D9\u00C6\u00E6]/;

const ROOTS = ["src", "index.html", "firebase.json", "firestore.rules", "storage.rules"];
const EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".css", ".json", ".html", ".md"]);

function walk(p, acc = []) {
  let st;
  try { st = statSync(p); } catch { return acc; }
  if (st.isDirectory()) {
    for (const n of readdirSync(p)) {
      if (["node_modules", "build", "dist", ".git", "coverage"].includes(n)) continue;
      walk(join(p, n), acc);
    }
  } else if (EXTS.has(extname(p))) {
    acc.push(p);
  }
  return acc;
}

const files = ROOTS.flatMap((r) => walk(r));
const broken = [];
let arabic = 0, moji = 0;

for (const f of files) {
  const text = readFileSync(f, "utf8");
  // count() with a shared /g regex is safe here; .test() on a /g regex would
  // be stateful (lastIndex), which is why ONE-test variants are defined above.
  const a = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const m = (text.match(/[\u00D8\u00D9\u00C6\u00E6]/g) || []).length;
  arabic += a;
  moji += m;
  // Real corruption = lots of Ø/Ù and (almost) no Arabic to balance them.
  if (m > 20 && a < m * 0.5) broken.push({ f, a, m });
}

console.log(`scanned ${files.length} files - ${arabic} Arabic chars, ${moji} mojibake chars`);

// Sanity-check the checker itself: on a healthy repo there must be plenty of
// Arabic. If this number collapses, the counting broke and the guard is useless.
if (arabic < 1000) {
  console.error(`\nFAIL  only ${arabic} Arabic chars found repo-wide - the scanner itself is broken.`);
  process.exit(1);
}

if (broken.length) {
  console.error("\nFAIL  Arabic text is mojibake in these files:");
  for (const b of broken) console.error(`  ${relative(process.cwd(), b.f)}  arabic=${b.a} moji=${b.m}`);
  console.error("\n  Fix: read each file as UTF-8 and re-save as UTF-8. Do NOT use");
  console.error("  PowerShell Set-Content/Get-Content without -Encoding UTF8 on Arabic files,");
  console.error("  and do not pipe them through a tool that re-encodes as Latin-1.");
  process.exit(1);
}

console.log("OK  no mojibake - every Arabic string is real Arabic");
