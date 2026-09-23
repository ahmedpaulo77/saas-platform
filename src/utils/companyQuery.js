// src/utils/companyQuery.js - مع دعم createdBy وكودين
import { collection, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/** ✅ Returns a Firestore query scoped to the user's company and role */
export function getScopedQuery(collectionName, userRole, userCompanyId, _userId) {
  // ✅ لو مفيش companyId، ارجع query مش هيجيب حاجة
  if (!userCompanyId) {
    return query(collection(db, collectionName), where('companyId', '==', '__none__'));
  }

  if (userRole === 'super_admin') {
    return collection(db, collectionName);
  }

  // أدمن وموظف الشركة (بما فيهم الكاشير والمطبخ) يشوفوا بيانات الشركة (createdBy للسجل فقط)
  // ملحوظة: تقييد الشاشات لكل دور يتم من getAvailableModules، والقواعد تمنع الحذف/تعديل الأسعار لغير الأدمن
  if (userRole === 'admin' || userRole === 'user' || userRole === 'cashier' || userRole === 'kitchen') {
    return query(
      collection(db, collectionName),
      where('companyId', '==', userCompanyId)
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
 * ✅ توليد كود انضمام للشركة - آمن مع crypto.getRandomValues
 * الطول 12 حرف (مقاوم للتخمين) + بادئة اختيارية
 */
export function generateInviteCode(prefix = '') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const len = 10; // 32^10 = 1.1 تريليون احتمال
  let random = '';
  const arr = new Uint32Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) random += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) random += chars[Math.floor(Math.random() * chars.length)];
  }
  // صيغة: PREFIX-XXXX-XXXX (أسهل للقراءة والنسخ)
  const a = random.slice(0, 5);
  const b = random.slice(5, 10);
  const core = `${a}-${b}`;
  return prefix ? `${prefix.toUpperCase()}-${core}` : core;
}

/** تحقق من صيغة الكود */
export function isValidInviteCodeFormat(code) {
  if (!code || typeof code !== 'string') return false;
  const c = code.trim().toUpperCase();
  // يقبل PREFIX-XXXX-XXXX أو XXXX-XXXX أو القديم 6 حروف
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