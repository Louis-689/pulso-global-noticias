import { lookup } from "node:dns/promises";
import { safeArticleUrl } from "./pulse-data";

/** Private, loopback, link-local and carrier-grade NAT addresses never leave the mirror. */
export function isPrivateAddress(address: string): boolean {
  const v4 = address.replace(/^::ffff:/i, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = address.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

async function resolvesPublic(host: string): Promise<boolean> {
  try {
    const records = await lookup(host, { all: true });
    return records.length > 0 && records.every((record) => !isPrivateAddress(record.address));
  } catch { return false; }
}

const UA = "Mozilla/5.0 (compatible; PulsoGlobal/2.2; +https://github.com/Louis-689)";

/**
 * Fetch a public URL for the mirror: manual redirects (each hop re-validated),
 * an expected content type, a byte cap and a timeout. `allow` can restrict
 * every hop to a set of hosts (for example the trusted outlets).
 */
export async function safeFetch(url: string, options: { accept: RegExp; maxBytes: number; timeoutMs?: number; allow?: (host: string) => boolean; fetcher?: typeof fetch }): Promise<{ bytes: Uint8Array; type: string; charset: string; finalUrl: string } | null> {
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    let current = safeArticleUrl(url);
    for (let hop = 0; current && hop < 4; hop++) {
      const host = new URL(current).hostname;
      if (options.allow && !options.allow(host)) return null;
      // Real network calls also check DNS, so a public name cannot point at an internal address.
      if (!options.fetcher && !(await resolvesPublic(host))) return null;
      const response = await fetcher(current, { signal: controller.signal, redirect: "manual", headers: { "User-Agent": UA, Accept: "*/*" } });
      if (response.status >= 300 && response.status < 400) {
        current = safeArticleUrl(new URL(response.headers.get("location") ?? "", current).href);
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      const type = contentType.split(";")[0].trim().toLowerCase();
      const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? "";
      if (!response.ok || !options.accept.test(type) || !response.body) return null;
      if (Number(response.headers.get("content-length") ?? 0) > options.maxBytes) return null;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > options.maxBytes) { await reader.cancel().catch(() => undefined); return null; }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { bytes, type, charset, finalUrl: current };
    }
    return null;
  } catch {
    return null;
  } finally { clearTimeout(timer); }
}
