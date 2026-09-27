import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

// Verify every relative import in src resolves as Node resolves it, i.e. with
// the extension spelled out. Vite is lenient; Node is not, and that gap is
// exactly how a bad path (../utils/fmt from inside src/utils) survived.

function walk(d, acc = []) {
  for (const n of readdirSync(d)) {
    if (["node_modules", "build", "dist", ".git"].includes(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(js|jsx)$/.test(p)) acc.push(p);
  }
  return acc;
}

const EXT_OK = /\.(js|jsx|json|css|mjs|cjs)$/;
let bad = 0, noExt = 0;

for (const f of walk("src")) {
  const t = readFileSync(f, "utf8");
  for (const m of t.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const spec = m[1];
    const line = t.slice(0, m.index).split("\n").length;
    const full = resolve(dirname(f), spec);
    const ok =
      existsSync(full) ||
      existsSync(full + ".js") ||
      existsSync(full + ".jsx") ||
      existsSync(join(full, "index.js"));
    if (!ok) {
      console.log(`  BROKEN  ${relative(process.cwd(), f)}:${line}  ->  ${spec}`);
      bad++;
    } else if (!EXT_OK.test(spec)) {
      noExt++;
      if (noExt <= 6) {
        console.log(`  no extension (Vite is fine, Node is not)  ${relative(process.cwd(), f)}:${line}  ->  ${spec}`);
      }
    }
  }
}

console.log(`\nbroken: ${bad}   resolvable but extension-less: ${noExt}`);
process.exit(bad ? 1 : 0);
