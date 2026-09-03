// src/firebase/config.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

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
        vapidKey: process.env.REACT_APP_FIREBASE_VAPID_KEY,
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