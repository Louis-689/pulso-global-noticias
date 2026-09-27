/* Pulso Global installability worker.
 * Live and authenticated content stays network-only: no private news view or
 * API response is written to a persistent offline cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Deliberately empty. The browser keeps normal HTTP caching semantics and
  // the app continues to show its explicit connection/error states.
});
