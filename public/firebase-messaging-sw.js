/* eslint-disable no-restricted-globals */
/* global importScripts, firebase */

// Service Worker for Firebase Cloud Messaging (FCM) Push Notifications

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize Firebase App
firebase.initializeApp({
  apiKey: "AIzaSyAcakZzub29Lp4T41TGDIMLPoFkupzd2is",
  authDomain: "saas-platform-5d7a3.firebaseapp.com",
  projectId: "saas-platform-5d7a3",
  storageBucket: "saas-platform-5d7a3.appspot.com",
  messagingSenderId: "1081234567890",
  appId: "1:1081234567890:web:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification?.title || 'إشعار جديد';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/logo192.png',
    badge: '/favicon.ico',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});