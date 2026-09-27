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
const adminBranch = src.match(/isAdmin\(\) &&\s*\n\s*userCompanyId\(\) == companyId[\s\S]{0,1200}?\n\s*\)/);
check("admin branch pins maxAdmins", /maxAdmins.*resource\.data\.maxAdmins/.test(adminBranch ? adminBranch[0] : ""));
check("admin branch pins maxUsers", /maxUsers.*resource\.data\.maxUsers/.test(adminBranch ? adminBranch[0] : ""));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
