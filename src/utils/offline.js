// src/utils/offline.js — أدوات وضع عدم الاتصال
//
// القاعدة:
//  - القراءات (getDocs/getDoc): تُخدم من الكاش تلقائيًا لو البيانات
//    اتفتحت قبل كده. الدوال المرنة هنا بتجرب السيرفر أولاً، ولو رفض
//    (unavailable) بترجع الكاش صراحة بدل ما ترمي.
//  - الكتابات المفردة (addDoc/updateDoc/setDoc/batch): تُحفظ محليًا
//    وتتزامن تلقائيًا — لا تحتاج أي كود إضافي.
//  - runTransaction والعدّادات (getCount/getAggregate): **تفشل أوفلاين
//    دائمًا**. المسارات الحرجة (بيع/شراء/مرتجع) فيها فرع batch بديل.
//  - onSnapshot: مستمر من الكاش — لا تغيير مطلوب.

import {
  getDocs,
  getDocsFromCache,
  getDoc,
  getDocFromCache,
  getCountFromServer,
} from "firebase/firestore";

/** هل الجهاز أوفلاين الآن؟ */
export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isUnavail(e) {
  return e?.code === "unavailable";
}

/** قراءة قائمة: سيرفر أولاً، ثم الكاش عند انقطاع النت */
export async function getDocsResilient(q) {
  try {
    return await getDocs(q);
  } catch (e) {
    if (isUnavail(e)) return getDocsFromCache(q);
    throw e;
  }
}

/** قراءة مستند: سيرفر أولاً، ثم الكاش عند انقطاع النت */
export async function getDocResilient(ref) {
  try {
    return await getDoc(ref);
  } catch (e) {
    if (isUnavail(e)) return getDocFromCache(ref);
    throw e;
  }
}

/** عدّاد: سيرفر أولاً، ثم عدّ الكاش عند انقطاع النت */
export async function countResilient(q) {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (e) {
    if (!isUnavail(e)) throw e;
    const snap = await getDocsFromCache(q);
    return snap.size;
  }
}

/**
 * رسالة خطأ مفهومة للكاشير: خطأ "غير متاح" أثناء الانقطاع =
 * بيانات لم تُفتح من قبل، لا خطأ تقني غامض.
 * @returns true لو تم التعامل مع الخطأ (على المتصل أن ي return بعده)
 */
export function handleOfflineError(e, t, showAlert) {
  if (e?.code === "unavailable" && isOffline()) {
    showAlert(t("offline.noData"));
    return true;
  }
  return false;
}
