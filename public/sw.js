/* Pulso Global offline worker.
 * Connections in closed countries drop often, so the app keeps working with
 * the last stories it saw: news requests are network-first with a cached
 * fallback, and the app shell and static assets are kept for offline starts.
 * Nothing personal is cached: the API carries no accounts or cookies. */
const VERSION = "pulso-v2.3";
const IMAGES = "pulso-img";
const MAX_IMAGES = 150;
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== VERSION && key !== IMAGES).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

// The first visit loads scripts before this worker controls the page; the page
// sends their URLs so the next offline start has everything it needs.
self.addEventListener("message", (event) => {
  const urls = Array.isArray(event.data?.cache) ? event.data.cache : [];
  const own = urls.filter((url) => typeof url === "string" && new URL(url, self.location.origin).origin === self.location.origin && new URL(url, self.location.origin).pathname.startsWith("/_next/static/"));
  if (own.length) event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(own)).catch(() => undefined));
});

async function networkFirst(request, offlineHeader) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (!cached) throw error;
    if (!offlineHeader) return cached;
    const headers = new Headers(cached.headers);
    headers.set("x-pulso-offline", "1");
    return new Response(await cached.blob(), { status: 200, headers });
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    if (name === IMAGES) {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_IMAGES)).map((key) => cache.delete(key)));
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/api/pulse") event.respondWith(networkFirst(request, true));
  else if (url.pathname === "/api/read") event.respondWith(networkFirst(request, false));
  else if (url.pathname.startsWith("/_next/static/")) event.respondWith(cacheFirst(request, VERSION));
  else if (url.pathname === "/api/img") event.respondWith(cacheFirst(request, IMAGES));
  else if (request.mode === "navigate") event.respondWith(networkFirst(request, false));
});
