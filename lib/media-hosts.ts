import { isTrustedHost } from "./trusted";

/**
 * The image relay only serves pictures that the app itself showed: hosts seen
 * in recent results, trusted outlets, and the CDNs those outlets use.
 */
const OUTLET_CDNS = ["bbci.co.uk", "guim.co.uk", "nyt.com", "ytimg.com", "wp.com", "googleusercontent.com", "gstatic.com", "akamaized.net", "cloudfront.net", "brightspotcdn.com", "arcpublishing.com", "twimg.com"];
const seen = new Map<string, number>();
const TTL = 6 * 60 * 60 * 1000;

export function rememberMediaHosts(urls: string[], now = Date.now()) {
  for (const url of urls) {
    try { seen.set(new URL(url).hostname, now + TTL); } catch { /* skip */ }
  }
  if (seen.size > 5_000) for (const [host, expires] of seen) if (expires < now) seen.delete(host);
}

export function isAllowedMediaHost(host: string, now = Date.now()): boolean {
  const expires = seen.get(host);
  if (expires && expires > now) return true;
  return isTrustedHost(host) || OUTLET_CDNS.some((cdn) => host === cdn || host.endsWith(`.${cdn}`));
}
