import { countrySearchName, derivePulse, filterTimeAndDedupe, normalizeArticle, parseRssItems } from "./pulse-data";
import { PULSE_TIMESPANS } from "./pulse-types";
import type { ArticleContext } from "./pulse-data";
import type { PulseArticle, PulseCategory, PulseMode, PulseResponse, PulseSource, PulseTimespan } from "./pulse-types";

const CATEGORY_QUERIES: Record<PulseCategory, string> = {
  all: "(política OR politics OR politique OR economia OR economy OR économie OR tecnología OR technology OR ciência OR science OR clima OR climate OR santé OR saúde OR health OR internacional OR international)",
  politics: "(política OR politics OR politique OR governo OR government OR gobierno OR elecciones OR elections OR diplomatie OR diplomacy)",
  economy: "(economía OR economia OR economy OR économie OR mercados OR markets OR commerce OR inflação OR inflation)",
  technology: '(tecnología OR tecnologia OR technology OR technologie OR "inteligencia artificial" OR "artificial intelligence" OR ciberseguridad OR cybersecurity)',
  science: "(ciencia OR ciência OR science OR recherche OR research OR espacio OR space)",
  health: "(salud OR saúde OR health OR santé OR medicina OR medicine OR epidemia OR outbreak)",
  climate: "(clima OR climate OR climat OR ambiente OR environment OR inundación OR flood OR sequía OR drought)",
  security: "(conflicto OR conflict OR sécurité OR segurança OR security OR guerra OR war)",
  culture: "(cultura OR culture OR arte OR art OR sociedad OR society)",
  sports: "(deportes OR esportes OR sports OR sport OR fútbol OR football OR athletics)",
  education: "(educación OR educação OR education OR écoles OR schools OR universidad OR university)",
};
export type PulseRequest = { category: PulseCategory; timespan: PulseTimespan; mode: PulseMode; country: string; query: string };
export function parsePulseRequest(params: URLSearchParams): PulseRequest {
  const category = params.get("category") ?? "all";
  const timespan = params.get("timespan") ?? "24h";
  const country = (params.get("country") ?? "").toUpperCase();
  return {
    category: Object.hasOwn(CATEGORY_QUERIES, category) ? category as PulseCategory : "all",
    timespan: PULSE_TIMESPANS.includes(timespan as PulseTimespan) ? timespan as PulseTimespan : "24h",
    mode: params.get("mode") === "early" ? "early" : "news", country: countrySearchName(country) ? country : "",
    query: (params.get("q") ?? "").replace(/[\u0000-\u001f\u007f"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100),
  };
}

type FetchLike = typeof fetch;
const MAX_BODY = 1_500_000;
export async function boundedFetchText(url: string, expected: "json" | "xml", fetcher: FetchLike = fetch, timeoutMs = 7000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal, headers: { Accept: expected === "json" ? "application/json, application/geo+json" : "application/rss+xml, application/xml, text/xml", "User-Agent": "PulsoGlobal/1.0 (public-feed-reader)" }, redirect: "manual", cache: "no-store" });
    if (response.status >= 300 && response.status < 400) throw new Error("Redirección rechazada");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!(expected === "json" ? ["application/json", "application/geo+json"] : ["application/rss+xml", "application/xml", "text/xml", "application/atom+xml"]).includes(contentType)) throw new Error("Formato de respuesta inesperado");
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BODY) throw new Error("Respuesta demasiado grande");
    if (!response.body) throw new Error("Respuesta vacía");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let length = 0;
    let text = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > MAX_BODY) throw new Error("Respuesta demasiado grande");
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text + decoder.decode();
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    finally { reader.releaseLock(); }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("La fuente superó el tiempo de espera");
    throw error;
  } finally { clearTimeout(timer); }
}

