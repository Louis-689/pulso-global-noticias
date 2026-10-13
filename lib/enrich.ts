import { cleanText, playableVideo, safeArticleUrl } from "./pulse-data";
import type { PulseArticle } from "./pulse-types";

/**
 * Many feeds publish a headline without a picture. The article page itself
 * almost always declares one (Open Graph / Twitter cards), so we read only the
 * page <head> and take the publisher's own image or video. Nothing is invented:
 * if the page declares no media, the card keeps its illustrated poster.
 */
type Meta = { image?: string; video?: string };
const cache = new Map<string, { value: Meta; expires: number }>();
const MAX_HEAD = 300_000;
const TTL = 60 * 60 * 1000;

function metaContent(head: string, keys: string[]): string {
  for (const key of keys) {
    const escaped = key.replace(/[.:]/g, "\\$&");
    const a = head.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=(["'])(.*?)\\1`, "i"));
    const b = head.match(new RegExp(`<meta[^>]+content=(["'])(.*?)\\1[^>]*(?:property|name)=["']${escaped}["']`, "i"));
    const value = cleanText(a?.[2] ?? b?.[2], 2500);
    if (value) return value;
  }
  return "";
}

export function parseHeadMeta(html: string, pageUrl: string): Meta {
  const head = html.slice(0, MAX_HEAD).split(/<\/head>/i)[0];
  const absolute = (value: string) => { try { return safeArticleUrl(new URL(value, pageUrl).href); } catch { return null; } };
  const image = absolute(metaContent(head, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]));
  const videoRaw = metaContent(head, ["og:video:secure_url", "og:video:url", "og:video", "twitter:player"]);
  const video = videoRaw ? playableVideo(absolute(videoRaw) ?? "") : null;
  return { ...(image && image.startsWith("https://") ? { image } : {}), ...(video ? { video } : {}) };
}

async function fetchHead(url: string, fetcher: typeof fetch, timeoutMs: number): Promise<Meta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    // Follow at most two redirects, re-validating each hop (no private hosts).
    for (let hop = 0; hop < 3; hop++) {
      const response = await fetcher(current, { signal: controller.signal, redirect: "manual", headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; PulsoGlobal/2.0; +https://github.com/Louis-689)" } });
      if (response.status >= 300 && response.status < 400) {
        const next = safeArticleUrl(new URL(response.headers.get("location") ?? "", current).href);
        if (!next) return {};
        current = next;
        continue;
      }
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html") || !response.body) return {};
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let html = "";
      try {
        while (html.length < MAX_HEAD) {
          const chunk = await reader.read();
          if (chunk.done) break;
          html += decoder.decode(chunk.value, { stream: true });
          if (/<\/head>/i.test(html)) break;
        }
      } finally { await reader.cancel().catch(() => undefined); }
      return parseHeadMeta(html, current);
    }
    return {};
  } catch {
    return {};
  } finally { clearTimeout(timer); }
}

export async function enrichMedia(articles: PulseArticle[], fetcher: typeof fetch = fetch, limit = 36, timeoutMs = 3_500): Promise<PulseArticle[]> {
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
  // Google News links are opaque redirects; their pages carry no publisher card.
  const targets = articles.filter((article) => !article.media && article.destinationHost !== "news.google.com" && article.kind === "news").slice(0, limit);
  const results = new Map<string, Meta>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, targets.length) }, async () => {
    while (cursor < targets.length) {
      const article = targets[cursor++];
      const hit = cache.get(article.url);
      const meta = hit ? hit.value : await fetchHead(article.url, fetcher, timeoutMs);
      if (!hit) { if (cache.size > 3000) cache.delete(cache.keys().next().value!); cache.set(article.url, { value: meta, expires: now + TTL }); }
      results.set(article.id, meta);
    }
  }));
  return articles.map((article) => {
    const meta = results.get(article.id);
    if (!meta) return article;
    const media = article.media ?? (meta.image ? { url: meta.image, type: "image" as const, credit: article.sourceName } : undefined);
    return { ...article, ...(media ? { media } : {}), ...(meta.video ? { video: meta.video } : {}) };
  });
}
