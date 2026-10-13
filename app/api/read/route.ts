import { NextRequest, NextResponse } from "next/server";
import { extractArticle } from "@/lib/extract";
import { allowRequest, clientAddress } from "@/lib/rate-limit";
import { safeFetch } from "@/lib/safe-fetch";
import { isTrustedHost } from "@/lib/trusted";

export const dynamic = "force-dynamic";

/** Pages in windows-1251, Shift_JIS, GBK… declare their charset in the header or a <meta> tag. */
function decodeHtml(bytes: Uint8Array, headerCharset: string): string {
  const sniff = new TextDecoder("latin1").decode(bytes.slice(0, 4096)).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  for (const label of [headerCharset, sniff, "utf-8"]) {
    if (!label) continue;
    try { return new TextDecoder(label).decode(bytes); } catch { /* unknown label */ }
  }
  return new TextDecoder().decode(bytes);
}

const cache = new Map<string, { value: object; expires: number }>();

/** "Leer aquí": the mirror fetches a trusted article and returns only its text. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") ?? "";
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.expires > now) return NextResponse.json(hit.value, { headers: { "Cache-Control": "public, max-age=900" } });
  let host = "";
  try { host = new URL(url).hostname; } catch { /* invalid */ }
  if (!host || !isTrustedHost(host)) return NextResponse.json({ error: "untrusted" }, { status: 400 });
  if (!allowRequest("read", clientAddress(request.headers), 30)) return NextResponse.json({ error: "busy" }, { status: 429, headers: { "Retry-After": "30" } });
  const page = await safeFetch(url, { accept: /^(text\/html|application\/xhtml\+xml)$/, maxBytes: 3_000_000, allow: isTrustedHost });
  if (!page) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  const article = extractArticle(decodeHtml(page.bytes, page.charset));
  if (article.paragraphs.length < 2) return NextResponse.json({ error: "empty" }, { status: 422 });
  const value = { ...article, url: page.finalUrl, fetchedAt: new Date(now).toISOString() };
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(url, { value, expires: now + 60 * 60 * 1000 });
  return NextResponse.json(value, { headers: { "Cache-Control": "public, max-age=900" } });
}
