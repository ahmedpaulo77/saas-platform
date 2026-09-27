import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Guard: every print/PDF path must survive a blocked popup.
//
// window.open(...) returns null when the browser or an extension blocks it. The
// line after that -- printWindow.document.write(html) -- then throws
// TypeError, which unmounts the page instead of just failing to print. Every
// call site needs a null check and a way for the UI to say so.

const SKIP = new Set(["node_modules", "build", "dist", ".git"]);
function walk(d, acc = []) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(js|jsx)$/.test(p)) acc.push(p);
  }
  return acc;
}

const OPEN = /(?:const|let|var)\s+(\w+)\s*=\s*window\.open\s*\(/;
const problems = [];
let sites = 0, guarded = 0;

for (const f of walk("src")) {
  const text = readFileSync(f, "utf8");
  const L = text.split(/\r?\n/);

  L.forEach((l, i) => {
    const m = l.match(OPEN);
    if (!m) return;
    sites++;
    const name = m[1];

    // the guard may be a couple of lines down (multi-line window.open args)
    const window = L.slice(i, i + 6).join("\n");
    const hasGuard = new RegExp(`if\\s*\\(\\s*!\\s*${name}\\s*\\)`).test(window);

    if (hasGuard) { guarded++; return; }
    problems.push({
      file: relative(process.cwd(), f),
      line: i + 1,
      name,
      snippet: l.trim().slice(0, 70),
    });
  });
}

console.log(`window.open call sites: ${sites}`);
console.log(`guarded against a blocked popup: ${guarded}`);

if (!problems.length) {
  console.log("\nOK  every print window checks for null before writing to it");
  process.exit(0);
}

console.log(`\nFAIL  ${problems.length} unguarded print window(s):`);
for (const p of problems) {
  console.log(`  ${p.file}:${p.line}  ${p.name}`);
  console.log(`      ${p.snippet}`);
}
console.error(`\n  Fix: \n    if (!${p.name}) { /* warn, or alert(t("common.allowPopups")) */ return false; }`);
process.exit(1);
