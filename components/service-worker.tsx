"use client";

import { useEffect } from "react";

/** Registers the offline worker and hands it the assets this page already loaded. */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          const assets = performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("/_next/static/"));
          registration.active?.postMessage({ cache: assets });
        })
        .catch(() => undefined);
    }
  }, []);
  return null;
}
