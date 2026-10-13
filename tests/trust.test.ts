import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArticle, parseRssItems } from "../lib/pulse-data";
import { LIBRARY } from "../lib/library";
import { isTrustedHost, TRUSTED_DOMAINS } from "../lib/trusted";
import { corroborate } from "../lib/verify";

test("la lista de confianza acepta subdominios y excluye propaganda estatal", () => {
  assert.ok(isTrustedHost("www.reuters.com"));
  assert.ok(isTrustedHost("feeds.bbci.co.uk") === false);
  assert.ok(isTrustedHost("mundo.bbc.co.uk"));
  for (const host of ["rt.com", "actualidad.rt.com", "sputniknews.com", "cgtn.com", "xinhuanet.com", "tass.com", "presstv.ir", "telesurtv.net", "news.google.com", "evil-reuters.com"]) assert.equal(isTrustedHost(host), false, host);
  assert.equal(new Set(TRUSTED_DOMAINS).size, TRUSTED_DOMAINS.length);
  assert.ok(!LIBRARY.some((outlet) => outlet.stateFunded));
});

test("Google News conserva el medio real y el resumen del feed", () => {
  const xml = `<rss><channel><item><title>Sismo en Chile - Reuters</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate><description>Sismo en Chile Reuters</description><source url="https://www.reuters.com">Reuters</source></item>
  <item><title>Lluvias en Lima</title><link>https://elcomercio.pe/a</link><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Las lluvias intensas afectaron a varios distritos de la capital durante la madrugada.</p>]]></description></item></channel></rss>`;
  const [google, direct] = parseRssItems(xml).map((raw) => normalizeArticle(raw, { provider: "test" })!);
  assert.equal(google.sourceHost, "reuters.com");
  assert.equal(google.summary, undefined);
  assert.equal(direct.sourceHost, "elcomercio.pe");
  assert.match(direct.summary ?? "", /lluvias intensas/);
  const gdelt = normalizeArticle({ title: "X", url: "https://www.apnews.com/x", seendate: "20261012T100000Z", domain: "apnews.com" }, { provider: "GDELT" })!;
  assert.equal(gdelt.sourceHost, "apnews.com");
});

test("corroborate cuenta otros medios con la misma historia", () => {
  const make = (title: string, url: string, sourceName: string) => normalizeArticle({ title, url, timestamp: "2026-10-12T10:00:00Z", sourceName }, { provider: "test" })!;
  const result = corroborate([
    make("Terremoto de magnitud 7 sacude el norte de Chile", "https://elpais.com/a", "El País"),
    make("Fuerte terremoto de magnitud 7 en el norte de Chile", "https://www.bbc.com/mundo/b", "BBC Mundo"),
    make("Terremoto magnitud 7 sacude Chile", "https://elpais.com/c", "El País"),
    make("Elecciones en Francia: resultados", "https://www.lemonde.fr/d", "Le Monde"),
  ]);
  assert.deepEqual(result[0].confirmedBy, ["BBC Mundo"]);
  assert.deepEqual(result[1].confirmedBy, ["El País"]);
  assert.equal(result[3].confirmedBy, undefined);
});

test("el archivo sin conexión escapa HTML y no carga nada externo", async () => {
  const { buildOfflineHtml } = await import("../lib/offline");
  const article = normalizeArticle({ title: "Precios: 5 < 6 & \"subida\" en Lima", url: "https://elpais.com/a", timestamp: "2026-10-12T10:00:00Z", sourceName: "El País" }, { provider: "test" })!;
  const html = buildOfflineHtml([{ ...article, confirmedBy: ["BBC"], sourceName: "<img src=x onerror=alert(1)>" }], { title: "Pulso", lang: "es", confirmedLabel: "Confirmada por {n}", generatedAt: new Date("2026-10-12T12:00:00Z") });
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /5 &lt; 6 &amp; &quot;subida&quot;/);
  assert.match(html, /Confirmada por 1: BBC/);
  assert.doesNotMatch(html, /<(img|link|iframe)\b/);
});

test("corroborate distingue medios distintos bajo el mismo .co.uk", () => {
  const make = (url: string, sourceName: string) => normalizeArticle({ title: "Huelga nacional paraliza trenes y hospitales en Reino Unido", url, timestamp: "2026-10-12T10:00:00Z", sourceName }, { provider: "test" })!;
  const [bbc, telegraph] = corroborate([make("https://www.bbc.co.uk/news/a", "BBC"), make("https://www.telegraph.co.uk/b", "The Telegraph")]);
  assert.deepEqual(bbc.confirmedBy, ["The Telegraph"]);
  assert.deepEqual(telegraph.confirmedBy, ["BBC"]);
});
