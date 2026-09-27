import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

// Guard: every number and date a user reads on screen must respect the app's
// language.
//
// The bug this catches: `x.toLocaleString()` with no locale follows the
// BROWSER's language, so an Arabic-OS browser shows Arabic-Indic digits even
// after the user picked English. And `toLocaleString("ar-EG")` hardcoded is
// worse: English mode still shows Arabic dates.
//
// Exempt by design:
//   - 80mm receipts / print templates / label HTML  (Arabic thermal print)
//   - Excel export and the filename it writes (XLSX has no locale concept)
//   - src/utils/fmt.js itself, which is the fix
//
// "Exempt" has to mean *this line is part of a generated document*, not "there
// happens to be a print function somewhere above it". A 45-line lookback gave
// false positives, so the test is structural: an unclosed template literal on
// the same logical line, or a same-line write/print/document marker.

const SKIP = new Set(["node_modules", "build", "dist", ".git", "coverage"]);
const EXTS = new Set([".js", ".jsx"]);

function walk(d, acc = []) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (EXTS.has(extname(p))) acc.push(p);
  }
  return acc;
}

const PRINT_HINT = /writeFile|window\.open|document\.write|printContent|receiptHtml|barcodeHtml|<!DOCTYPE html>|XLSX\.|json_to_sheet|aoa_to_sheet/;
// A call is exempt when it sits inside a print / label / receipt / xlsx
// template. Checking a lookback window produced false positives (a call right
// after a print helper was flagged), so instead look for the template markers
// *on the same line* or inside an unclosed template literal.
// Is this call part of a generated document (receipt, label, print, xlsx)?
//
// Not by proximity: a 45-line lookback flagged real on-screen calls sitting just
// below a print helper. Instead, find the enclosing function and check its name,
// plus same-line markers. A print document always lives in a function whose name
// says so, and the call is either on the marker line or a line or two below it
// inside the template.
// Match on the function NAME only. Matching the body was wrong: any function
// that happens to contain a print helper got every call inside it exempted,
// which hid real on-screen bugs in the same file.
const PRINT_FN = /^\s*(export\s+)?(async\s+)?function\s+\w*(print|Print|Receipt|receipt|ReceiptHtml|Thermal|thermal|Xlsx|xlsx|Export|export)\w*\s*\(/;

function isExempt(lines, i) {
  const line = lines[i];

  // Same-line markers: a document doctype, a write/print call, an Excel call.
  if (/(<!DOCTYPE html)|(window\.open)|(document\.write)|(XLSX\.(write|json_to_sheet|aoa_to_sheet))|(printReceipt\()/.test(line)) return true;

  // Walk back to the enclosing function definition.
  // A `const x = (…) => {` is also a boundary, but so is a plain `const x = expr;`
  // line inside a function body, which is why the arrow form must require the
  // opening brace on the same line.
  const FN_START = /^\s*(export\s+)?(async\s+)?function\s+\w+/;
  const ARROW_START = /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s*)?(\([^)]*\)|\w+)\s*=>\s*\{\s*$/;
  let fnAt = -1;
  for (let k = i; k >= 0 && k > i - 400; k--) {
    if (FN_START.test(lines[k]) || ARROW_START.test(lines[k])) { fnAt = k; break; }
  }
  if (fnAt < 0) return false;
  if (!PRINT_FN.test(lines[fnAt])) return false;

  // Inside a document-building function the call is part of the document.
  return true;
}

const problems = [];
let scanned = 0, calls = 0, exempt = 0;

for (const f of walk("src")) {
  if (f.endsWith(join("utils", "fmt.js"))) continue;
  scanned++;
  const text = readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  const isReceiptModule = /[\\/](receipt|invoiceHelpers)\.js$/.test(f);

  lines.forEach((l, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(l)) return;

    // no-arg calls: toLocaleString() / toLocaleDateString() / toLocaleTimeString()
    const noArg = l.match(/\.toLocale(String|DateString|TimeString)\(\s*\)/g);
    // hardcoded locale: toLocaleString("ar-EG")
    const hard = l.match(/\.toLocale(String|DateString|TimeString)\(\s*["'](ar-EG|en-US|en-GB)["']\s*\)/g);
    if (!noArg && !hard) return;

    if (isExempt(lines, i) || isReceiptModule) { exempt += (noArg || []).length + (hard || []).length; return; }

    calls += (noArg || []).length + (hard || []).length;
    problems.push({
      file: relative(process.cwd(), f),
      line: i + 1,
      what: [...(noArg || []), ...(hard || [])].join(", "),
      src: l.trim().slice(0, 84),
    });
  });
}

console.log(`scanned ${scanned} files`);
console.log(`on-screen toLocale*() calls that ignore the app language: ${calls}`);
console.log(`print / xlsx calls correctly left alone:              ${exempt}`);

if (!problems.length) {
  console.log("\nOK  every on-screen number and date follows the app language");
  process.exit(0);
}

console.log(`\nFAIL  ${problems.length} line(s):`);
const byFile = {};
for (const p of problems) (byFile[p.file] ||= []).push(p);
for (const [file, list] of Object.entries(byFile)) {
  console.log(`\n  ${file}  (${list.length})`);
  for (const p of list.slice(0, 6)) {
    console.log(`    L${p.line}  ${p.what}`);
    console.log(`         ${p.src}`);
  }
  if (list.length > 6) console.log(`    ... and ${list.length - 6} more`);
}
console.error(`\n  Fix: use the helpers in src/utils/fmt.js and pass \`locale\` from useLanguage().`);
process.exit(1);
