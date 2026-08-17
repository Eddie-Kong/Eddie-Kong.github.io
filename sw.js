/* ------------------------------------------------------------------
   Offline support for eddiekong.com.

   Bump CACHE_VERSION whenever you change a file in PRECACHE, otherwise
   returning visitors keep the old copy until their cache is evicted.

   Not registered on localhost — see initServiceWorker() in
   assets/site.js — so local development always shows the real files.
   ------------------------------------------------------------------ */

var CACHE_VERSION = "v1";
var CACHE_NAME = "eddiekong-" + CACHE_VERSION;

var PRECACHE = [
  "/",
  "/gallery.html",
  "/numbers.html",
  "/search.html",
  "/404.html",
  "/blog/",
  "/blog/coat-and-clipping.html",
  "/blog/copper-testing.html",
  "/assets/site.css",
  "/assets/site.js",
  "/data/bedlington.json",
  "/data/photos.json",
  "/data/posts.json",
  "/data/search-index.json",
  "/dog.jpg",
  "/site.webmanifest"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE_NAME ? null : caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;

  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // never touch third parties

  var wantsHTML = request.mode === "navigate" ||
                  (request.headers.get("accept") || "").indexOf("text/html") !== -1;

  if (wantsHTML) {
    /* Network first: a page you can reach should always be the current one. */
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        return response;
      }).catch(function () {
        return caches.match(request).then(function (hit) {
          return hit || caches.match("/404.html") || Response.error();
        });
      })
    );
    return;
  }

  /* Everything else — CSS, JS, JSON, images — is versioned by hand, so
     serving it from cache first is both faster and safe. */
  event.respondWith(
    caches.match(request).then(function (hit) {
      return hit || fetch(request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
