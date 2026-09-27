import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

// Guard: no physical direction properties where the intent is "this side".
//
//   textAlign: "left" / "right"   ->  "start" / "end"
//   marginRight: "auto"           ->  marginInlineEnd: "auto"
//
// Both are in an RTL app that also renders English, so a physical value points
// the wrong way the moment the language flips.
//
// NOT flagged, and this matters:
//   - marginLeft/marginRight used as a small 4-12px icon gap. A gap looks the
//     same either way, so "fixing" 120 lines buys nothing and risks a diff.
//   - anything inside a print/receipt template: an 80mm receipt is Arabic.
//   - textAlign paired with an explicit direction:"ltr" (barcode input, a
//     Latin-only number) -- that pairing is deliberate and correct.

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

const FN_START = /^\s*(export\s+)?(async\s+)?function\s+\w+/;
const ARROW_START = /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s*)?(\([^)]*\)|\w+)\s*=>\s*\{\s*$/;
const PRINT_FN = /^\s*(export\s+)?(async\s+)?function\s+\w*(print|Print|receipt|Receipt|thermal|Thermal|xlsx|Xlsx|export|Export)\w*\s*\(/;

function inPrintTemplate(lines, i) {
  const line = lines[i];
  if (/(<!DOCTYPE html)|(window\.open)|(document\.write)|(XLSX\.(write|json_to_sheet|aoa_to_sheet))/.test(line)) return true;
  let fnAt = -1;
  for (let k = i; k >= 0 && k > i - 400; k--) {
    if (FN_START.test(lines[k]) || ARROW_START.test(lines[k])) { fnAt = k; break; }
  }
  return fnAt >= 0 && PRINT_FN.test(lines[fnAt]);
}

const problems = [];
let autoGaps = 0, ltrPaired = 0;

for (const f of walk("src")) {
  const text = readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);

  lines.forEach((l, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(l)) return;
    if (inPrintTemplate(lines, i)) return;

    // an explicit direction on the same line makes the physical value correct
    const ltrPair = /direction:\s*["']ltr["']/.test(l) || /direction=\{"ltr"\}/.test(l);

    // marginRight/marginLeft: "auto"
    const auto = l.match(/\b(marginRight|marginLeft):\s*["']auto["']/);
    if (auto) {
      problems.push({ file: relative(process.cwd(), f), line: i + 1, what: `${auto[1]}: "auto"`, src: l.trim().slice(0, 78) });
    } else {
      // textAlign: left/right on its own (not a 4-12px gap)
      const ta = l.match(/textAlign:\s*["'](left|right)["']/);
      if (ta) {
        if (ltrPair) { ltrPaired++; }
        else {
          problems.push({ file: relative(process.cwd(), f), line: i + 1, what: `textAlign: "${ta[1]}"`, src: l.trim().slice(0, 78) });
        }
      } else {
        // count the small icon gaps we are deliberately leaving alone
        const gap = l.match(/\b(marginRight|marginLeft):\s*(\d+|"\d+px")/);
        if (gap) {
          const v = parseInt(gap[2].replace(/"/g, ""), 10);
          if (v <= 12) autoGaps++;
        }
      }
    }
  });
}

console.log(`scanned ${walk("src").length} files`);
console.log(`small directional gaps left as-is (visually identical): ${autoGaps}`);
console.log(`textAlign paired with an explicit direction:ltr (correct): ${ltrPaired}`);

if (!problems.length) {
  console.log("\nOK  no physical direction property that would break when the language flips");
  process.exit(0);
}

console.log(`\nFAIL  ${problems.length} site(s):`);
const byFile = {};
for (const p of problems) (byFile[p.file] ||= []).push(p);
for (const [file, list] of Object.entries(byFile)) {
  console.log(`\n  ${file}  (${list.length})`);
  for (const p of list) {
    console.log(`    L${p.line}  ${p.what}`);
    console.log(`         ${p.src}`);
  }
}
console.error(`\n  Fix: use "start"/"end" for textAlign, and marginInlineEnd/marginInlineStart for auto margins.`);
process.exit(1);
