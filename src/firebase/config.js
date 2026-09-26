// src/firebase/config.js
import { initializeApp, getApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as signOutAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

function envVal(viteKey, craKey) {
  try {
    const meta = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
    if (meta[viteKey]) return meta[viteKey];
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env[craKey]) return process.env[craKey];
      if (process.env[viteKey]) return process.env[viteKey];
    }
  } catch {}
  return '';
}
const firebaseConfig = {
  apiKey: envVal('VITE_FIREBASE_API_KEY', 'REACT_APP_FIREBASE_API_KEY') || "AIzaSyAcakZzub29Lp4T41TGDIMLPoFkupzd2is",
  authDomain: envVal('VITE_FIREBASE_AUTH_DOMAIN', 'REACT_APP_FIREBASE_AUTH_DOMAIN') || "saas-platform-5d7a3.firebaseapp.com",
  projectId: envVal('VITE_FIREBASE_PROJECT_ID', 'REACT_APP_FIREBASE_PROJECT_ID') || "saas-platform-5d7a3",
  storageBucket: envVal('VITE_FIREBASE_STORAGE_BUCKET', 'REACT_APP_FIREBASE_STORAGE_BUCKET') || "saas-platform-5d7a3.firebasestorage.app",
  messagingSenderId: envVal('VITE_FIREBASE_MESSAGING_SENDER_ID', 'REACT_APP_FIREBASE_MESSAGING_SENDER_ID') || "91595383960",
  appId: envVal('VITE_FIREBASE_APP_ID', 'REACT_APP_FIREBASE_APP_ID') || "1:91595383960:web:51611912db0635d2e9dced",
};
if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("your_")) {
  console.error("Firebase config missing apiKey", firebaseConfig);
}

const app = initializeApp(firebaseConfig);

let secondaryApp;
try {
  secondaryApp = getApp("Secondary");
} catch {
  secondaryApp = initializeApp(firebaseConfig, "Secondary");
}

export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);
export const db = getFirestore(app);
export const storage = getStorage(app);

/**
 * إنشاء حساب Auth من غير تبديل جلسة المستخدم الحالي
 * (تطبيق Firebase ثانوي ثم تسجيل خروج منه)
 */
export async function createAuthUserWithoutSession(email, password) {
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const result = { uid: cred.user.uid, email: cred.user.email };
  await signOutAuth(secondaryAuth);
  return result;
}

/**
 * إبطال حساب: بعت إيميل إعادة تعيين الباسورد.
 *
 * ⚠️ ليه مش بنستخدم deleteAuthUser؟
 *    Firebase **مش بيسمح** بحذف حساب مستخدم تاني من الـ client بدون
 *    باسورده أو re-auth كـ هو أو الـ Admin SDK (سيرفر). فأي كود بيقول
 *    "deleteUser" على مستخدم تاني من المتصفح **مش هيشتغل** (أو هيطلب
 *    باسورد، وهو مش أمان).
 *
 *    الحل الصح في تطبيق client-only: **soft delete** —
 *      1) نوقف المستند بـ isActive: false  → الـ Rules (fullyActive) بتمنع
 *         كل وصول فورًا. الحساب مش بيفتح أي صفحة.
 *      2) نبعت reset email → الباسورد القديم يبطّل يشتغل.
 * المستند بيتسابه (مش بيتحذف) عن قصد، لأن الـ Rules بتعتبر الـ uid
 *    اللي مالهوش doc "نشط" — فالحذف كان هيفتح الحساب تاني.
 *
 * @param {string} email
 * @returns {Promise<boolean>} هل اتبعت الإيميل؟
 */
export async function revokeAccountAccess(email) {
  if (!email) return false;
  try {
    await sendPasswordResetEmail(auth, email);
    return true;
  } catch (e) {
    console.error("revokeAccountAccess: reset email failed:", e?.message);
    return false;
  }
}

// تفعيل Firebase Messaging للمتصفحات التي تدعم Web Push Notifications
export const messaging = typeof window !== "undefined" && "serviceWorker" in navigator 
  ? getMessaging(app) 
  : null;

/**
 * طلب الإذن والحصول على FCM Token للـ Push Notifications
 */
export async function requestNotificationPermission() {
  if (!messaging) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getToken(messaging, {
        vapidKey: envVal('VITE_FIREBASE_VAPID_KEY', 'REACT_APP_FIREBASE_VAPID_KEY'),
      });
      return token;
    }
  } catch (error) {
    console.error("An error occurred while retrieving FCM token: ", error);
  }
  return null;
}

/**
 * حفظ FCM Token في Firestore للمستخدم الحالي
 */
export async function saveFCMToken(userId, companyId, token) {
  if (!userId || !token) return false;
  try {
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(db, "fcm_tokens", userId), {
      token,
      userId,
      companyId: companyId || null,
      updatedAt: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    }, { merge: true });
    return true;
  } catch (error) {
    console.error("Error saving FCM token:", error);
    return false;
  }
}

/**
 * الاستماع للرسائل في المقدمة (foreground)
 */
export function onForegroundMessage(callback) {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
}

/**
 * تهيئة الإشعارات الكاملة (طلب الإذن + حفظ التوكن + الاستماع)
 */
export async function initializePushNotifications(userId, companyId) {
  if (!messaging || !userId) return null;
  
  try {
    // 1. تسجيل Service Worker
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('Service Worker registered for push notifications');
    }
    
    // 2. طلب الإذن والحصول على التوكن
    const token = await requestNotificationPermission();
    if (token) {
      // 3. حفظ التوكن
      await saveFCMToken(userId, companyId, token);
      
      // 4. الاستماع للرسائل في المقدمة
      onForegroundMessage((payload) => {
        console.log('Foreground message received:', payload);
        // يمكن إضافة toast notification هنا
        if (payload.notification) {
          // إظهار إشعار في التطبيق
          const event = new CustomEvent('pushNotification', { 
            detail: payload 
          });
          window.dispatchEvent(event);
        }
      });
      
      return token;
    }
  } catch (error) {
    console.error("Error initializing push notifications:", error);
  }
  return null;
}

export default app;