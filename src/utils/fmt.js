// src/utils/fmt.js - one place for every number and date in the UI.
//
// The problem this solves: 192 call sites used toLocale*() with no locale
// argument, or with a hardcoded "ar-EG". Both are wrong. With no argument the
// output follows the *browser* language, not the app language, so a user who
// picked English could still see Arabic-formatted digits if their OS is Arabic.
// With "ar-EG" hardcoded, English mode showed Arabic dates.
//
// Rule: anything a user reads on screen goes through here, and gets the
// `locale` from useLanguage(). Print/receipt HTML is the one exception: a
// thermal receipt is always Arabic, and it is written as a literal string.

// Default so fmt() is never called with undefined. Pages pass the real
// `locale` from useLanguage(); if one forgets, we still get Arabic rather than
// the browser's language, which is the safer default for this app.
export const DEFAULT_LOCALE = "ar-EG";

function loc(locale) {
  return locale || DEFAULT_LOCALE;
}

/** Money for display: 1,500.00 or ١٬٥٠٠٫٠٠ depending on locale. */
export function money(value, locale) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(loc(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Money without the trailing .00 when it is a whole number.
 * Good for prices in a product list, where 500.00 is noise.
 */
export function moneyShort(value, locale) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(loc(locale), { maximumFractionDigits: 2 });
}

/** Plain grouped integer, no forced decimals. */
export function num(value, locale) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(loc(locale), { maximumFractionDigits: 2 });
}

/** Exactly two decimals, no grouping. For inputs and barcode-adjacent text. */
export function fixed2(value) {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/** A date, no time. Named fmtDate so imports read clearly next to fmtTime. */
export function fmtDate(value, locale) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(loc(locale));
}

/** Date and time together. */
export function fmtDateTime(value, locale) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(loc(locale));
}

/** Time only. */
export function fmtTime(value, locale) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(loc(locale));
}

/** A percent, e.g. 12.5 -> "12.5%". Handles the Arabic percent sign if needed. */
export function percent(value, locale) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return (
    n.toLocaleString(loc(locale), { maximumFractionDigits: 1 }) +
    (loc(locale).startsWith("ar") ? "٪" : "%")
  );
}

/** "من رصيد ٣٠٠٠" style distance: keeps the unit, drops the decimals. */
export function moneyLabel(value, currency, locale) {
  return `${moneyShort(value, locale)} ${currency || ""}`.trim();
}
