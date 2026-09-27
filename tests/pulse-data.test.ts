import assert from "node:assert/strict";
import test from "node:test";
import { cleanText, derivePulse, detectMentionedCountries, filterTimeAndDedupe, lexicalTone, normalizeArticle, parseRssItems, parseTimestamp, safeArticleUrl } from "../lib/pulse-data";

test("cleanText normaliza entidades, etiquetas y controles", () => {
  assert.equal(cleanText(" <b>Río &amp; ciencia</b>\u0000 "), "Río & ciencia");
});

test("safeArticleUrl admite noticias web y rechaza destinos peligrosos", () => {
  assert.equal(safeArticleUrl("https://example.com/news?id=1"), "https://example.com/news?id=1");
  for (const value of ["javascript:alert(1)", "http://127.0.0.1/private", "https://user:pass@example.com/"]) assert.equal(safeArticleUrl(value), null);
});

test("parseTimestamp rechaza fechas inválidas", () => {
  assert.equal(parseTimestamp("no-date"), null);
  assert.match(parseTimestamp("2026-09-26T10:00:00Z") ?? "", /^2026-09-26T10:00:00/);
});

test("detección geográfica conserva evidencia explícita", () => {
  const result = detectMentionedCountries("Perú y China anuncian cooperación científica");
  assert.deepEqual(result.map((item) => item.code).sort(), ["CN", "PE"]);
  assert.ok(result.every((item) => item.evidence.length > 0));
});

test("tono léxico es señal explicable, no una probabilidad acotada", () => {
  const tone = lexicalTone("paz, avance, crecimiento y mejora frente a crisis y guerra");
  assert.ok(tone.positiveTerms.length >= 2);
  assert.ok(tone.negativeTerms.length >= 2);
  assert.equal(Number.isInteger(tone.sentiment), true);
});

test("RSS conserva multimedia y enlace de la fuente", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title>Noticia en Perú</title><link>https://example.com/a</link><pubDate>Sat, 26 Sep 2026 10:00:00 GMT</pubDate><description><![CDATA[<img src="https://images.example.com/a.jpg">Resumen]]></description><enclosure url="https://media.example.com/a.mp4" type="video/mp4"/></item></channel></rss>`;
  const [item] = parseRssItems(xml);
  assert.equal(item.url, "https://example.com/a");
  assert.equal(item.mediaUrl, "https://media.example.com/a.mp4");
  assert.equal(item.mediaType, "video");
});

test("deduplicación elimina seguimiento y derivePulse calcula mapa", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  const base = normalizeArticle({ title: "Perú y China firman acuerdo", url: "https://example.com/a?utm_source=x", seendate: "2026-09-26T11:00:00Z" }, { provider: "test" });
  const duplicate = normalizeArticle({ title: "Perú y China firman acuerdo", url: "https://example.com/a?utm_source=y", seendate: "2026-09-26T11:05:00Z" }, { provider: "test" });
  assert.ok(base && duplicate);
  const filtered = filterTimeAndDedupe([base!, duplicate!], "24h", now);
  assert.equal(filtered.length, 1);
  const view = derivePulse(filtered);
  assert.equal(view.stats.total, 1);
  assert.ok(view.points.length >= 2);
  assert.equal(view.connections.length, 1);
});
