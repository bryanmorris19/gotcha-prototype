"use strict";

const CACHE_NAME = "gotcha-mvp-v56";
const APP_SHELL = [
  "./",
  "./index.html",
  "./404.html",
  "./admin.html",
  "./admin.css?v=4",
  "./admin.js?v=4",
  "./admin.webmanifest",
  "./styles.css?v=45",
  "./supabase-config.js?v=1",
  "./app.js?v=44",
  "./hunts.json",
  "./manifest.webmanifest",
  "./images/background.png",
  "./music/Discovery.mp3",
  "./assets/gotcha-wordmark.svg",
  "./assets/gotcha-icon.svg",
  "./assets/gotcha-coin.png",
  "./assets/collections-screen.webp",
  "./assets/gotcha-opening-screen.webp",
  "./assets/inventory-screen.webp",
  "./assets/map-treasure-chest-cutout.png",
  "./assets/profile-screen.webp",
  "./assets/treasure-map-screen-overlay.webp",
  "./assets/treasure-map-screen.webp",
  "./assets/treasure-desk-menu.webp",
  "./assets/gotcha-glyph-legend.webp",
  "./assets/gotcha-glyph-sprite.png",
  "./assets/pringles-original-celebration.webp",
  "./assets/zbar-cookies-n-cream-celebration.webp",
  "./assets/del-monte-leaf-spinach-celebration.webp",
  "./assets/town-house-original-celebration.webp",
  "./assets/kirkland-coconut-water-celebration.webp",
  "./assets/pringles-brand-reveal.webp",
  "./assets/zbar-brand-reveal.webp",
  "./assets/del-monte-brand-reveal.webp",
  "./assets/town-house-brand-reveal.webp",
  "./assets/kirkland-brand-reveal.webp",
  "./assets/treasure-chest.png",
  "./assets/tablet-map-locked.webp",
  "./assets/tablet-complete.webp",
  "./assets/tablet-fragment-1.webp",
  "./assets/tablet-fragment-2.webp",
  "./assets/tablet-fragment-3.webp",
  "./assets/tablet-fragment-4.webp",
  "./assets/tablet-fragment-5.webp",
  "./assets/tablet-fragment-6.webp",
  "./assets/tablet-fragment-7.webp",
  "./assets/tablet-fragment-8.webp",
  "./assets/tablet-fragment-9.webp",
  "./assets/vendor/html5-qrcode-2.3.8.min.js",
  "./assets/vendor/leaflet-1.9.4.min.js",
  "./assets/vendor/leaflet-1.9.4.css",
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
