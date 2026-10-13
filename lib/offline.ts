import type { PulseArticle } from "./pulse-types";

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** A story for the offline file: optionally translated, optionally with its full text. */
export type OfflineStory = PulseArticle & { displayTitle?: string; displaySummary?: string; paragraphs?: string[] };
type Labels = { howTitle: string; howText: string; fullText: string; toc: string; original: string };

/**
 * A single self-contained HTML file with the current stories: no scripts, no
 * images, no external requests. It can travel by USB, Bluetooth, mesh apps or
 * satellite datacasting, and opens in any browser with no connection at all.
 */
export function buildOfflineHtml(articles: OfflineStory[], options: { title: string; lang: string; rtl?: boolean; confirmedLabel: string; generatedAt: Date; labels?: Labels }): string {
  const list = articles.slice(0, 200);
  const labels = options.labels;
  const items = list.map((article, index) => {
    const title = article.displayTitle || article.title;
    const original = article.displayTitle && article.displayTitle !== article.title ? `<p class="meta">${escape(labels?.original ?? "")}: <span dir="auto">${escape(article.title)}</span></p>` : "";
    const confirmed = article.confirmedBy?.length ? `<p class="ok">✅ ${escape(options.confirmedLabel.replace("{n}", String(article.confirmedBy.length)))}: ${escape(article.confirmedBy.join(", "))}</p>` : "";
    const summaryText = article.displaySummary || article.summary;
    const summary = summaryText ? `<p dir="auto">${escape(summaryText)}</p>` : "";
    const full = article.paragraphs?.length ? `<details><summary>${escape(labels?.fullText ?? "+")}</summary><div dir="auto">${article.paragraphs.map((text) => `<p>${escape(text)}</p>`).join("")}</div></details>` : "";
    return `<article id="n${index + 1}"><h2 dir="auto">${index + 1}. ${escape(title)}</h2>${original}<p class="meta">${escape(article.sourceName)} · ${escape(new Date(article.publishedAt ?? article.seenDate).toISOString().slice(0, 16).replace("T", " "))} UTC</p>${summary}${confirmed}${full}<p class="link">${escape(article.url)}</p></article>`;
  }).join("\n");
  const toc = labels && list.length > 5 ? `<nav><h2>${escape(labels.toc)}</h2><ol>${list.map((article, index) => `<li><a href="#n${index + 1}" dir="auto">${escape(article.displayTitle || article.title)}</a></li>`).join("")}</ol></nav>` : "";
  const how = labels ? `<aside><strong>📦 ${escape(labels.howTitle)}</strong><p>${escape(labels.howText)}</p></aside>` : "";
  return `<!doctype html>
<html lang="${escape(options.lang)}" dir="${options.rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escape(options.title)}</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px;background:#fff8ee;color:#1d1747}h1{font-size:1.6rem}article,nav,aside{background:#fff;border-radius:14px;padding:14px 16px;margin:12px 0;border:2px solid #1d174714}aside{background:#fff1c9}h2{font-size:1.1rem;margin:0 0 4px}nav h2{margin-bottom:8px}nav li{margin:4px 0}a{color:#2f6bff}.meta{color:#5b5689;font-size:.85rem;margin:0}.ok{color:#0b7a5f;font-weight:700}.link{font-size:.75rem;color:#2f6bff;word-break:break-all}details{margin:8px 0}summary{cursor:pointer;font-weight:700;color:#2f6bff}</style>
</head><body><h1>🌍 ${escape(options.title)}</h1><p class="meta">${escape(options.generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC · ${list.length}</p>
${how}${toc}
${items}
</body></html>`;
}
