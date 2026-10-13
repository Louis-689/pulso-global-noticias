import { extractArticle } from "./extract";
import { safeFetch } from "./safe-fetch";
import { isTrustedHost } from "./trusted";

/** Pages in windows-1251, Shift_JIS, GBK… declare their charset in the header or a <meta> tag. */
function decodeHtml(bytes: Uint8Array, headerCharset: string): string {
  const sniff = new TextDecoder("latin1").decode(bytes.slice(0, 4096)).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  for (const label of [headerCharset, sniff, "utf-8"]) {
    if (!label) continue;
    try { return new TextDecoder(label).decode(bytes); } catch { /* unknown label */ }
  }
  return new TextDecoder().decode(bytes);
}

export type ReadResult = { ok: true; value: { title?: string; paragraphs: string[]; url: string; fetchedAt: string } } | { ok: false; error: "untrusted" | "unavailable" | "empty" };

/** Fetches a trusted article and keeps only its text. */
export async function readArticle(url: string, now = Date.now()): Promise<ReadResult> {
  let host = "";
  try { host = new URL(url).hostname; } catch { /* invalid */ }
  if (!host || !isTrustedHost(host)) return { ok: false, error: "untrusted" };
  const page = await safeFetch(url, { accept: /^(text\/html|application\/xhtml\+xml)$/, maxBytes: 3_000_000, allow: isTrustedHost });
  if (!page) return { ok: false, error: "unavailable" };
  const article = extractArticle(decodeHtml(page.bytes, page.charset));
  if (article.paragraphs.length < 2) return { ok: false, error: "empty" };
  return { ok: true, value: { ...article, url: page.finalUrl, fetchedAt: new Date(now).toISOString() } };
}
