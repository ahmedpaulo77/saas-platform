import { collection, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/** Returns a Firestore query scoped to the user's company, or the full collection for super_admin. */
export function getScopedQuery(collectionName, userRole, userCompanyId) {
  if (userRole === 'super_admin') {
    return collection(db, collectionName);
  }
  if (userCompanyId) {
    return query(collection(db, collectionName), where('companyId', '==', userCompanyId));
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

/** Scoped query for the users collection. */
export function getUsersQuery(userRole, userCompanyId) {
  return getScopedQuery('users', userRole, userCompanyId);
}
