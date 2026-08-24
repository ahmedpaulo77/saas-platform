// src/utils/companyQuery.js - مع دعم createdBy وكودين
import { collection, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/** ✅ Returns a Firestore query scoped to the user's company and role */
export function getScopedQuery(collectionName, userRole, userCompanyId, userId) {
  // ✅ لو مفيش companyId، ارجع query مش هيجيب حاجة
  if (!userCompanyId) {
    return query(collection(db, collectionName), where('companyId', '==', '__none__'));
  }

  if (userRole === 'super_admin') {
    return collection(db, collectionName);
  }
  
  if (userRole === 'admin') {
    return query(
      collection(db, collectionName), 
      where('companyId', '==', userCompanyId)
    );
  }
  
  if (userRole === 'user') {
    // ✅ لو مفيش userId، ارجع query مش هيجيب حاجة
    if (!userId) {
      return query(collection(db, collectionName), where('companyId', '==', '__none__'));
    }
    return query(
      collection(db, collectionName),
      where('companyId', '==', userCompanyId),
      where('createdBy', '==', userId)
    );
  }
  
  return query(collection(db, collectionName), where('companyId', '==', '__none__'));
}

/** Fetch the current user's company document. */
export async function fetchUserCompany(userCompanyId) {
  if (!userCompanyId) return null;
  const snap = await getDoc(doc(db, 'companies', userCompanyId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Whether the user can manage all companies (super_admin only). */
export function isSuperAdmin(userRole) {
  return userRole === 'super_admin';
}

/** Whether the user can manage users (admin or super_admin). */
export function canManageUsers(userRole) {
  return userRole === 'super_admin' || userRole === 'admin';
}

/** ✅ Whether the user can delete data (admin or super_admin only). */
export function canDelete(userRole) {
  return userRole === 'super_admin' || userRole === 'admin';
}

/** ✅ Whether the user can edit others' data (admin or super_admin only). */
export function canEditOthers(userRole) {
  return userRole === 'super_admin' || userRole === 'admin';
}

/** Scoped query for the users collection. */
export function getUsersQuery(userRole, userCompanyId) {
  return getScopedQuery('users', userRole, userCompanyId);
}

/**
 * ✅ توليد كود انضمام للشركة مع بادئة
 */
export function generateInviteCode(prefix = '') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}${random}`.toUpperCase();
}

export const ERROR_MESSAGES = {
  fetchUsers: 'errors.fetchUsers',
  addUser: 'errors.addUser',
  updateUser: 'errors.updateUser',
  deleteUser: 'errors.deleteUser',
  noAccess: 'errors.noAccess',
  fillFields: 'errors.fillFields',
};