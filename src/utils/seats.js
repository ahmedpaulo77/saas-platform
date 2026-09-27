// src/utils/seats.js - create a user document while respecting the company's
// seat cap, atomically.
//
// Why a transaction and not just a client-side check: two people can click
// "add user" at the same time and both read "1 of 2 used". A check outside the
// transaction lets the second write land and silently overshoot the cap.
// Inside a transaction the company document is the single point of contention:
// one of the two writes retries and then sees the real count.
//
// The rules mirror this: a user create is only allowed if the same batch bumped
// the matching counter by exactly 1 and the new value stays within the cap.
// That is what makes the cap real rather than cosmetic.

import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { counterFieldFor, limitFor, countFor, isCappedRole } from "./limits.js";

/** Thrown when the company has no seat left. Carries machine-readable fields so
 *  the UI can show a translated message instead of a raw error string. */
export class SeatLimitError extends Error {
  constructor(role, cap, used) {
    super(`seat-limit-exceeded`);
    this.name = "SeatLimitError";
    this.code = "limits/seat-exceeded";
    this.role = role;
    this.cap = cap;
    this.used = used;
  }
}

export class CompanyMissingError extends Error {
  constructor(companyId) {
    super(`company-missing:${companyId}`);
    this.name = "CompanyMissingError";
    this.code = "limits/company-missing";
  }
}

/**
 * Write the user document and claim a seat in one transaction.
 *
 * @param {object} p
 * @param {string} p.uid
 * @param {object} p.payload  the user document fields
 * @param {string} [p.companyId]  defaults to payload.companyId
 * @param {string} [p.role]       defaults to payload.role
 * @returns {Promise<{seatField: string|null, seatCount: number|null, capped: boolean}>}
 */
export async function createUserSeated({ uid, payload, companyId, role }) {
  const cid = companyId !== undefined ? companyId : payload.companyId ?? null;
  const r = role !== undefined ? role : payload.role;

  // super_admin has no company and is never capped: write straight through.
  if (!isCappedRole(r, cid)) {
    await setDoc(doc(db, "users", uid), payload);
    return { seatField: null, seatCount: null, capped: false };
  }

  const companyRef = doc(db, "companies", cid);
  const userRef = doc(db, "users", uid);
  const field = counterFieldFor(r);

  let claimed = { capped: false, cap: 0, used: 0, field };

  await runTransaction(db, async (tx) => {
    // Firestore requires every read before every write.
    const companySnap = await tx.get(companyRef);
    if (!companySnap.exists()) throw new CompanyMissingError(cid);

    const company = companySnap.data();
    const cap = limitFor(company, r);
    const used = countFor(company, r);

    // 0 = unlimited. Nothing to claim, and no counter to keep honest.
    if (cap > 0 && used >= cap) {
      throw new SeatLimitError(r, cap, used);
    }

    tx.set(userRef, payload);

    claimed = { capped: cap > 0, cap, used: used + 1, field };
    if (cap > 0) {
      // Only tracked companies carry a counter. Bumping it is what the rules
      // require alongside the user create.
      tx.update(companyRef, { [field]: used + 1 });
    }
  });

  return { seatField: claimed.field, seatCount: claimed.used, capped: claimed.capped };
}

/**
 * Give a seat back when a user is removed or deactivated, so lowering and
 * raising a cap behaves predictably. Safe to call for uncapped companies.
 */
export async function releaseUserSeat({ companyId, role, delta = -1 }) {
  if (!isCappedRole(role, companyId)) return null;
  const companyRef = doc(db, "companies", companyId);
  const field = counterFieldFor(role);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(companyRef);
    if (!snap.exists()) return null;
    const company = snap.data();
    if (limitFor(company, role) === 0) return null; // uncapped: no counter
    const next = Math.max(0, countFor(company, role) + delta);
    tx.update(companyRef, { [field]: next });
    return next;
  });
}

/** Read a company's current cap state, for showing "x / y" before saving. */
export async function readSeats(companyId) {
  const snap = await getDoc(doc(db, "companies", companyId));
  if (!snap.exists()) return null;
  const c = snap.data();
  return {
    maxAdmins: limitFor(c, "admin"),
    maxUsers: limitFor(c, "user"),
    adminsCount: countFor(c, "admin"),
    usersCount: countFor(c, "user"),
  };
}
