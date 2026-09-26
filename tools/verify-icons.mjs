#!/usr/bin/env node
// tools/verify-icons.mjs
//
// بيتأكد إن كل أيقونة `fa-*` مستعملة في src موجودة فعلاً في نسخة
// Font Awesome اللي index.html بيجيبها.
//
// ليه مهم: اسم `fa-` غلط مش بيطلع error — المتصفح بيعمل <i> فاضي
// من غير أي كلام. يعني أيقونة اختفت بصمت والحد مكتحسش.
//
// طريقة الشغل:
//   1. ينزّل all.min.css من نفس الـ CDN المستخدم في index.html
//   2. يستخرج كل أسماء الأيقونات المعرّفة فيه
//   3. يمسح كل ملفات src ويقارن
//
// التشغيل:  node tools/verify-icons.mjs
// اختياري:  node tools/verify-icons.mjs <path-to-all.min.css>   (أوفلاين)

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const CACHE = join(ROOT, "node_modules", ".cache", "fa-css");

const FA_URL = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";

// read the CDN version straight out of index.html so we can never drift
function faUrlFromIndex() {
  try {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const m = html.match(/https:\/\/[^"']*font-awesome[^"']*\/all\.min\.css/);
    return m ? m[0] : FA_URL;
  } catch {
    return FA_URL;
  }
}

async function loadCss(url) {
  const hash = createHash("md5").update(url).digest("hex");
  const cached = join(CACHE, `${hash}.css`);
  if (existsSync(cached)) return readFileSync(cached, "utf8");
  // allow an explicit local path
  if (url.includes("\\") || url.includes("/") && !url.startsWith("http")) {
    return readFileSync(url, "utf8");
  }
  console.error(`downloading ${url} ...`);
  const res = await fetch(url, { headers: { Connection: "close" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  try { res.body?.cancel?.(); } catch { /* already consumed */ }
  try {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(cached, text);
  } catch { /* cache is optional */ }
  return text;
}

const STATE_CLASSES = new Set([
  "spin", "spin-reverse", "pulse", "beat", "fade", "bounce", "shake", "flip", "stack",
  "border", "pull", "swap", "rotate", "inverse", "beat-fade", "fade", "slow", "2xs", "xs",
  "sm", "lg", "xl", "2xl", "1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x",
  "left", "right", "up", "down", "double-up", "double-down", "double-left", "double-right",
  "hstack", "vstack", "1xl", "2xl", "li", "dd", "dt", "border-t", "border-r", "border-b", "border-l",
  "rtl", "ltr", "beat", "animation", "width-auto",
]);

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if ([".js", ".jsx"].includes(extname(p))) files.push(p);
  }
})(SRC);

const url = process.argv[2] || faUrlFromIndex();
const css = await loadCss(url);

const defined = new Set();
for (const m of css.matchAll(/\.(fa-[a-z0-9-]+):before/g)) defined.add(m[1]);
for (const m of css.matchAll(/content:\s*"\\([a-z0-9- ]+)"/g)) defined.add("fa-" + m[1].trim());

const used = new Map();
for (const f of files) {
  const rel = f.replace(ROOT + "\\", "").replace(ROOT + "/", "");
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    // skip template-literal partials like fa-chevron-${...}
    for (const m of line.matchAll(/\bfa-([a-z0-9-]+)\b/g)) {
      const tail = line.slice(m.index + m[0].length, m.index + m[0].length + 3);
      if (tail.includes("${") || tail.includes("`+") || tail.includes("+ `")) continue;
      const name = "fa-" + m[1];
      if (STATE_CLASSES.has(m[1])) continue;
      if (!used.has(name)) used.set(name, new Set());
      used.get(name).add(`${rel}:${i + 1}`);
    }
  });
}

const missing = [...used.entries()].filter(([icon]) => !defined.has(icon));

console.log(`Font Awesome CSS : ${url}`);
console.log(`icons defined    : ${defined.size}`);
console.log(`icons used in src: ${used.size}`);
console.log("");

if (missing.length === 0) {
  console.log("OK  every fa-* icon used in src exists — nothing will render blank");
  process.exit(0);
}

console.log(`FAIL  ${missing.length} icon(s) DO NOT EXIST — these render as nothing:`);
for (const [icon, where] of missing) {
  console.log(`\n  ${icon}   (${where.size}x)`);
  [...where].slice(0, 4).forEach((w) => console.log(`      ${w}`));
}
console.log("\nFix: swap for a real name from the same set (see the list above),");
console.log("     or add it to src/utils/icons.js only after verifying it exists.");
process.exit(1);
