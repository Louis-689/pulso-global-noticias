import assert from "node:assert/strict";
import test from "node:test";
import { extractArticle } from "../lib/extract";
import { safeFetch } from "../lib/safe-fetch";
import { isTrustedHost } from "../lib/trusted";

test("extractArticle conserva solo los párrafos del artículo", () => {
  const html = `<html><head><meta property="og:title" content="Crisis en la frontera"><script>track()</script></head><body>
    <nav><p>Menú principal con muchos enlaces que no son parte de la noticia</p></nav>
    <article><h1>Crisis</h1><p>Primer párrafo de la noticia con suficientes palabras para contar.</p>
    <p>Segundo párrafo con <a href="/x">un enlace</a> y más detalles de lo ocurrido ayer.</p>
    <p>Corto</p><figure><p>Pie de foto que no debería aparecer en el texto final</p></figure></article>
    <footer><p>© Copyright del medio y otros textos legales de pie de página</p></footer></body></html>`;
  const result = extractArticle(html);
  assert.equal(result.title, "Crisis en la frontera");
  assert.equal(result.paragraphs.length, 2);
  assert.match(result.paragraphs[1], /un enlace y más detalles/);
});

test("safeFetch no sigue redirecciones fuera de la lista ni acepta SVG", async () => {
  const redirect: typeof fetch = async () => new Response(null, { status: 302, headers: { location: "https://propaganda.example/a" } });
  assert.equal(await safeFetch("https://www.reuters.com/a", { accept: /^text\/html$/, maxBytes: 1000, allow: isTrustedHost, fetcher: redirect }), null);
  const svg: typeof fetch = async () => new Response("<svg onload=alert(1)>", { headers: { "content-type": "image/svg+xml" } });
  assert.equal(await safeFetch("https://cdn.example.com/a.svg", { accept: /^image\/(jpeg|png|webp|gif|avif)$/, maxBytes: 1000, fetcher: svg }), null);
  const big: typeof fetch = async () => new Response("x".repeat(2000), { headers: { "content-type": "image/png" } });
  assert.equal(await safeFetch("https://cdn.example.com/a.png", { accept: /^image\/png$/, maxBytes: 1000, fetcher: big }), null);
  const ok: typeof fetch = async () => new Response("png", { headers: { "content-type": "image/png" } });
  assert.equal((await safeFetch("https://cdn.example.com/a.png", { accept: /^image\/png$/, maxBytes: 1000, fetcher: ok }))?.type, "image/png");
  assert.equal(await safeFetch("http://127.0.0.1/a.png", { accept: /^image\/png$/, maxBytes: 1000, fetcher: ok }), null);
});

test("extractArticle respeta apóstrofos en el título", () => {
  assert.equal(extractArticle(`<meta property="og:title" content="Biden's new plan"><article><p>Un párrafo suficientemente largo para la prueba de extracción.</p></article>`).title, "Biden's new plan");
});

test("isPrivateAddress bloquea redes internas", async () => {
  const { isPrivateAddress } = await import("../lib/safe-fetch");
  for (const address of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.20.1.1", "192.168.1.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) assert.equal(isPrivateAddress(address), true, address);
  for (const address of ["8.8.8.8", "151.101.1.1", "2a04:4e42::1"]) assert.equal(isPrivateAddress(address), false, address);
});

test("el relé de imágenes solo acepta hosts conocidos y limita por dirección", async () => {
  const { isAllowedMediaHost, rememberMediaHosts } = await import("../lib/media-hosts");
  const { allowRequest } = await import("../lib/rate-limit");
  assert.equal(isAllowedMediaHost("ichef.bbci.co.uk"), true);
  assert.equal(isAllowedMediaHost("random-site.example"), false);
  rememberMediaHosts(["https://img.random-site.example/a.jpg"]);
  assert.equal(isAllowedMediaHost("img.random-site.example"), true);
  const results = Array.from({ length: 4 }, () => allowRequest("t", "1.2.3.4", 3, 1000));
  assert.deepEqual(results, [true, true, true, false]);
});
