// Diagnóstico temporal: prueba consultas a Google News RSS y GDELT.
const TIMEOUT = 9000;

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "PulsoGlobal/1.0 (public-feed-reader)" } });
    if (!res.ok) return `HTTP ${res.status}`;
    return await res.text();
  } catch (error) {
    return `FETCH_ERROR ${error.name}`;
  } finally { clearTimeout(timer); }
}

function countItems(xml, label) {
  if (xml.startsWith("HTTP") || xml.startsWith("FETCH_ERROR")) { console.log(`${label}: ${xml}`); return; }
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  const dates = items.slice(0, 3).map(([, item]) => (item.match(/<pubDate>([^<]*)<\/pubDate>/i)?.[1] ?? "?"));
  console.log(`${label}: items=${items.length} pubDateSample=${JSON.stringify(dates)}`);
}

const bigOr = "(política OR politics OR politique OR economia OR economy OR économie OR tecnología OR technology OR ciência OR science OR clima OR climate OR santé OR saúde OR health OR internacional OR international)";

const tests = [
  ["portada-es", "https://news.google.com/rss?hl=es&gl=ES&ceid=ES:es"],
  ["busqueda-tema-bigOR", `https://news.google.com/rss/search?${new URLSearchParams({ q: bigOr, hl: "es", gl: "ES", ceid: "ES:es" })}`],
  ["busqueda-tema-simple", `https://news.google.com/rss/search?${new URLSearchParams({ q: "política OR economía", hl: "es", gl: "ES", ceid: "ES:es" })}`],
  ["busqueda-pais", `https://news.google.com/rss/search?${new URLSearchParams({ q: '"España"', hl: "es", gl: "ES", ceid: "ES:es" })}`],
  ["gdelt", "https://api.gdeltproject.org/api/v2/doc/doc?query=news&timespan=24h&mode=artlist&maxrecords=20&sort=datedesc&format=json"],
];

for (const [label, url] of tests) {
  countItems(await fetchText(url), label);
}
