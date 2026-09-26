// @ts-check
// src/utils/companyQuery.js - Ù…Ø¹ Types Ø¹Ø¨Ø± JSDoc (ÙŠØ¹Ù…Ù„ Ù…Ø¹ TS Ø¨Ø¯ÙˆÙ† ÙƒØ³Ø± Ø§Ù„Ù€ build)
/**
 * @typedef {'super_admin' | 'admin' | 'user' | 'cashier' | 'kitchen'} UserRole
 * @typedef {string | null | undefined} CompanyId
 */
import { collection, query, where, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * @param {string} collectionName
 * @param {UserRole | string | null} userRole
 * @param {CompanyId} userCompanyId
 * @param {string | null} [_userId]
 * @returns {import('firebase/firestore').Query | import('firebase/firestore').CollectionReference}
 */
export function getScopedQuery(collectionName, userRole, userCompanyId, _userId) {
  if (!userCompanyId) {
    return query(collection(db, collectionName), where('companyId', '==', '__none__'));
  }
  if (userRole === 'super_admin') {
    return collection(db, collectionName);
  }
  if (userRole === 'admin' || userRole === 'user' || userRole === 'cashier' || userRole === 'kitchen') {
    return query(collection(db, collectionName), where('companyId', '==', userCompanyId));
  }
  return query(collection(db, collectionName), where('companyId', '==', '__none__'));
}

/** @param {CompanyId} userCompanyId */
export async function fetchUserCompany(userCompanyId) {
  if (!userCompanyId) return null;
  const snap = await getDoc(doc(db, 'companies', userCompanyId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** @param {string | null} userRole */
export function isSuperAdmin(userRole) {
  return userRole === 'super_admin';
}
/** @param {string | null} userRole */
export function canManageUsers(userRole) {
  return userRole === 'super_admin' || userRole === 'admin';
}
/** @param {string | null} userRole */
export function canDelete(userRole) {
  return userRole === 'super_admin' || userRole === 'admin';
}
/** @param {string | null} userRole */
export function canEditOthers(userRole) {
  return userRole === 'super_admin' || userRole === 'admin';
}
/** @param {UserRole | string | null} userRole @param {CompanyId} userCompanyId */
export function getUsersQuery(userRole, userCompanyId) {
  return getScopedQuery('users', userRole, userCompanyId);
}

/**
 * ØªÙˆÙ„ÙŠØ¯ ÙƒÙˆØ¯ Ø§Ù†Ø¶Ù…Ø§Ù… - Ø¢Ù…Ù† Ù…Ø¹ crypto.getRandomValues
 * @param {string} [prefix='']
 * @returns {string}
 */
export function generateInviteCode(prefix = '') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const len = 10;
  let random = '';
  const arr = new Uint32Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) random += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) random += chars[Math.floor(Math.random() * chars.length)];
  }
  const a = random.slice(0, 5);
  const b = random.slice(5, 10);
  const core = `${a}-${b}`;
  return prefix ? `${prefix.toUpperCase()}-${core}` : core;
}

/** @param {unknown} code @returns {boolean} */
export function isValidInviteCodeFormat(code) {
  if (!code || typeof code !== 'string') return false;
  const c = code.trim().toUpperCase();
  return /^([A-Z0-9]+-)?[A-Z2-9]{4,5}-[A-Z2-9]{4,5}$/.test(c) || /^[A-Z2-9]{6,12}$/.test(c.replace(/-/g, ''));
}
// ============================================================
// Ø£ÙƒÙˆØ§Ø¯ Ø§Ù„Ø¯Ø¹ÙˆØ©
// ============================================================
// Ù…ØµØ¯Ø± ÙˆØ§Ø­Ø¯ Ù„Ù„Ø­Ù‚ÙŠÙ‚Ø©: invite_codes/{code}  â† Signup.js Ø¨ÙŠØ­Ù‚Ù‚ Ù…Ù† Ù‡Ù†Ø§
//                                companyId = doc id Ø¨ØªØ§Ø¹ Ø§Ù„ÙƒÙˆØ¯
//                                list Ù…Ù‚ÙÙˆÙ„Ø© ÙÙŠ Ø§Ù„Ù€ RulesØŒ Ùˆ get Ø¨Ø§Ù„Ù€ id Ø¨Ø³.
//
// Ù†Ø³Ø®Ø© Ø§Ù„Ø¹Ø±Ø¶: companies/{companyId}/codes/current
//                                doc ÙˆØ§Ø­Ø¯ ÙÙŠÙ‡ Ø§Ù„ÙƒÙˆØ¯ÙŠÙ†ØŒ get Ø¨Ø§Ù„Ù€ id (Ù…ÙÙŠØ´ list)
//                                Ø¹Ø´Ø§Ù† ØµÙØ­Ø© "Ø´Ø±ÙƒØªÙŠ" ØªÙ‚Ø¯Ø± ØªØ¹Ø±Ø¶Ù‡Ù… Ù…Ù† ØºÙŠØ± Ù…Ø§
//                                ØªØ­ØªØ§Ø¬ ØªØ¹Ù…Ù„ list Ø¹Ù„Ù‰ invite_codes (Ù…Ù…Ù†ÙˆØ¹).
//
// âš ï¸ Ø§Ù„Ø­Ù‚Ù„ÙŠÙ† Ø§Ù„Ù‚Ø¯Ø§Ù… adminInviteCode/userInviteCode Ø¹Ù„Ù‰ Ù…Ø³ØªÙ†Ø¯ Ø§Ù„Ø´Ø±ÙƒØ© Ø¨Ù‚ÙˆØ§
//    Ø´ØºØ§Ù„ÙŠÙ† Ø¹Ù…Ù„ÙŠØ§Ù‹ Ø¨Ø³ Ø§ØªØ´Ø§Ù„ÙˆØ§ Ù…Ù† allowlist Ø§Ù„Ù€ companies update â€” Ù…ÙÙŠØ´
//    ÙƒÙˆØ¯ Ø¨ÙŠÙƒØªØ¨Ù‡Ù… Ø¨Ù‚Ù‰.

