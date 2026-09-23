// @ts-check
// src/utils/companyQuery.js - مع Types عبر JSDoc (يعمل مع TS بدون كسر الـ build)
/**
 * @typedef {'super_admin' | 'admin' | 'user' | 'cashier' | 'kitchen'} UserRole
 * @typedef {string | null | undefined} CompanyId
 */
import { collection, query, where, doc, getDoc } from 'firebase/firestore';
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
 * توليد كود انضمام - آمن مع crypto.getRandomValues
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

export const ERROR_MESSAGES = {
  fetchUsers: 'errors.fetchUsers',
  addUser: 'errors.addUser',
  updateUser: 'errors.updateUser',
  deleteUser: 'errors.deleteUser',
  noAccess: 'errors.noAccess',
  fillFields: 'errors.fillFields',
};
