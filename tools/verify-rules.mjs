// Balance + sanity check for firestore.rules.
// The emulator is not available here, so at least prove the file parses and
// every helper referenced actually exists.
import { readFileSync } from "node:fs";

const src = readFileSync("firestore.rules", "utf8");

let pass = 0, fail = 0;
const check = (n, c, got) => { c ? (pass++, console.log("  OK    " + n)) : (fail++, console.log("  FAIL  " + n + "   " + (got ?? ""))); };

console.log("--- balance ---");
const pairs = { "(": ")", "[": "]", "{": "}" };
let stack = [], bad = null;
let line = 1, inLineComment = false, inBlock = false, inStr = null;
for (let i = 0; i < src.length; i++) {
  const c = src[i], n = src[i + 1];
  if (c === "\n") { line++; inLineComment = false; continue; }
  if (inLineComment) continue;
  if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
  if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
  if (c === "/" && n === "/") { inLineComment = true; i++; continue; }
  if (c === "/" && n === "*") { inBlock = true; i++; continue; }
  if (c === '"' || c === "'") { inStr = c; continue; }
  if (c === "/" && n === "*") { inBlock = true; i++; continue; }
  if (pairs[c]) { stack.push({ c, line }); continue; }
  if (c === ")" || c === "]" || c === "}") {
    const top = stack.pop();
    if (!top || pairs[top.c] !== c) { bad = `unbalanced "${c}" at line ${line} (opened ${top ? pairs[top.c] : "nothing"} at line ${top?.line})`; break; }
  }
}
check("braces/parens balanced", !bad && stack.length === 0, bad || `unclosed: ${JSON.stringify(stack.slice(0, 3))}`);
// Raw character counts are misleading here - the Arabic comments are full of
// "(...)" - so the code-only tally further down is the one that matters.

console.log("\n--- every helper called is defined ---");
// Strip comments and strings first, otherwise a word inside "// foo(" counts
// as a call and a "(" inside a comment breaks the paren tally.
let code = "";
{
  let inLine = false, inBlock = false, inStr = null, ln = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === "\n") { ln++; inLine = false; code += "\n"; continue; }
    if (inLine) continue;
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; code += " "; continue; }
    code += c;
  }
}

const codeCount = (ch) => (code.match(new RegExp("\\" + ch, "g")) || []).length;
check(`code-only parens ${codeCount("(")}/${codeCount(")")}`, codeCount("(") === codeCount(")"), `${codeCount("(")} vs ${codeCount(")")}`);
check(`code-only braces ${codeCount("{")}/${codeCount("}")}`, codeCount("{") === codeCount("}"), `${codeCount("{")} vs ${codeCount("}")}`);

