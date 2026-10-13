import assert from "node:assert/strict";
import test from "node:test";
import { enrichMedia, parseHeadMeta } from "../lib/enrich";
import { normalizeArticle, playableVideo } from "../lib/pulse-data";
import type { PulseArticle } from "../lib/pulse-types";

test("parseHeadMeta toma og:image y videos reproducibles de la cabecera", () => {
  const html = `<html><head><meta property="og:image" content="/img/foto.jpg"><meta property="og:video:url" content="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></head><body><meta property="og:image" content="https://evil.example/x.jpg"></body></html>`;
  assert.deepEqual(parseHeadMeta(html, "https://news.example.com/a/b"), { image: "https://news.example.com/img/foto.jpg", video: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
  assert.deepEqual(parseHeadMeta(`<head><meta content="javascript:alert(1)" property="og:image"></head>`, "https://a.example.com/"), {});
});

test("playableVideo acepta YouTube y MP4, rechaza lo demás", () => {
  assert.equal(playableVideo("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(playableVideo("https://cdn.example.com/clip.mp4"), "https://cdn.example.com/clip.mp4");
  assert.equal(playableVideo("https://player.example.com/embed/123"), null);
  assert.equal(playableVideo("http://cdn.example.com/clip.mp4"), null);
});

test("enrichMedia sigue redirecciones seguras y no toca Google News", async () => {
  const make = (url: string) => normalizeArticle({ title: "T " + url, url, timestamp: "2026-10-12T10:00:00Z" }, { provider: "x" }) as PulseArticle;
  const articles = [make("https://pub.example.com/story"), make("https://news.google.com/rss/articles/abc"), make("https://bad.example.com/r")];
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url === "https://pub.example.com/story") return new Response(null, { status: 301, headers: { location: "/story/" } });
    if (url === "https://pub.example.com/story/") return new Response(`<head><meta name="twitter:image" content="https://cdn.example.com/p.jpg"></head>`, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
  };
  const [first, google, bad] = await enrichMedia(articles, fetcher);
  assert.equal(first.media?.url, "https://cdn.example.com/p.jpg");
  assert.equal(google.media, undefined);
  assert.equal(bad.media, undefined);
  assert.ok(!calls.some((url) => url.includes("127.0.0.1") || url.includes("news.google.com")));
});
