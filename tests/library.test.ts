import assert from "node:assert/strict";
import test from "node:test";
import { accessRoutes, blockingCountries, EU_MEMBERS, LIBRARY, translateProxyUrl } from "../lib/library";
import { parseRssItems } from "../lib/pulse-data";
import { loadLibrary, newsUrls, parsePulseRequest } from "../lib/pulse-service";

test("la biblioteca usa solo feeds https y códigos de país válidos", () => {
  assert.ok(LIBRARY.length >= 10);
  for (const outlet of LIBRARY) {
    assert.match(outlet.feed, /^https:\/\//);
    for (const code of outlet.blockedIn) assert.match(code, /^[A-Z]{2}$/);
  }
  assert.equal(new Set(LIBRARY.map((outlet) => outlet.id)).size, LIBRARY.length);
});

test("EU se expande a los estados miembros", () => {
  assert.deepEqual(blockingCountries({ blockedIn: ["EU"] }), EU_MEMBERS);
  assert.deepEqual(blockingCountries({ blockedIn: ["RU", "CN"] }), ["RU", "CN"]);
});

test("el proxy de traducción reescribe el dominio como translate.goog", () => {
  assert.equal(translateProxyUrl("https://www.my-site.com/a/b?x=1", "es"),
    "https://www-my--site-com.translate.goog/a/b?x=1&_x_tr_sl=auto&_x_tr_tl=es&_x_tr_hl=es");
  assert.equal(translateProxyUrl("javascript:alert(1)", "es"), null);
  const routes = accessRoutes("https://meduza.io/en/news/1", "en").map((route) => route.id);
  assert.deepEqual(routes, ["original", "archive", "archive-today", "translate"]);
});

test("el lector acepta Atom y RSS 1.0 (RDF)", () => {
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Hola mundo</title><link rel="alternate" href="https://example.com/a"/><updated>2026-10-12T10:00:00Z</updated></entry></feed>`;
  const [entry] = parseRssItems(atom);
  assert.equal(entry.title, "Hola mundo");
  assert.equal(entry.url, "https://example.com/a");
  assert.equal(entry.timestamp, "2026-10-12T10:00:00Z");
  const rdf = `<rdf:RDF><item rdf:about="x"><title>Nota</title><link>https://example.com/b</link><dc:date>2026-10-12T10:00:00+02:00</dc:date></item></rdf:RDF>`;
  const [item] = parseRssItems(rdf);
  assert.equal(item.url, "https://example.com/b");
  assert.equal(item.timestamp, "2026-10-12T10:00:00+02:00");
});

test("modo biblioteca e idioma se validan", () => {
  const request = parsePulseRequest(new URLSearchParams({ mode: "library", lang: "ru" }));
  assert.equal(request.mode, "library");
  assert.equal(request.lang, "ru");
  assert.equal(parsePulseRequest(new URLSearchParams({ lang: "xx" })).lang, "es");
  const urls = newsUrls({ category: "all", timespan: "24h", mode: "news", country: "", query: "", lang: "ru" });
  assert.ok(urls.rss.some((feed) => feed.name.includes("Русский")));
});

test("loadLibrary etiqueta cada titular con su medio y tolera caídas", async () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("meduza")) return new Response(`<rss><channel><item><title>Kremlin news</title><link>https://meduza.io/en/news/1</link><pubDate>Mon, 12 Oct 2026 10:00:00 +0000</pubDate></item></channel></rss>`, { headers: { "content-type": "application/rss+xml" } });
    return new Response("nope", { status: 500 });
  };
  const result = await loadLibrary(now, fetcher);
  assert.equal(result.articles.length, 1);
  assert.equal(result.articles[0].outlet?.id, "meduza");
  assert.deepEqual(result.articles[0].outlet?.blockedIn, ["RU"]);
  assert.equal(result.sources.find((source) => source.name === "Meduza")?.status, "ok");
  assert.ok(result.sources.filter((source) => source.status === "error").length >= LIBRARY.length - 1);
});

test("detectTopic exige inicio de palabra", async () => {
  const { detectTopic } = await import("../lib/pulse-service");
  assert.equal(detectTopic("Earthquake of magnitude 6.1 strikes Japan"), undefined);
  assert.equal(detectTopic("Argentina: inflación baja por sexto mes"), "economy");
  assert.equal(detectTopic("Festival de arte en Lima"), "culture");
});
