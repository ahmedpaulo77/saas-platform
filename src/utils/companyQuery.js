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

/**
 * توليد كود انضمام للشركة
 * النمط: أول 4 حروف من اسم الشركة + 4 أحرف/أرقام عشوائية
 * مثال: شركة النجاح → NGAH-9K2D
 */
export function generateInviteCode(companyName = '') {
  // استخراج الحروف الأولى من الكلمات (إنجليزي أو أرقام)
  const words = companyName.toLowerCase().replace(/[^\u0600-\u065F\w\s]/g, '').trim().split(/\s+/);
  let letters = '';
  for (const word of words) {
    // نحول الكلمات العربية لأحرف رومانية مبسطة (من الصوت) أو نأخذ أول حرف
    const first = word.replace(/[^\w]/g, '')[0] || '';
    if (first) letters += first.toUpperCase();
  }
  if (letters.length < 4) {
    // لو اسم عربي كامل أو قصير — نستخدم أحرف عشوائية
    const fallback = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    while (letters.length < 4) {
      letters += fallback[Math.floor(Math.random() * fallback.length)];
    }
  }
  letters = letters.slice(0, 4);

  // 4 أحرف عشوائية
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let random = '';
  for (let i = 0; i < 4; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }

  return `${letters}-${random}`.toUpperCase();
}
