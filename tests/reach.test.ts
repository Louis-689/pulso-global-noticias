import assert from "node:assert/strict";
import test from "node:test";
import { detectLang, langCode, scriptLang } from "../lib/lang";
import { normalizeArticle } from "../lib/pulse-data";
import { newsUrls, parsePulseRequest } from "../lib/pulse-service";
import { parseTranslateBody, translateText } from "../lib/translate";
import { pieces } from "../lib/translate-client";
import { buildOfflineHtml } from "../lib/offline";

test("langCode entiende códigos y nombres de GDELT", () => {
  assert.equal(langCode("es-419"), "es");
  assert.equal(langCode("Spanish"), "es");
  assert.equal(langCode("English"), "en");
  assert.equal(langCode("Klingon"), undefined);
});

test("la escritura corrige el idioma declarado", () => {
  assert.equal(scriptLang("Новости дня"), "ru");
  assert.equal(scriptLang("الأخبار اليوم"), "ar");
  assert.equal(scriptLang("東京のニュース"), "ja");
  assert.equal(scriptLang("北京新闻"), "zh");
  assert.equal(detectLang("Новости дня", "en"), "ru");
  assert.equal(detectLang("اخبار ایران", "fa"), "fa");
  assert.equal(detectLang("Lluvias en Lima", "es"), "es");
  assert.equal(detectLang("Breaking news in English", "ru"), undefined);
});

test("cada titular lleva su idioma", () => {
  const rss = normalizeArticle({ title: "Elecciones en Chile", url: "https://elpais.com/a", timestamp: "2026-10-12T10:00:00Z" }, { provider: "t", lang: "es" })!;
  assert.equal(rss.lang, "es");
  const gdelt = normalizeArticle({ title: "Elections in Chile", url: "https://bbc.com/a", seendate: "20261012T100000Z", language: "English" }, { provider: "GDELT" })!;
  assert.equal(gdelt.lang, "en");
});

test("en español la portada usa ediciones y medios en español", () => {
  const { rss } = newsUrls(parsePulseRequest(new URLSearchParams("lang=es")));
  const spanish = rss.filter((feed) => feed.lang === "es");
  assert.ok(spanish.length >= 8, `solo ${spanish.length} fuentes en español`);
  assert.ok(rss.every((feed) => feed.lang), "toda fuente declara su idioma");
  assert.ok(spanish.length > rss.length / 2);
});

test("Desmentidos usa verificadores de datos", () => {
  const { rss } = newsUrls(parsePulseRequest(new URLSearchParams("lang=es&category=factcheck")));
  assert.ok(rss.some((feed) => feed.name === "Maldita.es"));
  assert.ok(rss.some((feed) => feed.name === "Chequeado"));
  assert.ok(!rss.some((feed) => feed.name === "Al Jazeera English"));
});

test("la traducción valida lo que recibe", () => {
  assert.deepEqual(parseTranslateBody({ from: "en", to: "es", texts: ["Hello"] }), { from: "en", to: "es", texts: ["Hello"] });
  assert.equal(parseTranslateBody({ from: "en", to: "en", texts: ["x"] }), null);
  assert.equal(parseTranslateBody({ from: "en", to: "es", texts: ["x".repeat(600)] }), null);
  assert.equal(parseTranslateBody({ from: "en", to: "es", texts: Array(31).fill("x") }), null);
  assert.equal(parseTranslateBody({ from: "../", to: "es", texts: ["x"] }), null);
});

test("la traducción pasa a Google cuando MyMemory se agota", async () => {
  const fetcher = (async (url: string) => {
    if (url.includes("mymemory")) return new Response(JSON.stringify({ responseStatus: 429, quotaFinished: true, responseData: { translatedText: "MYMEMORY WARNING" } }), { status: 200 });
    return new Response(JSON.stringify([[["Hola ", "Hello "], ["mundo", "world"]]]), { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await translateText("Hello world", "en", "es", fetcher), "Hola mundo");
});

test("los textos largos se parten en frases", () => {
  const text = "Una frase corta. ".repeat(60);
  const parts = pieces(text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => part.length <= 480));
  assert.equal(parts.join(""), text);
});

test("el archivo sin conexión lleva traducción, texto completo e instrucciones", () => {
  const article = normalizeArticle({ title: "Floods in Dhaka", url: "https://bbc.com/a", timestamp: "2026-10-12T10:00:00Z", sourceName: "BBC" }, { provider: "t", lang: "en" })!;
  const html = buildOfflineHtml([{ ...article, displayTitle: "Inundaciones en Daca", paragraphs: ["Primer párrafo <b>", "Segundo"] }], {
    title: "Pulso", lang: "es", confirmedLabel: "Confirmada por {n}", generatedAt: new Date("2026-10-12T12:00:00Z"),
    labels: { howTitle: "Cómo compartir", howText: "Pásalo por USB", fullText: "Leer completa", toc: "Índice", original: "Ver original" },
  });
  assert.match(html, /Inundaciones en Daca/);
  assert.match(html, /Ver original: <span dir="auto">Floods in Dhaka/);
  assert.match(html, /Primer párrafo &lt;b&gt;/);
  assert.match(html, /Pásalo por USB/);
  assert.doesNotMatch(html, /<script/);
});
