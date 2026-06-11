"use strict";

const CACHE_NAME = "gotcha-mvp-v33";
const APP_SHELL = [
  "./",
  "./index.html",
  "./admin.html",
  "./admin.css?v=4",
  "./admin.js?v=4",
  "./admin.webmanifest",
  "./styles.css?v=27",
  "./supabase-config.js?v=1",
  "./app.js?v=29",
  "./hunts.json",
  "./manifest.webmanifest",
  "./images/background.png",
  "./music/Discovery.mp3",
  "./assets/gotcha-wordmark.svg",
  "./assets/gotcha-icon.svg",
  "./assets/gotcha-coin.png",
  "./assets/pringles-original-celebration.webp",
  "./assets/treasure-chest.png",
  "./assets/tablet-map-locked.webp",
  "./assets/tablet-complete.webp",
  "./assets/tablet-fragment-1.webp",
  "./assets/tablet-fragment-2.webp",
  "./assets/tablet-fragment-3.webp",
  "./assets/tablet-fragment-4.webp",
  "./assets/tablet-fragment-5.webp",
  "./assets/tablet-fragment-6.webp",
  "./assets/vendor/html5-qrcode-2.3.8.min.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)
        .then(cached => cached || caches.match("./index.html")))
  );
});
