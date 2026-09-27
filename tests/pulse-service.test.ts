import assert from "node:assert/strict";
import test from "node:test";
import { boundedFetchText, newsUrls, parsePulseRequest } from "../lib/pulse-service";

test("parsePulseRequest aplica listas permitidas y sanea búsqueda", () => {
  const request = parsePulseRequest(new URLSearchParams({ category: "invalid", timespan: "year", mode: "private", country: "xx", q: `  clima\u0000 <script> ${"x".repeat(150)}` }));
  assert.equal(request.category, "all");
  assert.equal(request.timespan, "24h");
  assert.equal(request.mode, "news");
  assert.equal(request.country, "");
  assert.ok(request.query.length <= 100);
  assert.doesNotMatch(request.query, /[<>]/);
});

test("newsUrls cubre ediciones regionales y atribuye RT", () => {
  const urls = newsUrls({ category: "politics", timespan: "24h", mode: "news", country: "PE", query: "" });
  assert.ok(urls.rss.length >= 13);
  assert.ok(urls.rss.some((feed) => feed.name.includes("BBC")));
  assert.ok(urls.rss.some((feed) => feed.name.includes("RT en Español")));
  assert.ok(urls.rss.some((feed) => feed.name.includes("Perú")));
});

test("boundedFetchText valida tipo y tamaño antes de procesar", async () => {
  const fetcher: typeof fetch = async () => new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
  assert.equal(await boundedFetchText("https://example.com/data", "json", fetcher), '{"ok":true}');
  const wrong: typeof fetch = async () => new Response("<html/>", { headers: { "content-type": "text/html" } });
  await assert.rejects(() => boundedFetchText("https://example.com/data", "json", wrong), /Formato/);
  const redirect: typeof fetch = async () => new Response(null, { status: 302, headers: { location: "https://other.example/" } });
  await assert.rejects(() => boundedFetchText("https://example.com/data", "json", redirect), /Redirección/);
});
