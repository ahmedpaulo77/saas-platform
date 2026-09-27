// @ts-check
// src/utils/companyQuery.js - مع Types عبر JSDoc (يعمل مع TS بدون كسر الـ build)
/**
 * @typedef {'super_admin' | 'admin' | 'user' | 'cashier' | 'kitchen'} UserRole
 * @typedef {string | null | undefined} CompanyId
 */
import { collection, query, where, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config.js';

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
// ============================================================
// أكواد الدعوة
// ============================================================
// مصدر واحد للحقيقة: invite_codes/{code}  ← Signup.js بيحقق من هنا
//                                companyId = doc id بتاع الكود
//                                list مقفولة في الـ Rules، و get بالـ id بس.
//
// نسخة العرض: companies/{companyId}/codes/current
//                                doc واحد فيه الكودين، get بالـ id (مفيش list)
//                                عشان صفحة "شركتي" تقدر تعرضهم من غير ما
//                                تحتاج تعمل list على invite_codes (ممنوع).
//
// ⚠️ الحقلين القدام adminInviteCode/userInviteCode على مستند الشركة بقوا
//    شغالين عملياً بس اتشالوا من allowlist الـ companies update — مفيش
//    كود بيكتبهم بقى.

/**
 * مسار نسخة العرض. ثابتر واحد (codes/current) لكل شركة — get بالـ id،
 * فمفيش list خالص على أكواد الدعوة.
 * @param {string} companyId
 */
function codeRef(companyId) {
  return doc(db, 'companies', companyId, 'codes', 'current');
}

/**
 * ينشئ كودي الدعوة (أدمن + مستخدم) للشركة في المصدر الرسمي.
 * ⚠️ ما بيكتبش نسخة العرض — دي محتاجة isAdmin()، ووقت إنشاء الشركة
 *    المستخدم لسه مالوش companyId، فبتتعمل أول ما الأدمن يفتح
 *    صفحة "شركتي" (شوف getCompanyInviteCodes).
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
 * أكواد دعوة الشركة للعرض. لو نسخة العرض ناقصة (شركة قديمة أو أول فتح)
 * بتولّد أكواد جديدة في المصدر الرسمي وبتكتب نسخة العرض.
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
  // أول فتح للأدمن على شركة لسه مالهاش نسخة عرض → ولّد جديدة
  const specs = await createCompanyInviteCodes(companyId);
  const adminCode = specs.find((s) => s.role === 'admin').code;
  const userCode = specs.find((s) => s.role === 'user').code;
  await setDoc(ref, { adminCode, userCode, updatedAt: serverTimestamp() });
  return { adminCode, userCode };
}

/**
 * "تجديد" كود = إبطال القديم (حذفه) + كود جديد + تحديث نسخة العرض.
 * @param {string} companyId
 * @param {'admin'|'user'} role
 * @returns {Promise<string>} الكود الجديد
 */
export async function regenerateCompanyInviteCode(companyId, role) {
  if (!companyId) throw new Error('regenerateCompanyInviteCode: companyId required');

  // 1) اقرأ نسخة العرض عشان تبطل الكود القديم
  const ref = codeRef(companyId);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : null;
  const oldCode = current?.[role === 'admin' ? 'adminCode' : 'userCode'] || null;

  // 2) أنشئ الكود الجديد في المصدر الرسمي
  const prefix = role === 'admin' ? 'ADMIN' : 'USER';
  const newCode = generateInviteCode(prefix);
  await setDoc(doc(db, 'invite_codes', newCode), {
    companyId,
    role,
    createdAt: serverTimestamp(),
  });

  // 3) ابطل القديم (best-effort — لو فشل، الكود القديم لسه صالح وبيظهر للمستخدم)
  if (oldCode && oldCode !== newCode) {
    try {
      await deleteDoc(doc(db, 'invite_codes', oldCode));
    } catch (e) {
      console.warn('revoke old invite code failed:', e);
    }
  }

  // 4) حدّث نسخة العرض
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