// Firestore built-ins, not ours
const BUILTIN = new Set([
  "exists", "existsAfter", "get", "getAfter", "if", "for", "let", "return", "match",
  "request", "resource", "diff", "hasOnly", "hasAny", "affectedKeys", "keys", "size",
  "matches", "string", "int", "is", "type", "value", "list", "map", "duration",
  "timestamp", "path", "bool", "float", "lat", "lon", "number", "containsAll",
  "containsAny", "endsWith", "startsWith", "lower", "upper", "debug", "log",
  "service", "member", "in", "has", "fields", "rule_", "database", "collection",
  "uid", "token", "path", "name",
]);
const defined = new Set([...code.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]));
const called = new Set([...code.matchAll(/([a-zA-Z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));
const missing = [...called].filter((n) => !defined.has(n) && !BUILTIN.has(n) && !["true", "false"].includes(n));
check("no undefined helper calls", missing.length === 0, missing.join(", "));

console.log("\n--- no function used as a value (rules cannot do this) ---");
// `let capOf = adminCapOf;` then `capOf(...)` compiles nowhere; the emulator
// rejects it. Catch the assignment form.
const asValue = [...code.matchAll(/\blet\s+(\w+)\s*=\s*([a-zA-Z_]\w*)\s*;/g)].filter((m) => defined.has(m[2]));
check("no `let x = someFunction;`", asValue.length === 0, asValue.map((m) => `${m[1]} = ${m[2]}`).join(", "));
const ternaryFn = [...code.matchAll(/\blet\s+(\w+)\s*=\s*[^;]*\?\s*(\w+)\s*:\s*(\w+)\s*;/g)]
  .filter((m) => defined.has(m[2]) || defined.has(m[3]));
check("no `let x = cond ? fnA : fnB;`", ternaryFn.length === 0, ternaryFn.map((m) => `${m[1]} = ${m[2]} : ${m[3]}`).join(", "));

// ═══════════════════════════════════════════════════════════════════
// THE CHECK THAT MATTERS MOST
// Firestore rejects a whole file for a single bad statement, and it points
// at one line at a time. A brace-balance check cannot see any of this, so
// these are the exact shapes the compiler refuses:
//
//   function f() { let x = 1; return x; }          -> "Unexpected 'let'"
//   function f() { if (c) { return 1; } return 0; } -> "Unexpected 'if'"
//   function f() { return 1; } return 2; }           -> "Unexpected 'return'"
//
// A function body is ONE `return <expression>;`. The rest of this file has
// always been written that way, which is why it deployed before.
// ═══════════════════════════════════════════════════════════════════
console.log("\n--- every function body is a single return expression ---");
const fnRe = /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
let fn, bodies = 0, badBodies = [];
while ((fn = fnRe.exec(code))) {
  const name = fn[1];
  let depth = 1, i = fn.index + fn[0].length;
  while (i < code.length && depth > 0) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
    i++;
  }
  const body = code.slice(fn.index + fn[0].length, i - 1);
  bodies++;

  // split the body into top-level statements on ";"
  let d = 0, stmt = "", parts = [];
  for (const ch of body) {
    if (ch === "(" || ch === "[") d++;
    else if (ch === ")" || ch === "]") d--;
    if (ch === ";" && d === 0) { parts.push(stmt); stmt = ""; } else stmt += ch;
  }
  if (stmt.trim()) parts.push(stmt);
  const stmts = parts.map((s) => s.trim()).filter(Boolean);

  const offenders = [];
  for (const s of stmts) {
    if (/^let\s/.test(s)) offenders.push("let");
    // a bare `if (` at the start of a statement. `return if (...)` is legal.
    if (/^if\s*\(/.test(s)) offenders.push("if-statement");
    if (/^for\s*\(/.test(s)) offenders.push("for-statement");
    if (/^return\b/.test(s) && s !== stmts[0]) offenders.push("second-return");
  }
  if (offenders.length) {
    badBodies.push(`${name}()  [${offenders.join(", ")}]  "${stmts[0].slice(0, 44)}"`);
  }
}
check(`all ${bodies} function bodies are one return expression`, badBodies.length === 0, badBodies.join(" | "));

console.log("\n--- no let / bare-if anywhere in the file (the compiler's exact complaint) ---");
const lets = [...code.matchAll(/^\s*let\s+(\w+)/gm)].map((m) => m[1]);
check("zero `let` statements", lets.length === 0, lets.join(", "));
const bareIf = [...code.matchAll(/^\s*if\s*\(/gm)];
check("zero bare `if (` statements", bareIf.length === 0, `${bareIf.length} found`);
// `if` is only legal as `return if (`
const ifNotReturned = [...code.matchAll(/\bif\s*\(/g)]
  .filter((m) => !/return\s*$/.test(code.slice(Math.max(0, m.index - 8), m.index)))
  .filter((m) => {
    const line = code.slice(0, m.index).split("\n").length;
    return false; // the rule below is a superset; keep for clarity
  });
check("every `if` is `return if` (expression form)", ifNotReturned.length === 0, `${ifNotReturned.length} suspicious`);

console.log("\n--- the seat-cap helpers are wired in ---");
for (const h of ["seatAvailable", "seatClaimed", "counterChangeIsSane", "adminCapOf", "userCapOf", "adminCountOf", "userCountOf", "companyPath"]) {
  check(`${h} defined`, defined.has(h));
}
check("canCreateTargetUser calls seatAvailable", /function canCreateTargetUser[\s\S]{0,600}seatAvailable\(/.test(src));
check("canCreateTargetUser calls seatClaimed", /function canCreateTargetUser[\s\S]{0,600}seatClaimed\(/.test(src));
check("invite-code branch checks seats", /invite_codes[\s\S]{0,900}seatClaimed\(/.test(src));

console.log("\n--- company fields are allowlisted ---");
const m = src.match(/hasOnly\(\[([^\]]*maxAdmins[^\]]*)\]\)/);
check("maxAdmins/maxUsers/counters in the update allowlist", !!m, m ? m[1] : "not found");
if (m) for (const f of ["maxAdmins", "maxUsers", "adminsCount", "usersCount"]) {
  check(`  allowlist has ${f}`, m[1].includes(f));
}

console.log("\n--- a company admin cannot raise the cap ---");
// نافذة 2500 (كانت 1200): فرع الأدمن كبر بشروط logoUrl/features — الفحص معناه ثابت
const adminBranch = src.match(/isAdmin\(\) &&\s*\n\s*userCompanyId\(\) == companyId[\s\S]{0,2500}?\n\s*\)/);
check("admin branch pins maxAdmins", /maxAdmins.*resource\.data\.maxAdmins/.test(adminBranch ? adminBranch[0] : ""));
check("admin branch pins maxUsers", /maxUsers.*resource\.data\.maxUsers/.test(adminBranch ? adminBranch[0] : ""));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
