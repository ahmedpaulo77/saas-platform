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

import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { counterFieldFor, limitFor, countFor, isCappedRole, isAdminRole } from "./limits.js";

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

/**
 * Move one seat between pools — the missing half of the seat system.
 * Creation claimed seats but deletion/deactivation/role-change never gave
 * them back, so caps filled with ghosts and blocked valid signups.
 *
 * Pass the user's state BEFORE and AFTER the change; inactive/deleted/null
 * on either side means release-only / claim-only:
 *   delete/deactivate: moveUserSeat({ fromCompanyId, fromRole, toCompanyId: null, toRole: null })
 *   activate:          moveUserSeat({ fromCompanyId: null, fromRole: null, toCompanyId, toRole })
 *   role change:       moveUserSeat({ fromCompanyId: cid, fromRole: oldRole, toCompanyId: cid, toRole: newRole })
 *   company move:      moveUserSeat({ fromCompanyId: oldCid, fromRole, toCompanyId: newCid, toRole })
 *
 * Throws SeatLimitError when the destination pool is full (caller must abort
 * its own user-doc write in that case). No-op for super_admin either side.
 */
export async function moveUserSeat({ fromCompanyId, fromRole, toCompanyId, toRole }) {
  const rel = fromCompanyId && fromRole && fromRole !== "super_admin"
    ? { cid: fromCompanyId, field: counterFieldFor(fromRole) }
    : null;
  const claim = toCompanyId && toRole && toRole !== "super_admin"
    ? { cid: toCompanyId, role: toRole, field: counterFieldFor(toRole) }
    : null;
  if (!rel && !claim) return null;
  if (rel && claim && rel.cid === claim.cid && rel.field === claim.field) return null;

  return runTransaction(db, async (tx) => {
    // Firestore requires every read before every write.
    const ids = [...new Set([rel?.cid, claim?.cid].filter(Boolean))];
    const snaps = new Map();
    for (const id of ids) snaps.set(id, await tx.get(doc(db, "companies", id)));

    if (rel) {
      const s = snaps.get(rel.cid);
      if (s.exists()) {
        const raw = parseInt(s.data()[rel.field], 10);
        tx.update(doc(db, "companies", rel.cid), {
          [rel.field]: Math.max(0, (Number.isFinite(raw) ? raw : 0) - 1),
        });
      }
    }
    if (claim) {
      const s = snaps.get(claim.cid);
      if (!s.exists()) throw new CompanyMissingError(claim.cid);
      const c = s.data();
      const cap = limitFor(c, claim.role);
      const used = countFor(c, claim.role);
      if (cap > 0 && used >= cap) throw new SeatLimitError(claim.role, cap, used);
      if (cap > 0) tx.update(doc(db, "companies", claim.cid), { [claim.field]: used + 1 });
    }
    return true;
  });
}

/**
 * Rewrite a company's counters from the truth (active user docs).
 * Super-admin only — rules forbid arbitrary counter writes for company
 * admins (counterChangeIsSane allows ±1 steps, not jumps).
 */
export async function resyncCompanySeats(companyId) {
  const snap = await getDocs(query(collection(db, "users"), where("companyId", "==", companyId)));
  let admins = 0;
  let people = 0;
  snap.docs.forEach((d) => {
    const u = d.data();
    if (u.role === "super_admin" || u.isActive === false) return;
    if (isAdminRole(u.role)) admins++;
    else people++;
  });
  await updateDoc(doc(db, "companies", companyId), { adminsCount: admins, usersCount: people });
  return { adminsCount: admins, usersCount: people };
}