/**
 * Ù…Ø³Ø§Ø± Ù†Ø³Ø®Ø© Ø§Ù„Ø¹Ø±Ø¶. Ø«Ø§Ø¨ØªØ± ÙˆØ§Ø­Ø¯ (codes/current) Ù„ÙƒÙ„ Ø´Ø±ÙƒØ© â€” get Ø¨Ø§Ù„Ù€ idØŒ
 * ÙÙ…ÙÙŠØ´ list Ø®Ø§Ù„Øµ Ø¹Ù„Ù‰ Ø£ÙƒÙˆØ§Ø¯ Ø§Ù„Ø¯Ø¹ÙˆØ©.
 * @param {string} companyId
 */
function codeRef(companyId) {
  return doc(db, 'companies', companyId, 'codes', 'current');
}

/**
 * ÙŠÙ†Ø´Ø¦ ÙƒÙˆØ¯ÙŠ Ø§Ù„Ø¯Ø¹ÙˆØ© (Ø£Ø¯Ù…Ù† + Ù…Ø³ØªØ®Ø¯Ù…) Ù„Ù„Ø´Ø±ÙƒØ© ÙÙŠ Ø§Ù„Ù…ØµØ¯Ø± Ø§Ù„Ø±Ø³Ù…ÙŠ.
 * âš ï¸ Ù…Ø§ Ø¨ÙŠÙƒØªØ¨Ø´ Ù†Ø³Ø®Ø© Ø§Ù„Ø¹Ø±Ø¶ â€” Ø¯ÙŠ Ù…Ø­ØªØ§Ø¬Ø© isAdmin()ØŒ ÙˆÙˆÙ‚Øª Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø´Ø±ÙƒØ©
 *    Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ù„Ø³Ù‡ Ù…Ø§Ù„ÙˆØ´ companyIdØŒ ÙØ¨ØªØªØ¹Ù…Ù„ Ø£ÙˆÙ„ Ù…Ø§ Ø§Ù„Ø£Ø¯Ù…Ù† ÙŠÙØªØ­
 *    ØµÙØ­Ø© "Ø´Ø±ÙƒØªÙŠ" (Ø´ÙˆÙ getCompanyInviteCodes).
 * @param {string} companyId
 * @returns {Promise<Array<{role: 'admin'|'user', code: string}>>}
 */
