/* SaaS PRO unified Service Worker:
 *  1) Offline shell — يشغّل التطبيق من الكاش عند انقطاع النت
 *     (الداتا نفسها من persistent cache بتاع Firestore).
 *  2) FCM background messages — مدمج هنا عمدًا: تسجيل SW منفصل
 *     لـ FCM كان سينتزع scope '/' ويعطّل الـ fetch handler.
 */

const SHELL_CACHE = "saas-pro-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

// FCM (compat) — للرسائل في الخلفية فقط
try {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
  );
  firebase.initializeApp({
    apiKey: "AIzaSyAcakZzub29Lp4T41TGDIMLPoFkupzd2is",
    authDomain: "saas-platform-5d7a3.firebaseapp.com",
    projectId: "saas-platform-5d7a3",
    storageBucket: "saas-platform-5d7a3.firebasestorage.app",
    messagingSenderId: "91595383960",
    appId: "1:91595383960:web:51611912db0635d2e9dced",
  });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(function (payload) {
    const title = payload.notification?.title || "إشعار جديد";
    self.registration.showNotification(title, {
      body: payload.notification?.body || "",
      icon: "/logo192.png",
      badge: "/favicon.ico",
      data: payload.data,
    });
  });
} catch (e) {
  // البيئة لا تدعم FCM (أوفلاين أول تحميل) — الأوفلاين يعمل بدونه
  console.warn("[sw] FCM init skipped:", e?.message);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // طلبات Firebase/API: دائمًا للشبكة (الأوفلاين تديره Firestore SDK نفسها)
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("cloudflare.com") ||
    url.hostname.includes("jsdelivr.net")
  ) {
    return;
  }

  // التنقل بين الصفحات: الشبكة أولاً، والكاش احتياطيًا (SPA → index.html)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // ملفات التطبيق (JS/CSS بأسماء مبصومة unique): الكاش أولاً
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request)
            .then((res) => {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
              return res;
            })
            .catch(() => caches.match("/index.html"))
      )
    );
  }
});

// ضغطة على الإشعار: ركّز نافذة مفتوحة أو افتح التطبيق
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
