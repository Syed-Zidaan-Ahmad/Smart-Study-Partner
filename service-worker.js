// service-worker.js

// Cache name
const CACHE = "smartstudypartner-cache-v1";
// Files to cache
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll([
        "./",
        "./index.html",
        "./style.css",
        "./script.js",
        "./assets/icon-192.png",
        "./assets/icon-512.png",
        "./manifest.json"
      ]);
    })
  );
});
// Fetch event to serve cached files
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
// End of Program (Program by Zidaan)