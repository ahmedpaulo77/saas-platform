// Guard: the "الكفر" (financial coverage / reserve) box is a restaurant/cafe
// concept. It used to render for every industry except clothing, so a pharmacy
// or a contractor got a money field they never asked for.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

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

// The industry set that is allowed to show it.
const FOOD = /(restaurant|cafe)/;
const src = readFileSync("src/pages/Profits.js", "utf8");

let pass = 0, fail = 0;
const check = (n, c, got) => { c ? (pass++, console.log("  OK    " + n)) : (fail++, console.log("  FAIL  " + n + "   " + (got ?? ""))); };

console.log("--- the gate exists and is food-only ---");
check("showCoverage is defined", /const showCoverage\s*=/.test(src));
// Follow the alias instead of assuming it is inline.
const isFood = src.match(/const isFood\s*=\s*([^;]+);/);
check("isFood is restaurant/cafe only", !!isFood && FOOD.test(isFood[1]), isFood ? isFood[1] : "missing");
const gate = src.match(/const showCoverage\s*=\s*([^;]+);/);
check("showCoverage is the food alias", !!gate && /isFood/.test(gate[1]), gate ? gate[1] : "missing");
check("showCoverage is not the old !isFashion", !/showCoverage\s*=\s*!isFashion/.test(src));
// code, not comments: a leftover name in a comment is noise, not a live ref
const codeOnly = src
  .split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
  .join("\n");
check("isFashion no longer referenced in code", !/\bisFashion\b/.test(codeOnly));
check("isFashion is not mentioned at all", !/\bisFashion\b/.test(src),
  "still in a comment");

console.log("\n--- both UI surfaces are behind the gate ---");
const card = src.match(/\{showCoverage && \(\s*<div className="form-card">/);
check("the settings card is gated", !!card);
const stat = src.match(/\{showCoverage && coverageEnabled && \(/);
check("the net-after-coverage stat is gated", !!stat);
check("no leftover `!isFashion &&`", !/\{!isFashion &&/.test(src));

console.log("\n--- the writes are guarded too, not just hidden ---");
// The guard is the first thing after the early return, so look in the head of
// each function rather than trying to match its whole body.
const loader = src.match(/async function loadCoverage\(\)[\s\S]{0,260}/);
check("loadCoverage returns early when not food", !!loader && /!showCoverage\) return/.test(loader[0]),
  loader ? loader[0].slice(0, 60) : "not found");
const saver = src.match(/async function saveCoverage\(e\)[\s\S]{0,300}/);
check("saveCoverage refuses when not food", !!saver && /!showCoverage\) return/.test(saver[0]),
  saver ? saver[0].slice(0, 60) : "not found");
const math = src.match(/const coverageValue = [\s\S]{0,220}?;/);
check("coverageValue is 0 when not food", !!math && /showCoverage \?/.test(math[0]));
check("netAfterCoverage requires showCoverage", /netAfterCoverage = showCoverage && coverageEnabled/.test(src));

console.log("\n--- the Firestore read is not wasted on other industries ---");
const dep = src.match(/\}, \[userCompanyId, showCoverage\]\);/);
check("useEffect depends on showCoverage", !!dep);

console.log("\n--- no other PAGE shows it (translations are fine, they are just strings) ---");
for (const f of walk("src")) {
  if (f.endsWith("Profits.js")) continue;
  if (f.endsWith("translations.js")) continue; // key definitions, never rendered directly
  const t = readFileSync(f, "utf8");
  if (/profitCoverage|netAfterCoverage|coverageTitle|coverageEnable/.test(t)) {
    check(`${relative(process.cwd(), f)} does not touch coverage`, false, "found a reference");
  }
}
pass++; console.log("  OK    Profits.js is the only page that touches coverage");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