export async function createCompanyInviteCodes(companyId) {
  if (!companyId) throw new Error('createCompanyInviteCodes: companyId required');
  const specs = [
    { role: /** @type {'admin'} */ ('admin'), code: generateInviteCode('ADMIN') },
    { role: /** @type {'user'} */ ('user'), code: generateInviteCode('USER') },
  ];
  const batch = writeBatch(db);
  specs.forEach(({ role, code }) => {
    batch.set(doc(db, 'invite_codes', code), {
      companyId,
      role,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return specs;
}

/**
 * Ø£ÙƒÙˆØ§Ø¯ Ø¯Ø¹ÙˆØ© Ø§Ù„Ø´Ø±ÙƒØ© Ù„Ù„Ø¹Ø±Ø¶. Ù„Ùˆ Ù†Ø³Ø®Ø© Ø§Ù„Ø¹Ø±Ø¶ Ù†Ø§Ù‚ØµØ© (Ø´Ø±ÙƒØ© Ù‚Ø¯ÙŠÙ…Ø© Ø£Ùˆ Ø£ÙˆÙ„ ÙØªØ­)
 * Ø¨ØªÙˆÙ„Ù‘Ø¯ Ø£ÙƒÙˆØ§Ø¯ Ø¬Ø¯ÙŠØ¯Ø© ÙÙŠ Ø§Ù„Ù…ØµØ¯Ø± Ø§Ù„Ø±Ø³Ù…ÙŠ ÙˆØ¨ØªÙƒØªØ¨ Ù†Ø³Ø®Ø© Ø§Ù„Ø¹Ø±Ø¶.
 * @param {string} companyId
 * @returns {Promise<{adminCode: string, userCode: string}>}
 */
export async function getCompanyInviteCodes(companyId) {
  if (!companyId) throw new Error('getCompanyInviteCodes: companyId required');
  const ref = codeRef(companyId);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data()?.adminCode && snap.data()?.userCode) {
    return { adminCode: snap.data().adminCode, userCode: snap.data().userCode };
  }
  // Ø£ÙˆÙ„ ÙØªØ­ Ù„Ù„Ø£Ø¯Ù…Ù† Ø¹Ù„Ù‰ Ø´Ø±ÙƒØ© Ù„Ø³Ù‡ Ù…Ø§Ù„Ù‡Ø§Ø´ Ù†Ø³Ø®Ø© Ø¹Ø±Ø¶ â†’ ÙˆÙ„Ù‘Ø¯ Ø¬Ø¯ÙŠØ¯Ø©
  const specs = await createCompanyInviteCodes(companyId);
  const adminCode = specs.find((s) => s.role === 'admin').code;
  const userCode = specs.find((s) => s.role === 'user').code;
  await setDoc(ref, { adminCode, userCode, updatedAt: serverTimestamp() });
  return { adminCode, userCode };
}

/**
 * "ØªØ¬Ø¯ÙŠØ¯" ÙƒÙˆØ¯ = Ø¥Ø¨Ø·Ø§Ù„ Ø§Ù„Ù‚Ø¯ÙŠÙ… (Ø­Ø°ÙÙ‡) + ÙƒÙˆØ¯ Ø¬Ø¯ÙŠØ¯ + ØªØ­Ø¯ÙŠØ« Ù†Ø³Ø®Ø© Ø§Ù„Ø¹Ø±Ø¶.
 * @param {string} companyId
 * @param {'admin'|'user'} role
 * @returns {Promise<string>} Ø§Ù„ÙƒÙˆØ¯ Ø§Ù„Ø¬Ø¯ÙŠØ¯
 */
export async function regenerateCompanyInviteCode(companyId, role) {
  if (!companyId) throw new Error('regenerateCompanyInviteCode: companyId required');

  // 1) Ø§Ù‚Ø±Ø£ Ù†Ø³Ø®Ø© Ø§Ù„Ø¹Ø±Ø¶ Ø¹Ø´Ø§Ù† ØªØ¨Ø·Ù„ Ø§Ù„ÙƒÙˆØ¯ Ø§Ù„Ù‚Ø¯ÙŠÙ…
  const ref = codeRef(companyId);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : null;
  const oldCode = current?.[role === 'admin' ? 'adminCode' : 'userCode'] || null;

  // 2) Ø£Ù†Ø´Ø¦ Ø§Ù„ÙƒÙˆØ¯ Ø§Ù„Ø¬Ø¯ÙŠØ¯ ÙÙŠ Ø§Ù„Ù…ØµØ¯Ø± Ø§Ù„Ø±Ø³Ù…ÙŠ
  const prefix = role === 'admin' ? 'ADMIN' : 'USER';
  const newCode = generateInviteCode(prefix);
  await setDoc(doc(db, 'invite_codes', newCode), {
    companyId,
    role,
    createdAt: serverTimestamp(),
  });

  // 3) Ø§Ø¨Ø·Ù„ Ø§Ù„Ù‚Ø¯ÙŠÙ… (best-effort â€” Ù„Ùˆ ÙØ´Ù„ØŒ Ø§Ù„ÙƒÙˆØ¯ Ø§Ù„Ù‚Ø¯ÙŠÙ… Ù„Ø³Ù‡ ØµØ§Ù„Ø­ ÙˆØ¨ÙŠØ¸Ù‡Ø± Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù…)
  if (oldCode && oldCode !== newCode) {
    try {
      await deleteDoc(doc(db, 'invite_codes', oldCode));
    } catch (e) {
      console.warn('revoke old invite code failed:', e);
    }
  }

  // 4) Ø­Ø¯Ù‘Ø« Ù†Ø³Ø®Ø© Ø§Ù„Ø¹Ø±Ø¶
  const field = role === 'admin' ? 'adminCode' : 'userCode';
  await setDoc(ref, { ...(current || {}), [field]: newCode, updatedAt: serverTimestamp() });

  return newCode;
}

export const ERROR_MESSAGES = {
  fetchUsers: 'errors.fetchUsers',
  addUser: 'errors.addUser',
  updateUser: 'errors.updateUser',
  deleteUser: 'errors.deleteUser',
  noAccess: 'errors.noAccess',
  fillFields: 'errors.fillFields',
};
