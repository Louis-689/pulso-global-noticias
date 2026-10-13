/**
 * Per-address sliding window for the mirror endpoints. It lives in memory, so
 * each server instance counts on its own; a public deployment should also set
 * an edge rate limit.
 */
const hits = new Map<string, number[]>();

export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "local";
}

export function allowRequest(bucket: string, address: string, perMinute: number, now = Date.now()): boolean {
  const key = `${bucket}:${address}`;
  const recent = (hits.get(key) ?? []).filter((time) => time > now - 60_000);
  if (recent.length >= perMinute) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 20_000) hits.delete(hits.keys().next().value!);
  return true;
}
