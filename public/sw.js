// TwinMind Service Worker — enables PWA install and offline caching
// v2: page loads are network-first so the app always shows the latest
// build. v1 was cache-first, which kept serving the old UI forever after
// the first visit even when the server had updated.
const CACHE_NAME = "twinmind-v2";
const PRECACHE = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API/Convex calls: always hit the network, fall back to cache offline.
  if (
    url.pathname.startsWith("/api") ||
    url.hostname.includes("convex.cloud") ||
    url.hostname.includes("convex.site")
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)),
    );
    return;
  }

  // Page navigations: network-first so updates are never stuck behind a
  // stale cache. The cached copy is only used when offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put("/", clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((r) => r || caches.match("/")),
        ),
    );
    return;
  }

  // Static assets (hashed bundles, images): stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
      return cached || fetched;
    }),
  );
});