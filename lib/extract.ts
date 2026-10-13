import { cleanText } from "./pulse-data";

export type ExtractedArticle = { title: string; paragraphs: string[] };

/**
 * Pull the readable text out of an article page so people who cannot reach
 * the outlet can read it here. Only paragraphs survive: no scripts, styles,
 * forms, ads or trackers, and never the outlet's HTML itself.
 */
export function extractArticle(html: string): ExtractedArticle {
  const source = html.slice(0, 3_000_000);
  const meta = source.match(/<meta[^>]+property=["']og:title["'][^>]*content=(["'])(.*?)\1/i)?.[2]
    ?? source.match(/<meta[^>]+content=(["'])(.*?)\1[^>]*property=["']og:title["']/i)?.[2];
  const title = cleanText(meta ?? source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1], 300);
  const stripped = source.replace(/<(script|style|noscript|nav|header|footer|aside|form|figure|svg|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Prefer the largest <article> block; fall back to the whole body.
  const articles = [...stripped.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map((match) => match[1]).sort((a, b) => b.length - a.length);
  const scope = articles[0] && /<p\b/i.test(articles[0]) ? articles[0] : stripped;
  const paragraphs: string[] = [];
  let total = 0;
  for (const match of scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = cleanText(match[1], 3000);
    if (text.length < 40 || /^(©|copyright|suscr|subscri|cookies?|lee también|read more|follow us|síguenos)/i.test(text)) continue;
    if (paragraphs.includes(text)) continue;
    paragraphs.push(text);
    total += text.length;
    if (paragraphs.length >= 80 || total > 40_000) break;
  }
  return { title, paragraphs };
}
