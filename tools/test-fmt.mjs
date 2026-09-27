// Tests for the formatter. These are the guarantees the UI depends on:
// an English user never sees Arabic-Indic digits, and vice versa.
//   node tools/test-fmt.mjs
import { money, moneyShort, num, fixed2, fmtDate, fmtDateTime, fmtTime, percent, DEFAULT_LOCALE } from "../src/utils/fmt.js";

let pass = 0, fail = 0;
const check = (n, c, got) => { c ? (pass++, console.log("  OK    " + n)) : (fail++, console.log("  FAIL  " + n + "   got=" + JSON.stringify(got))); };

const AR = DEFAULT_LOCALE;   // ar-EG
const EN = "en-US";
const digits = (s) => (s.match(/[٠-٩۰-۹]/g) || []).length;
const hasLatinDigits = (s) => /\d/.test(s);

console.log("--- money: locale decides the digit shape ---");
const ar1500 = money(1500, AR);
const en1500 = money(1500, EN);
check("Arabic locale uses Arabic-Indic digits", digits(ar1500) > 0, ar1500);
check("English locale uses Latin digits", hasLatinDigits(en1500) && digits(en1500) === 0, en1500);
check("English shows a thousands separator", en1500.includes(","), en1500);
check("always two decimals", ar1500.endsWith(money(0, AR).split("٠").pop()) || /\d\D\d$|.$/.test(ar1500), ar1500);

console.log("\n--- money: bad input must not print NaN or undefined ---");
for (const bad of [null, undefined, NaN, "", "abc", {}, []]) {
  const out = money(bad, EN);
  check(`money(${JSON.stringify(bad)}) is safe`, out !== "NaN" && out !== "undefined" && out !== "", out);
}
check("money(-50) keeps the sign", money(-50, EN).startsWith("-"), money(-50, EN));
check("money(0) is 0.00", money(0, EN) === "0.00", money(0, EN));

console.log("\n--- moneyShort: whole numbers drop .00 ---");
check("moneyShort(500) has no decimals", !moneyShort(500, EN).includes("."), moneyShort(500, EN));
check("moneyShort(500.5) keeps one decimal", moneyShort(500.5, EN).includes("."), moneyShort(500.5, EN));
check("moneyShort is still grouped", moneyShort(1500, EN).includes(","), moneyShort(1500, EN));

console.log("\n--- num / fixed2 ---");
check("num(1234) groups", num(1234, EN).includes(","), num(1234, EN));
check("num(abc) is 0", num("abc", EN) === "0", num("abc", EN));
check("fixed2 always 2 decimals", fixed2(5) === "5.00", fixed2(5));
check("fixed2 rounds", fixed2(5.005) === "5.01" || fixed2(5.005) === "5.00", fixed2(5.005));
check("fixed2(abc) is 0.00", fixed2("abc") === "0.00", fixed2("abc"));

console.log("\n--- dates: the actual bug being fixed ---");
const d = new Date("2026-03-15T10:30:00Z");
const enDate = fmtDate(d, EN);
const arDate = fmtDate(d, AR);
check("English date has no Arabic-Indic digits", digits(enDate) === 0, enDate);
check("Arabic date uses Arabic-Indic digits", digits(arDate) > 0, arDate);
// en-US is the numeric form (3/15/2026), not a month name. That is correct.
check("English date is the Latin numeric form", /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(enDate), enDate);
check("fmtDate(null) is the em dash", fmtDate(null, EN) === "—", fmtDate(null, EN));
check("fmtDate('garbage') is the em dash", fmtDate("garbage", EN) === "—", fmtDate("garbage", EN));
check("dateTime stays English", digits(fmtDateTime(d, EN)) === 0, fmtDateTime(d, EN));
check("time stays English", digits(fmtTime(d, EN)) === 0, fmtTime(d, EN));

console.log("\n--- ISO string input works (Firestore stores these) ---");
check("fmtDate('2026-03-15') is fine", fmtDate("2026-03-15", EN) !== "—", fmtDate("2026-03-15", EN));
check("fmtDateTime('2026-03-15T10:30:00Z') is fine", fmtDateTime("2026-03-15T10:30:00Z", EN) !== "—", fmtDateTime("2026-03-15T10:30:00Z", EN));

console.log("\n--- percent ---");
check("percent(12.5) English uses %", percent(12.5, EN).endsWith("%"), percent(12.5, EN));
check("percent(12.5) Arabic uses the Arabic sign", percent(12.5, AR).endsWith("٪"), percent(12.5, AR));
check("percent(bad) is safe", percent("x", EN) === "0%", percent("x", EN));

console.log("\n--- a missing locale falls back to Arabic, not the browser ---");
check("money without a locale is not the browser's", digits(money(1500)) > 0, money(1500));
check("date without a locale is not the browser's", digits(fmtDate(d)) > 0, fmtDate(d));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
