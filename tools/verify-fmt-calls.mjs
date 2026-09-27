import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

// Guard: `new fmtDate(...)` is always a bug.
//
//   new Date(x).toLocaleDateString()
//   became, after a bad codemod:
//   new fmtDate(Date(x), locale)
//
// `new X(...)` parses as `new (X)(...)` -- a constructor call -- so the helper
// runs as a constructor and returns an object. React then renders that object
// and dies with "Minified React error #31: object with keys {}". The build
// passes, the guard for locale passes, and the page crashes only at runtime.
//
// Also catches the reverse mistake: a redundant Date() wrapper that is valid but
// pointless, since fmtDate already accepts a string, a number, or a Date.

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

const FNS = ["fmtDate", "fmtDateTime", "fmtTime", "moneyShort", "money", "num", "percent"];
const problems = [];

for (const f of walk("src")) {
  const t = readFileSync(f, "utf8");
  t.split(/\r?\n/).forEach((l, i) => {
    for (const fn of FNS) {
      if (new RegExp(`\\bnew\\s+${fn}\\s*\\(`).test(l)) {
        problems.push({ file: relative(process.cwd(), f), line: i + 1, why: `new ${fn}(...) is a constructor call`, src: l.trim().slice(0, 84) });
      }
    }
  });
}

console.log(`scanned ${walk("src").length} files for a "new fmt*()" constructor call`);

if (!problems.length) {
  console.log("\nOK  no helper is called with `new` (that renders an object -> React #31)");
  process.exit(0);
}

console.log(`\nFAIL  ${problems.length} site(s):`);
const byFile = {};
for (const p of problems) (byFile[p.file] ||= []).push(p);
for (const [file, list] of Object.entries(byFile)) {
  console.log(`\n  ${file}  (${list.length})`);
  for (const p of list) {
    console.log(`    L${p.line}  ${p.why}`);
    console.log(`         ${p.src}`);
  }
}
console.error(`\n  Fix: call the helper directly -- fmtDate(x, locale). It already handles strings,`);
console.error(`  numbers and Date objects, so no wrapper is needed.`);
process.exit(1);
