"use strict";

const CACHE_NAME = "gotcha-mvp-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=3",
  "./app.js?v=3",
  "./hunts.json",
  "./manifest.webmanifest",
  "./images/background.png",
  "./assets/gotcha-wordmark.svg",
  "./assets/gotcha-icon.svg",
  "./assets/treasure-chest.png",
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
