#!/usr/bin/env node
// tools/verify-scopes.mjs
//
// بيمسك class من الأخطاء الـ bundler **مش** بيلقطه:
// استدعاء helper معرّف في module تاني، من غير ما يتـ import.
//
// ده اللي حصل في Profits.js و Invoices.js لما وحّدنا الإيراد في
// utils/revenue.js: الدالة المحلية اتشالت، والنداء اتنسى →
// "ReferenceError: X is not defined" وقت التشغيل، والـ build نضيف.
//
// التشغيل:  npm run verify:scopes

import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** helpers we unified into shared modules — a call site MUST import them */
const SHARED = [
  // utils/revenue.js
  "invoiceRevenue", "computePeriod", "collectedAmount", "saleReturnsTotal",
  "purchaseReturnsTotal", "cogsFor", "isValidatedInvoice", "round2",
  // utils/traderUnits.js
  "stockDelta", "lineAmount", "getProductUnit", "isKgUnit", "roundQty",
  // utils/contracts.js
  "buildCertificate", "certificateNet", "certificateRemaining", "normalizeCertificate",
  "buildViewing", "normalizeViewing", "viewingDate",
  // utils/companyQuery.js
  "createCompanyInviteCodes", "getCompanyInviteCodes", "regenerateCompanyInviteCode",
  "generateInviteCode", "getScopedQuery", "canDelete", "canAccessCompanyDoc",
  // utils/returns.js
  "createReturn",
  // utils/auditLogger.js
  "logActivity",
  // components/common/PasswordStrengthMeter.js
  "validatePassword", "getPasswordStrength", "PASSWORD_POLICY", "PASSWORD_MISSING_LABEL_AR",
  // firebase/config.js
  "revokeAccountAccess", "createAuthUserWithoutSession",
  // utils/invoiceHelpers.js
  "ORDER_STATUSES", "ORDER_TYPES", "ORDER_SOURCES", "getOrderStatusConfig",
  "getSourceLabel", "buildThermalPrintHTML", "openThermalPrint",
  // utils/icons.js
  "iconFor", "INVENTORY_ICON", "PROJECTS_ICON", "APPOINTMENTS_ICON", "RAW_MATERIALS_ICON",
  // utils/companyQuery.js
  "canUpdateCompanyDoc",
  // utils/paymentMethods.js
  "getPaymentLabel", "EGYPT_PAYMENTS",
  // utils/companyQuery.js
  "canCreateForCompany", "canDeleteCompanyDoc",
];

const GLOBALS = new Set([
  "console", "window", "document", "Math", "JSON", "Object", "Array", "Number", "String",
  "Boolean", "Date", "Promise", "Map", "Set", "WeakMap", "Error", "TypeError", "RegExp",
  "parseFloat", "parseInt", "isNaN", "isFinite", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "requestAnimationFrame", "navigator", "localStorage",
  "sessionStorage", "fetch", "URL", "Blob", "File", "FileReader", "FormData", "Intl",
  "undefined", "NaN", "Infinity", "true", "false", "null", "React", "require", "arguments",
  "this", "globalThis", "structuredClone", "AbortController", "TextEncoder", "TextDecoder",
  "CSS", "DOMParser", "location", "history", "crypto", "performance", "atob", "btoa",
  "encodeURIComponent", "decodeURIComponent", "CustomEvent", "Event", "Response",
]);

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if ([".js", ".jsx"].includes(extname(p))) files.push(p);
  }
})(SRC);

let problems = 0;
const notes = [];

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  const imported = new Set();

  // import x from '...'  /  import x, { a, b as c } from '...'  /  import { a, b } from
  for (const m of src.matchAll(/import\s+([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?\s*(?:([\w$]+)\s*)?from/g)) {
    if (m[1]) imported.add(m[1]);
    if (m[2]) m[2].split(",").forEach((s) => {
      const n = s.split(/\s+as\s+/).pop().trim();
      if (/^[\w$]+$/.test(n)) imported.add(n);
    });
    if (m[3]) imported.add(m[3]);
  }
  for (const m of src.matchAll(/import\s+[\w$]+\s+from/g)) imported.add(m[1]);

  const defined = new Set(GLOBALS);
  for (const m of src.matchAll(/(?:function|class)\s+([\w$]+)/g)) defined.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=/g)) defined.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    m[1].split(",").forEach((s) => {
      const n = s.split(":").pop().split("=")[0].trim().replace(/^\.\.\./, "");
      if (/^[\w$]+$/.test(n)) defined.add(n);
    });
  }
  // destructured function params:  ({ a, b: c }) =>   AND   function f({ a, b }) {
  for (const m of src.matchAll(/\(\s*\{([^}]*)\}\s*\)\s*=>/g)) {
    m[1].split(",").forEach((s) => {
      const n = s.split(":").pop().split("=")[0].trim().replace(/^\.\.\./, "");
      if (/^[\w$]+$/.test(n)) defined.add(n);
    });
  }
  for (const m of src.matchAll(/(?:function\s+[\w$]+|=\s*(?:async\s*)?function)\s*\(\s*\{([^}]*)\}/g)) {
    m[1].split(",").forEach((s) => {
      const n = s.split(":").pop().split("=")[0].trim().replace(/^\.\.\./, "");
      if (/^[\w$]+$/.test(n)) defined.add(n);
    });
  }
  for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g)) {
    m[1].split(",").forEach((s) => {
      const n = s.split(/[:=]/)[0].replace(/[{}\[\]\s]/g, "").replace(/^\.\.\./, "");
      if (/^[\w$]+$/.test(n)) defined.add(n);
    });
  }
  // object/class method shorthand params
  for (const m of src.matchAll(/^\s*(?:async\s+)?([\w$]+)\s*\(([^)]*)\)\s*\{/gm)) {
    m[2].split(",").forEach((s) => {
      const n = s.split(/[:=]/)[0].replace(/[{}\[\]\s]/g, "");
      if (/^[\w$]+$/.test(n)) defined.add(n);
    });
  }

  for (const name of SHARED) {
    if (imported.has(name) || defined.has(name)) continue;
    const used = new RegExp("(?<![\\w$.])" + name + "\\s*\\(").test(src);
    if (used) {
      // if it looks like a destructured param of an exported fn, note not fail
      if (new RegExp("\\{[^}]*\\b" + name + "\\b[^}]*\\}\\s*\\)\\s*=>").test(src)) {
        notes.push(`${rel}  (looks like a param) ${name}()`);
        continue;
      }
      console.log(`MISSING IMPORT  ${rel}  ->  ${name}()`);
      problems++;
    }
  }
}

notes.forEach((n) => console.log(`note: ${n}`));
console.log("");
if (problems === 0) {
  console.log(`OK  no missing shared-helper imports (checked ${SHARED.length} helpers across ${files.length} files)`);
  process.exit(0);
}
console.log(`FAIL  ${problems} missing import(s) — these throw ReferenceError at runtime`);
process.exit(1);
