import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

// Guard: a button that shows only an icon must have an accessible name.
//
// An earlier version of this check stripped `{...}` wholesale, so a button
// reading <i/> {t("common.save")} looked nameless. Keep the t() key.

const SKIP = new Set(["node_modules", "build", "dist", ".git"]);
function walk(d, acc = []) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if ([".js", ".jsx"].includes(extname(p))) acc.push(p);
  }
  return acc;
}

function labelOf(inner) {
  const tCalls = [...inner.matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g)].map((m) => m[1]);
  const literal = inner
    .replace(/<[^>]+>/g, " ")
    .replace(/\{(?:[^{}]|\{[^{}]*\})*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (literal) return literal;
  if (tCalls.length) return tCalls.join(",");
  const w = inner.match(/>\s*([A-Za-z\u0600-\u06FF][^<>{}]{1,30})\s*</);
  if (w) return w[1];
  return "";
}

const problems = [];
let total = 0, iconOnly = 0;

for (const f of walk("src")) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/<button\b([\s\S]*?)>([\s\S]*?)<\/button>/g)) {
    total++;
    const [, attrs, inner] = m;
    if (attrs.includes("aria-label") || attrs.includes("title=")) continue;
    if (!/<i\s+className=/.test(inner)) continue;
    if (labelOf(inner)) continue;
    iconOnly++;
    const line = text.slice(0, m.index).split("\n").length;
    problems.push({ file: relative(process.cwd(), f), line, snippet: inner.replace(/\s+/g, " ").trim().slice(0, 72) });
  }
}

console.log(`<button> elements: ${total}`);
console.log(`icon-only buttons: ${iconOnly - problems.length} named, ${problems.length} unnamed`);

if (!problems.length) {
  console.log("\nOK  every icon-only button has a title or aria-label");
  process.exit(0);
}

console.log(`\nFAIL  ${problems.length} icon-only button(s) with no accessible name:`);
for (const p of problems) {
  console.log(`  ${p.file}:${p.line}`);
  console.log(`      ${p.snippet}`);
}
console.error(`\n  Fix: add title={t("...")} (also gives the mouse a hint) or aria-label.`);
process.exit(1);
