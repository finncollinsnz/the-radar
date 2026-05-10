/* --- Firebase Messaging (background push) --- */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBFd7Atmv0AKjQnJ5edPo2PbSXD8rUv2to",
  authDomain: "the-radar-7ab6a.firebaseapp.com",
  projectId: "the-radar-7ab6a",
  storageBucket: "the-radar-7ab6a.firebasestorage.app",
  messagingSenderId: "413085082855",
  appId: "1:413085082855:web:683492011a45bee78bee42",
  measurementId: "G-1N2W6X9CKW"
});

const messaging = firebase.messaging();

// Optional: display notifications when a push arrives in the background
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "The Radar";
  const body  = payload.notification?.body  || "New activity";
  self.registration.showNotification(title, { body });
});

/* --- PWA app shell (installability + simple offline) --- */
const CACHE = "app-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Handle navigations (full page loads) with a network-first, offline-fallback strategy
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html"))
    );
  }
  // Let all other requests pass through
});
