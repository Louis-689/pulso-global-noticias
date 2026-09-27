import assert from "node:assert/strict";
import test from "node:test";
import { boundedFetchText, fetchProviderText, newsUrls, parsePulseRequest } from "../lib/pulse-service";

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

test("fetchProviderText reintenta una caída transitoria una sola vez", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("temporal", { status: 503, headers: { "content-type": "text/plain" } });
    return new Response("<rss><channel></channel></rss>", { headers: { "content-type": "application/rss+xml" } });
  };
  assert.match(await fetchProviderText("https://example.com/feed", "xml", fetcher, 50, 50), /<rss>/);
  assert.equal(calls, 2);
});

test("fetchProviderText no reintenta formatos inválidos", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response("<html/>", { headers: { "content-type": "text/html" } });
  };
  await assert.rejects(() => fetchProviderText("https://example.com/feed", "xml", fetcher, 50, 50), /Formato/);
  assert.equal(calls, 1);
});
