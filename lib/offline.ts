import type { PulseArticle } from "./pulse-types";

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/**
 * A single self-contained HTML file with the current stories: no scripts, no
 * images, no external requests. It can travel by USB or Bluetooth and opens
 * in any browser, even with no connection at all.
 */
export function buildOfflineHtml(articles: PulseArticle[], options: { title: string; lang: string; rtl?: boolean; confirmedLabel: string; generatedAt: Date }): string {
  const items = articles.slice(0, 200).map((article) => {
    const confirmed = article.confirmedBy?.length ? `<p class="ok">✅ ${escape(options.confirmedLabel.replace("{n}", String(article.confirmedBy.length)))}: ${escape(article.confirmedBy.join(", "))}</p>` : "";
    const summary = article.summary ? `<p>${escape(article.summary)}</p>` : "";
    return `<article><h2 dir="auto">${escape(article.title)}</h2><p class="meta">${escape(article.sourceName)} · ${escape(new Date(article.publishedAt ?? article.seenDate).toISOString().slice(0, 16).replace("T", " "))} UTC</p>${summary}${confirmed}<p class="link">${escape(article.url)}</p></article>`;
  }).join("\n");
  return `<!doctype html>
<html lang="${escape(options.lang)}" dir="${options.rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escape(options.title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px;background:#fff8ee;color:#1d1747}h1{font-size:1.6rem}article{background:#fff;border-radius:14px;padding:14px 16px;margin:12px 0;border:2px solid #1d174714}h2{font-size:1.1rem;margin:0 0 4px}.meta{color:#5b5689;font-size:.85rem;margin:0}.ok{color:#0b7a5f;font-weight:700}.link{font-size:.75rem;color:#2f6bff;word-break:break-all}</style>
</head><body><h1>🌍 ${escape(options.title)}</h1><p class="meta">${escape(options.generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC · ${articles.length}</p>
${items}
</body></html>`;
}
