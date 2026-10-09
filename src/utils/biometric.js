// src/utils/biometric.js - أدوات السجل الخام للبصمات (مشتركة: استيراد ملف + سحب لاحقاً)
// المبدأ: كل بصمة سجل خام واحد بمفتاح عدم تكرار، والحضور يُحتسب من اللوجات.

import * as XLSX from "xlsx";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export function normDigits(v) {
  return String(v ?? "").replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).trim();
}

function normHeader(h) {
  return normDigits(h).toLowerCase().replace(/[\s_\-]+/g, "");
}

// تخمين الأعمدة من أسمائها (عربي/إنجليزي)
export function detectColumns(headers) {
  const out = { code: -1, date: -1, time: -1, datetime: -1, name: -1 };
  const CODE = ["enroll", "enrollid", "userid", "id", "code", "badge", "badgenumber", "كود", "رقم", "كودالموظف", "رقمالموظف", "المستخدم"];
  const DT = ["datetime", "dateandtime", "التاريخوالوقت", "الوقتوالتاريخ"];
  const DATE = ["date", "day", "التاريخ", "اليوم"];
  const TIME = ["time", "clock", "checktime", "الوقت", "الساعة", "وقتالحضور"];
  const NAME = ["name", "employeename", "الاسم", "اسمالموظف"];
  headers.forEach((h, i) => {
    const n = normHeader(h);
    if (!n) return;
    if (out.datetime < 0 && DT.some((k) => n.includes(k))) { out.datetime = i; return; }
    if (out.code < 0 && CODE.some((k) => n === k || n.includes(k))) { out.code = i; return; }
    if (out.date < 0 && DATE.some((k) => n.includes(k))) { out.date = i; return; }
    if (out.time < 0 && TIME.some((k) => n.includes(k))) { out.time = i; return; }
    if (out.name < 0 && NAME.some((k) => n.includes(k))) { out.name = i; return; }
  });
  return out;
}

export function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) return reject(new Error("empty"));
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
        if (!rows || rows.length < 2) return reject(new Error("empty"));
        resolve({ headers: rows[0].map((h) => String(h ?? "")), rows: rows.slice(1) });
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Excel serial → YYYY-MM-DD
function excelSerialToDate(n) {
  const ms = Math.round((parseFloat(n) - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function toISODate(v) {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && isFinite(v) && v > 20000 && v < 80000) return excelSerialToDate(v);
  const s = normDigits(v).replace(/\./g, "/").replace(/-/g, "/");
  let m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

function toClock(v) {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && isFinite(v) && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  const s = normDigits(v).replace(/[صم]/g, "").trim();
  const m = s.match(/(\d{1,2})[:：](\d{1,2})(?::(\d{1,2}))?\s*([aApP])?/);
  if (!m) return "";
  let hh = parseInt(m[1], 10);
  const mm = String(m[2]).padStart(2, "0");
  const ap = (m[4] || "").toUpperCase();
  const isPM = ap === "P" || /مساء|pm/i.test(s);
  const isAM = ap === "A" || /صباح|am/i.test(s);
  if (isPM && hh < 12) hh += 12;
  if (isAM && hh === 12) hh = 0;
  if (hh > 23) return "";
  return `${String(hh).padStart(2, "0")}:${mm}`;
}

// صف خام → { code, name, deviceTime ISO } أو null لو ناقص
export function normalizeRow(row, mapping) {
  const cell = (i) => (i >= 0 ? row[i] : "");
  const code = normDigits(cell(mapping.code)).replace(/\s+/g, "");
  const name = String(cell(mapping.name) ?? "").trim();
  let dateStr = "";
  let clock = "";
  if (mapping.datetime >= 0) {
    const raw = cell(mapping.datetime);
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      dateStr = raw.toISOString().slice(0, 10);
      clock = `${String(raw.getHours()).padStart(2, "0")}:${String(raw.getMinutes()).padStart(2, "0")}`;
    } else {
      const s = normDigits(raw);
      const dm = s.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})|(\d{1,2}[./-]\d{1,2}[./-]\d{4})/);
      const tm = s.match(/(\d{1,2}[:：]\d{1,2}(?::\d{1,2})?)/);
      dateStr = dm ? toISODate(dm[0]) : "";
      clock = tm ? toClock(tm[0]) : "";
    }
  } else {
    dateStr = toISODate(cell(mapping.date));
    clock = toClock(cell(mapping.time));
  }
  if (!code || !dateStr || !clock) return null;
  return { code, name, deviceTime: `${dateStr}T${clock}:00`, deviceDate: dateStr, deviceClock: clock };
}

export function makeDedupeKey(companyId, sourceId, code, deviceTime) {
  return `${companyId}|${sourceId}|${code}|${deviceTime}`;
}

// يوم العمل: الوردية الليلية (نهاية <= بداية) — بصمة بعد منتصف الليل تتبع اليوم السابق
export function computeWorkDate(deviceTimeISO, shift) {
  const day = String(deviceTimeISO || "").slice(0, 10);
  if (!day || !shift?.endTime || !shift?.startTime) return day;
  const clock = String(deviceTimeISO).slice(11, 16);
  if (shift.endTime <= shift.startTime && clock && clock < shift.endTime) {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return day;
}

// فرق ساعة الجهاز عن وقت السيرفر بالدقائق (للتحذير)
export function deviceSkewMinutes(latestDeviceTimeISO, nowISO) {
  if (!latestDeviceTimeISO) return 0;
  const diff = (new Date(nowISO).getTime() - new Date(latestDeviceTimeISO).getTime()) / 60000;
  if (!isFinite(diff)) return 0;
  return Math.round(diff);
}
