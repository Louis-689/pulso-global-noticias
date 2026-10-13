/**
 * Server-side translation for browsers without an on-device translator.
 * MyMemory is a documented free API with a daily quota per address; when it
 * runs out, Google Translate's public web endpoint takes over. Only public
 * headlines and article text are sent, never anything about the reader.
 */
type FetchLike = typeof fetch;

export const MAX_TEXTS = 30;
export const MAX_CHARS = 500;
const cache = new Map<string, string>();
let myMemoryPausedUntil = 0;

async function getJson(url: string, fetcher: FetchLike): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetcher(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "PulsoGlobal/1.0" }, redirect: "error", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 200_000) throw new Error("too large");
    return JSON.parse(text);
  } finally { clearTimeout(timer); }
}

async function myMemory(text: string, from: string, to: string, fetcher: FetchLike): Promise<string | null> {
  if (from === "auto" || Date.now() < myMemoryPausedUntil) return null;
  const data = await getJson(`https://api.mymemory.translated.net/get?${new URLSearchParams({ q: text, langpair: `${from}|${to}` })}`, fetcher) as { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: unknown } };
  if (data.quotaFinished || Number(data.responseStatus) === 429) { myMemoryPausedUntil = Date.now() + 60 * 60 * 1000; return null; }
  const out = data.responseData?.translatedText;
  return Number(data.responseStatus) === 200 && typeof out === "string" && out.trim() && !/MYMEMORY WARNING/i.test(out) ? out : null;
}

async function googleWeb(text: string, from: string, to: string, fetcher: FetchLike): Promise<string | null> {
  const data = await getJson(`https://translate.googleapis.com/translate_a/single?${new URLSearchParams({ client: "gtx", sl: from, tl: to, dt: "t", q: text })}`, fetcher);
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const out = (data[0] as unknown[]).map((part) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("");
  return out.trim() ? out : null;
}

export async function translateText(text: string, from: string, to: string, fetcher: FetchLike = fetch): Promise<string | null> {
  const key = `${from}|${to}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let out: string | null = null;
  for (const provider of [myMemory, googleWeb]) {
    try { out = await provider(text, from, to, fetcher); } catch { out = null; }
    if (out) break;
  }
  if (out) {
    if (cache.size > 3000) cache.delete(cache.keys().next().value!);
    cache.set(key, out);
  }
  return out;
}

const LANG = /^(auto|[a-z]{2})$/;
export function parseTranslateBody(body: unknown): { from: string; to: string; texts: string[] } | null {
  if (!body || typeof body !== "object") return null;
  const { from, to, texts } = body as Record<string, unknown>;
  if (typeof from !== "string" || typeof to !== "string" || !LANG.test(from) || !LANG.test(to) || to === "auto" || from === to) return null;
  if (!Array.isArray(texts) || !texts.length || texts.length > MAX_TEXTS || !texts.every((text) => typeof text === "string" && text.length <= MAX_CHARS)) return null;
  return { from, to, texts: texts as string[] };
}
