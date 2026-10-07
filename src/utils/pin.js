// src/utils/pin.js - البين كود (PIN) للإجراءات الحساسة (استبدال/مرتجع)
// يتخزن hash فقط (pinHash) — عمر الـ PIN الصريح ما يتخزن في Firestore.
// الصيغة: "sha256:<hex>" أو "cyrb53:<hex>" (fallback لما crypto.subtle غير متاح).

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// cyrb53 — hash بسيط وسريع للـ fallback فقط (غير آمن تشفيرياً، بس أفضل من النص الصريح)
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

function materialOf(pin, salt) {
  return `${String(pin).trim()}|${String(salt || "")}`;
}

export async function hashPin(pin, salt) {
  const material = materialOf(pin, salt);
  try {
    if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
      return `sha256:${toHex(digest)}`;
    }
  } catch {
    // ignore — fallback below
  }
  return `cyrb53:${cyrb53(material)}`;
}

export async function verifyPin(pin, storedHash, salt) {
  if (!pin || !storedHash) return false;
  const computed = await hashPin(pin, salt);
  return computed === storedHash;
}

// 4 إلى 6 أرقام فقط
export function isValidPinFormat(pin) {
  return /^[0-9]{4,6}$/.test(String(pin || "").trim());
}