type ProviderResult = { articles: PulseArticle[]; sources: PulseSource[]; errors: string[]; fetchedAt: string };
const cache = new Map<string, { value: ProviderResult; expires: number }>();
const inFlight = new Map<string, Promise<ProviderResult>>();
let starts: number[] = [];
let gdeltCooldownUntil = 0;
export class PulseBusyError extends Error { constructor() { super("Hay demasiadas consultas nuevas. Espera unos segundos y vuelve a intentar."); } }
// Per-process limits bound memory and upstream requests. Multi-isolate production deployments
// should also set an edge rate limit; this is not a distributed quota.
async function cached(key: string, task: () => Promise<ProviderResult>, now: number): Promise<ProviderResult> {
  for (const [cacheKey, entry] of cache) if (entry.expires <= now) cache.delete(cacheKey);
  const hit = cache.get(key);
  if (hit) return hit.value;
  const pending = inFlight.get(key);
  if (pending) return pending;
  starts = starts.filter((time) => time > now - 60000);
  if (starts.length >= 30 || inFlight.size >= 6) throw new PulseBusyError();
  starts.push(now);
  const promise = task().then((value) => {
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, { value, expires: Date.now() + (value.articles.length ? 90_000 : 30_000) });
    return value;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
function errorMessage(error: unknown): string {
  if (error instanceof SyntaxError) return "La fuente devolvió datos inválidos";
  return error instanceof Error && /^(HTTP \d{3}|Formato de respuesta inesperado|Respuesta demasiado grande|Respuesta vacía|RSS inválido|La fuente superó el tiempo de espera|GDELT en espera|GDELT omitido)$/.test(error.message) ? error.message : "No se pudo conectar con la fuente";
}
function normalizeMany(raw: unknown[], context: ArticleContext): PulseArticle[] {
  return raw.slice(0, 500).map((item) => normalizeArticle(item, context)).filter((item): item is PulseArticle => item !== null);
}
type NewsRssFeed = { name: string; url: string; homeUrl: string; note: string };
const BBC_FEEDS: Record<PulseCategory, { name: string; url: string }> = {
  all: { name: "BBC News · Mundo", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  politics: { name: "BBC News · Mundo", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  economy: { name: "BBC News · Negocios", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  technology: { name: "BBC News · Tecnología", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  science: { name: "BBC News · Ciencia", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
  health: { name: "BBC News · Salud", url: "https://feeds.bbci.co.uk/news/health/rss.xml" },
  climate: { name: "BBC News · Ambiente", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
  security: { name: "BBC News · Mundo", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  culture: { name: "BBC News · Cultura", url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml" },
  sports: { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
  education: { name: "BBC News · Mundo", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
};
export function newsUrls(request: PulseRequest): { gdelt: string | null; rss: NewsRssFeed[] } {
  const country = countrySearchName(request.country);
  const placeTerms = [country ? `("${country.english}" OR "${country.spanish}")` : "", request.query ? `"${request.query}"` : ""].filter(Boolean).join(" ");
  const topic = request.category === "all" ? "" : CATEGORY_QUERIES[request.category];
  const gdeltQuery = `${topic} ${placeTerms}`.trim();
  const gdeltParams = new URLSearchParams({ query: gdeltQuery, timespan: request.timespan, mode: "artlist", maxrecords: "250", sort: "datedesc", format: "json" });
  // Google News RSS has no `when:` operator; sending it would filter results as literal words.
  // Parenthesized groups also make the search return stale articles, so the topic goes in flat.
  // The API layer re-filters every item by time. With no topic and no place, use the live
  // front-page editions instead of a search: broader and always current.
  const rssQuery = `${topic.replace(/[()]/g, "")} ${placeTerms}`.trim();
  const editions = [
    { code: "PE", name: "Google News · Perú", hl: "es-419", gl: "PE", ceid: "PE:es-419" },
    { code: "MX", name: "Google News · México", hl: "es-419", gl: "MX", ceid: "MX:es-419" },
    { code: "ES", name: "Google News · España", hl: "es", gl: "ES", ceid: "ES:es" },
    { code: "US", name: "Google News · Global inglés", hl: "en-US", gl: "US", ceid: "US:en" },
    { code: "BR", name: "Google News · Brasil", hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" },
    { code: "FR", name: "Google News · Francia", hl: "fr", gl: "FR", ceid: "FR:fr" },
    { code: "IN", name: "Google News · India", hl: "en-IN", gl: "IN", ceid: "IN:en" },
  ];
  if (country && !editions.some((edition) => edition.code === request.country)) {
    editions.unshift({ code: request.country, name: `Google News · ${country.spanish}`, hl: "en", gl: request.country, ceid: `${request.country}:en` });
  }
  const rss = editions.map((edition) => ({
    name: edition.name,
    url: rssQuery
      ? `https://news.google.com/rss/search?${new URLSearchParams({ q: rssQuery, hl: edition.hl, gl: edition.gl, ceid: edition.ceid })}`
      : `https://news.google.com/rss?${new URLSearchParams({ hl: edition.hl, gl: edition.gl, ceid: edition.ceid })}`,
    homeUrl: "https://news.google.com/",
    note: rssQuery
      ? "Búsqueda por tema y lugar en la edición regional. Los enlaces pasan por Google News; la hora la comunica el propio feed."
      : "Portada viva de la edición regional: titulares principales actualizados continuamente.",
  }));
  const bbc = BBC_FEEDS[request.category];
  rss.push({ name: bbc.name, url: bbc.url, homeUrl: "https://www.bbc.com/news", note: "Canal RSS público de BBC. Sus miniaturas se muestran como multimedia de la fuente y conservan el enlace al artículo original." });
  return { gdelt: gdeltQuery ? `https://api.gdeltproject.org/api/v2/doc/doc?${gdeltParams}` : null, rss };
}
export async function loadNews(request: PulseRequest, now: number, fetcher: FetchLike = fetch): Promise<ProviderResult> {
  const urls = newsUrls(request);
  const sources: PulseSource[] = [];
  const errors: string[] = [];
  const [gdelt, ...rssResults] = await Promise.allSettled([
    urls.gdelt && now >= gdeltCooldownUntil
      ? boundedFetchText(urls.gdelt, "json", fetcher, 6_000).then((text) => {
        const data: unknown = JSON.parse(text);
        if (!data || typeof data !== "object" || !Array.isArray((data as { articles?: unknown }).articles)) throw new SyntaxError();
        return filterTimeAndDedupe(normalizeMany((data as { articles: unknown[] }).articles, { provider: "GDELT", timestampBasis: "observed" }), request.timespan, now);
      })
      : Promise.reject(new Error(urls.gdelt ? "GDELT en espera" : "GDELT omitido")),
    ...urls.rss.map((feed) => boundedFetchText(feed.url, "xml", fetcher, 4_500)
      .then((text) => filterTimeAndDedupe(normalizeMany(parseRssItems(text), { provider: feed.name, timestampBasis: "published" }), request.timespan, now))),
  ]);
  const gathered: PulseArticle[] = [];
  if (gdelt.status === "fulfilled") {
    gathered.push(...gdelt.value);
    sources.push({ name: "GDELT", url: "https://www.gdeltproject.org/", status: gdelt.value.length ? "ok" : "empty", count: gdelt.value.length, note: "Índice global multilingüe. La hora indica detección por GDELT, no acredita cuándo publicó el medio." });
  } else {
    const note = errorMessage(gdelt.reason);
    if (note === "HTTP 429") {
      // GDELT allows roughly one request every five seconds; back off for a full minute.
      gdeltCooldownUntil = Date.now() + 65_000;
    }
    if (note !== "GDELT en espera" && note !== "GDELT omitido") errors.push(`GDELT: ${note}`);
    sources.push({
      name: "GDELT", url: "https://www.gdeltproject.org/", status: "empty", count: 0,
      note: note === "HTTP 429" ? "GDELT limitó la frecuencia de consulta; se reintenta en unos minutos."
        : note === "GDELT en espera" ? "En pausa temporal por el límite de frecuencia de GDELT."
        : note === "GDELT omitido" ? "Sin consulta específica: el panorama mundial usa las portadas regionales y BBC."
        : note,
    });
  }
  rssResults.forEach((result, index) => {
    const feed = urls.rss[index];
    if (result.status === "fulfilled") {
      gathered.push(...result.value);
      sources.push({ name: feed.name, url: feed.homeUrl, status: result.value.length ? "ok" : "empty", count: result.value.length, note: feed.note });
    } else {
      const note = errorMessage(result.reason); errors.push(`${feed.name}: ${note}`);
      sources.push({ name: feed.name, url: "https://news.google.com/", status: "error", count: 0, note });
    }
  });
  // Keep the view bounded while reserving room for source-provided multimedia.
  // A purely chronological cut can otherwise let high-volume text-only indexes
  // erase every photographic item even when a public feed supplied it.
  const candidates = filterTimeAndDedupe(gathered, request.timespan, now, 280);
  const visual = candidates.filter((article) => article.media).slice(0, 24);
  const visualIds = new Set(visual.map((article) => article.id));
  const articles = [...visual, ...candidates.filter((article) => !visualIds.has(article.id)).slice(0, 216 - visual.length)]
    .sort((a, b) => b.seenDate.localeCompare(a.seenDate));
  return { articles, sources, errors, fetchedAt: new Date(now).toISOString() };
}

export function parseEarthquakes(payload: unknown): PulseArticle[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { features?: unknown }).features)) throw new SyntaxError();
  return (payload as { features: unknown[] }).features.slice(0, 500).flatMap((feature) => {
    if (!feature || typeof feature !== "object") return [];
    const item = feature as { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown[] } };
    const properties = item.properties;
    const coordinates = item.geometry?.coordinates;
    if (!properties || !coordinates || typeof properties.mag !== "number" || !Number.isFinite(properties.mag) || properties.mag < 2.5 || properties.mag > 10 || properties.type !== "earthquake") return [];
    const raw = { title: `Terremoto M ${properties.mag.toFixed(1)} · ${typeof properties.place === "string" ? properties.place : "Ubicación indicada por USGS"}`, url: properties.url, timestamp: properties.time, language: "English", location: { lat: coordinates[1], lng: coordinates[0], label: properties.place } };
    const article = normalizeArticle(raw, { provider: "USGS", sourceName: "USGS · registro sísmico", kind: "earthquake", timestampBasis: "event", reviewStatus: properties.status === "reviewed" ? "reviewed" : "preliminary" });
    return article && article.destinationHost === "earthquake.usgs.gov" ? [article] : [];
  });
}
const EARLY_FEEDS = [
  { name: "USGS", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson", format: "json", kind: "earthquake", reviewStatus: "preliminary", hosts: ["earthquake.usgs.gov"], note: "Registros públicos de sismos M2,5+. La fecha indica el evento; los datos preliminares pueden cambiar." },
  { name: "GDACS", url: "https://www.gdacs.org/xml/rss.xml", format: "xml", kind: "official", reviewStatus: "preliminary", hosts: ["gdacs.org", "www.gdacs.org"], note: "Alertas públicas de desastres de GDACS (ONU/Comisión Europea). Son señales operativas y pueden actualizarse." },
  { name: "NASA", url: "https://www.nasa.gov/feed/", format: "xml", kind: "official", reviewStatus: "unknown", hosts: ["nasa.gov"], note: "Publicaciones oficiales de NASA; pueden haber sido difundidas ya por otros medios." },
  { name: "arXiv", url: "https://rss.arxiv.org/rss/cs.AI", format: "xml", kind: "preprint", reviewStatus: "not-peer-reviewed", hosts: ["arxiv.org"], note: "Anuncios públicos de investigación en IA; revisión por pares no verificada. Feed diario, habitualmente vacío los fines de semana." },
] as const;
export async function loadEarly(now: number, fetcher: FetchLike = fetch): Promise<ProviderResult> {
  const settled = await Promise.allSettled(EARLY_FEEDS.map(async (feed) => {
    const text = await boundedFetchText(feed.url, feed.format, fetcher);
    const articles = feed.kind === "earthquake" ? parseEarthquakes(JSON.parse(text)) : normalizeMany(parseRssItems(text), { provider: feed.name, sourceName: feed.name, kind: feed.kind, timestampBasis: "published", reviewStatus: feed.reviewStatus })
      .filter((article) => feed.hosts.some((host) => article.destinationHost === host || article.destinationHost.endsWith(`.${host}`)));
    return filterTimeAndDedupe(articles, "7d", now);
  }));
  const articles: PulseArticle[] = [];
  const errors: string[] = [];
  const sources = settled.map((result, index): PulseSource => {
    const feed = EARLY_FEEDS[index];
    if (result.status === "fulfilled") {
      articles.push(...result.value);
      return { name: feed.name, url: feed.url, status: result.value.length ? "ok" : "empty", count: result.value.length, note: feed.note };
    }
    const note = errorMessage(result.reason); errors.push(`${feed.name}: ${note}`);
    return { name: feed.name, url: feed.url, status: "error", count: 0, note };
  });
  return { articles, sources, errors, fetchedAt: new Date(now).toISOString() };
}
export async function getPulse(request: PulseRequest): Promise<PulseResponse> {
  const now = Date.now();
  // Share the combined early feeds across every filter; no per-query arXiv calls.
  const key = request.mode === "early" ? "early" : JSON.stringify(request);
  const result = await cached(key, () => request.mode === "early" ? loadEarly(now) : loadNews(request, now), now);
  let articles = filterTimeAndDedupe(result.articles, request.timespan, now, 216);
  if (request.mode === "early" && request.category !== "all") {
    articles = articles.filter((article) => request.category === "science"
      ? article.kind === "earthquake" || article.kind === "preprint" || article.provider === "NASA"
      : request.category === "technology" && article.provider === "arXiv");
  }
  // Town-only titles can lack the country name. Search context never becomes map evidence.
  const view = derivePulse(articles, { country: request.query ? undefined : request.country, query: request.query || undefined });
  const sources = result.sources.map((source) => ({ ...source, count: view.articles.filter((article) => article.provider === source.name).length }));
  return {
    ...view, mode: request.mode, timespan: request.timespan, category: request.category, pointBasis: "mentionedCountries",
    dataProvider: sources.filter((source) => source.status === "ok").map((source) => source.name).join(" · ") || "Sin resultados disponibles",
    fetchedAt: result.fetchedAt, partial: result.errors.length > 0 || !view.articles.length, sources, errors: result.errors,
    coverageNote: request.mode === "early"
      ? "Fuentes públicas directas: sismos M2,5+ (USGS), alertas GDACS, publicaciones NASA e investigación en IA (arXiv). Son señales oficiales que pueden actualizarse; no predicen acontecimientos."
      : `Muestra combinada de hasta 216 titulares multilingües: GDELT, ${sources.filter((source) => source.name.startsWith("Google News")).length} ediciones de Google News y BBC News. El mapa solo marca lugares explícitamente mencionados en la fuente.${request.query ? " La búsqueda por localidad aporta contexto y puede incluir coincidencias sin país identificado." : ""} No es un archivo completo: cada titular enlaza su origen.`,
  };
}
