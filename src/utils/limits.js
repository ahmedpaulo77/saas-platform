// src/utils/limits.js - per-company seat caps.
//
// A company has two independent caps, set by the super admin:
//   maxAdmins  - how many admin accounts it may have
//   maxUsers   - how many non-admin accounts it may have
// 0 (or missing) means unlimited, which is how every company starts.
//
// Counts live on the company doc (adminsCount / usersCount) because Firestore
// rules cannot count a collection. The super admin screen recomputes them from
// the users collection so a drifted counter can be corrected with one click.

/** Roles that consume the maxUsers cap. Everything else that is not an admin
 *  (cashier, kitchen, user, ...) shares the same user pool. */
export const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export function isAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

/** super_admin accounts are not attached to a company, so they are never capped. */
export function isCappedRole(role, companyId) {
  return !!companyId && role !== "super_admin";
}

export function limitFor(company, role) {
  if (!company) return 0;
  const raw = isAdminRole(role) ? company.maxAdmins : company.maxUsers;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function countFor(company, role) {
  if (!company) return 0;
  const raw = isAdminRole(role) ? company.adminsCount : company.usersCount;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isUnlimited(company, role) {
  return limitFor(company, role) === 0;
}

/** Infinity when there is no cap. */
export function seatsLeft(company, role) {
  const cap = limitFor(company, role);
  if (cap === 0) return Infinity;
  return Math.max(0, cap - countFor(company, role));
}

export function isAtCap(company, role) {
  return seatsLeft(company, role) <= 0;
}

/** { used, cap, unlimited, left, over } - everything the UI needs to render a cell. */
export function seatStatus(company, role, liveCount) {
  const used = Number.isFinite(liveCount) ? liveCount : countFor(company, role);
  const cap = limitFor(company, role);
  const unlimited = cap === 0;
  return {
    used,
    cap,
    unlimited,
    left: unlimited ? Infinity : Math.max(0, cap - used),
    over: !unlimited && used > cap,
  };
}

/** The counter field this role consumes, for building the Firestore patch. */
export function counterFieldFor(role) {
  return isAdminRole(role) ? "adminsCount" : "usersCount";
}

/**
 * Recount a company's seats from its user documents.
 * This is the truth; the stored counters are just a rules-readable cache.
 */
export function tallyCompany(companyId, users) {
  let admins = 0;
  let people = 0;
  for (const u of users) {
    if (u.companyId !== companyId) continue;
    if (u.role === "super_admin") continue;
    if (isAdminRole(u.role)) admins++;
    else people++;
  }
  return { adminsCount: admins, usersCount: people };
}

/** Normalise whatever the super admin typed into a stored value. */
export function parseLimitInput(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
