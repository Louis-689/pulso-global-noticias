import { countrySearchName, derivePulse, filterTimeAndDedupe, normalizeArticle, parseRssItems } from "./pulse-data";
import { PULSE_TIMESPANS } from "./pulse-types";
import { LIBRARY } from "./library";
import { enrichMedia } from "./enrich";
import { isTrustedHost } from "./trusted";
import { corroborate } from "./verify";
import { rememberMediaHosts } from "./media-hosts";
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
  factcheck: '(verificación OR "fact check" OR desinformación OR disinformation OR désinformation OR bulo OR "fake news" OR falso)',
};
export const NEWS_LANGUAGES = ["es", "en", "pt", "fr", "de", "it", "ru", "ar", "zh", "ja", "hi"] as const;
export type NewsLanguage = (typeof NEWS_LANGUAGES)[number];
export type PulseRequest = { category: PulseCategory; timespan: PulseTimespan; mode: PulseMode; country: string; query: string; lang?: NewsLanguage };
export function parsePulseRequest(params: URLSearchParams): PulseRequest {
  const category = params.get("category") ?? "all";
  const timespan = params.get("timespan") ?? "24h";
  const country = (params.get("country") ?? "").toUpperCase();
  return {
    category: Object.hasOwn(CATEGORY_QUERIES, category) ? category as PulseCategory : "all",
    timespan: PULSE_TIMESPANS.includes(timespan as PulseTimespan) ? timespan as PulseTimespan : "24h",
    mode: params.get("mode") === "early" ? "early" : params.get("mode") === "library" ? "library" : "news",
    lang: (NEWS_LANGUAGES as readonly string[]).includes(params.get("lang") ?? "") ? params.get("lang") as NewsLanguage : "es", country: countrySearchName(country) ? country : "",
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

type ProviderResult = { articles: PulseArticle[]; sources: PulseSource[]; errors: string[]; fetchedAt: string; untrustedDropped?: number };
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
    // A simultaneous provider timeout must not poison the shared cache with a
    // convincing-looking empty result. Genuine empty windows are still cached
    // briefly, while successful samples remain stable between polling cycles.
    const transientEmpty = !value.articles.length && value.errors.length > 0;
    cache.set(key, { value, expires: Date.now() + (value.articles.length ? 90_000 : transientEmpty ? 4_000 : 15_000) });
    return value;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function retryableProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/^(Formato de respuesta inesperado|Respuesta demasiado grande|Respuesta vacía|RSS inválido|Redirección rechazada|HTTP 4\d\d)$/.test(message)) return false;
  return true;
}

export async function fetchProviderText(
  url: string,
  expected: "json" | "xml",
  fetcher: FetchLike = fetch,
  firstTimeoutMs = 5_000,
  retryTimeoutMs = 8_000,
): Promise<string> {
  try {
    return await boundedFetchText(url, expected, fetcher, firstTimeoutMs);
  } catch (error) {
    if (!retryableProviderError(error)) throw error;
    // One bounded retry absorbs cold DNS/TLS starts without hiding persistent
    // outages or multiplying requests indefinitely.
    return boundedFetchText(url, expected, fetcher, retryTimeoutMs);
  }
}

async function settleLimited<T, R>(items: T[], concurrency: number, task: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { status: "fulfilled", value: await task(items[index], index) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  });
  await Promise.all(workers);
  return results;
}
function errorMessage(error: unknown): string {
  if (error instanceof SyntaxError) return "La fuente devolvió datos inválidos";
  return error instanceof Error && /^(HTTP \d{3}|Formato de respuesta inesperado|Respuesta demasiado grande|Respuesta vacía|RSS inválido|La fuente superó el tiempo de espera|GDELT en espera|GDELT omitido)$/.test(error.message) ? error.message : "No se pudo conectar con la fuente";
}
function normalizeMany(raw: unknown[], context: ArticleContext): PulseArticle[] {
  return raw.slice(0, 500).map((item) => normalizeArticle(item, context)).filter((item): item is PulseArticle => item !== null);
}
type NewsRssFeed = { name: string; url: string; homeUrl: string; note: string; filterToTopic?: boolean; timeoutMs?: number; lang?: string };
const CATEGORY_TERMS: Record<Exclude<PulseCategory, "all">, string[]> = {
  politics: ["politic", "gobiern", "government", "president", "ministro", "elecci", "diploma", "parlament", "congreso", "kremlin"],
  economy: ["econom", "mercad", "market", "inflaci", "inflation", "comerci", "trade", "banco", "bank", "empresa", "business"],
  technology: ["tecnolog", "technology", "inteligencia artificial", "artificial intelligence", "ciber", "cyber", "software", "robot", "chip"],
  science: ["ciencia", "science", "investig", "research", "espacio", "space", "nasa", "estudio", "study"],
  health: ["salud", "health", "medic", "hospital", "virus", "vacun", "epidem", "outbreak", "enfermed"],
  climate: ["clima", "climate", "ambient", "environment", "inund", "flood", "sequia", "drought", "incend", "temperatur"],
  security: ["conflict", "conflicto", "seguridad", "security", "guerra", "war", "militar", "ataque", "attack", "misil"],
  culture: ["cultura", "culture", "arte", "art", "cine", "film", "music", "musica", "festival", "libro"],
  sports: ["deporte", "sport", "futbol", "football", "tenis", "tennis", "liga", "tournament", "campeon"],
  education: ["educa", "school", "escuela", "universidad", "university", "estudiante", "student", "docente", "teacher"],
  factcheck: ["verifica", "fact check", "fact-check", "factcheck", "bulo", "falso", "false", "fake", "desinforma", "disinforma", "misinforma", "enganos", "misleading", "hoax", "desmient", "chequeo", "debunk"],
};
function topicMatches(title: string, category: PulseCategory): boolean {
  if (category === "all") return true;
  const folded = title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  // Terms must start a word: "art" should not match inside "earthquake".
  return CATEGORY_TERMS[category].some((term) => new RegExp(`(^|[^\\p{L}\\p{N}])${term}`, "u").test(folded));
}
export function detectTopic(title: string): PulseCategory | undefined {
  return (Object.keys(CATEGORY_TERMS) as Array<Exclude<PulseCategory, "all">>).find((category) => topicMatches(title, category));
}
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
  factcheck: { name: "BBC News · Mundo", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
};
const CATEGORY_DIRECT_FEEDS: Partial<Record<PulseCategory, NewsRssFeed>> = {
  economy: { name: "NPR · Business", url: "https://feeds.npr.org/1006/rss.xml", homeUrl: "https://www.npr.org/sections/business/", note: "Canal RSS temático directo de NPR Business.", timeoutMs: 5_000 },
  technology: { name: "TechCrunch", url: "https://techcrunch.com/feed/", homeUrl: "https://techcrunch.com/", note: "Canal RSS temático directo de TechCrunch.", timeoutMs: 5_000 },
  science: { name: "ScienceDaily", url: "https://www.sciencedaily.com/rss/all.xml", homeUrl: "https://www.sciencedaily.com/", note: "Canal RSS directo de novedades científicas de ScienceDaily; cada artículo conserva su fuente.", timeoutMs: 5_000 },
  health: { name: "WHO · News", url: "https://www.who.int/rss-feeds/news-english.xml", homeUrl: "https://www.who.int/news", note: "Canal RSS institucional de noticias de la Organización Mundial de la Salud.", timeoutMs: 5_000 },
  climate: { name: "Climate Home News", url: "https://www.climatechangenews.com/feed/", homeUrl: "https://www.climatechangenews.com/", note: "Canal RSS temático directo de Climate Home News.", timeoutMs: 5_000 },
  culture: { name: "NPR · Arts & Life", url: "https://feeds.npr.org/1008/rss.xml", homeUrl: "https://www.npr.org/sections/arts/", note: "Canal RSS temático directo de NPR Arts & Life.", timeoutMs: 5_000 },
  education: { name: "EdSurge", url: "https://www.edsurge.com/articles_rss", homeUrl: "https://www.edsurge.com/", note: "Canal RSS temático directo de EdSurge.", timeoutMs: 5_000 },
};
// Fact-checkers (IFCN signatories) debunk distorted stories: the antidote to propaganda.
const FACT = (name: string, url: string, homeUrl: string, lang: string): NewsRssFeed => ({ name, url, homeUrl, lang, note: "Verificador de datos firmante de la red internacional IFCN: desmiente bulos y propaganda.", timeoutMs: 5_000 });
const FACTCHECK_FEEDS: Partial<Record<NewsLanguage, NewsRssFeed[]>> = {
  es: [FACT("Maldita.es", "https://maldita.es/feed/", "https://maldita.es/", "es"), FACT("Chequeado", "https://chequeado.com/feed/", "https://chequeado.com/", "es")],
  en: [FACT("Full Fact", "https://fullfact.org/feed/", "https://fullfact.org/", "en"), FACT("PolitiFact", "https://www.politifact.com/rss/all/", "https://www.politifact.com/", "en"), FACT("Snopes", "https://www.snopes.com/feed/", "https://www.snopes.com/", "en")],
  pt: [FACT("Aos Fatos", "https://www.aosfatos.org/noticias/feed/", "https://www.aosfatos.org/", "pt")],
};
// UN News publishes the same newsroom in the six official languages and Portuguese.
const UN = (lang: string, name: string): NewsRssFeed => ({ name, url: `https://news.un.org/feed/subscribe/${lang}/news/all/rss.xml`, homeUrl: `https://news.un.org/${lang}/`, lang, note: "Noticias ONU en el idioma del lector; es una fuente institucional.", timeoutMs: 5_000 });
// Direct publisher feeds in the reader's language. They usually carry photos.
const BBC = (service: string, name: string): NewsRssFeed => ({ name, url: `https://feeds.bbci.co.uk/${service}/rss.xml`, homeUrl: `https://www.bbc.com/${service.split("/")[0]}`, note: "Servicio de la BBC en el idioma del lector.", timeoutMs: 5_000 });
const LANGUAGE_FEED_LIST: Record<NewsLanguage, NewsRssFeed[]> = {
  es: [BBC("mundo", "BBC Mundo"), UN("es", "Noticias ONU"),
    { name: "El País América", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/america/portada", homeUrl: "https://elpais.com/america/", note: "Portada de El País América.", timeoutMs: 5_000 },
    { name: "France 24 Español", url: "https://www.france24.com/es/rss", homeUrl: "https://www.france24.com/es/", note: "Canal RSS de France 24 en español.", timeoutMs: 5_000 },
    { name: "DW Español", url: "https://rss.dw.com/xml/rss-sp-all", homeUrl: "https://www.dw.com/es/", note: "Canal RSS de DW en español.", timeoutMs: 5_000 }],
  en: [],
  pt: [BBC("portuguese", "BBC News Brasil"), UN("pt", "ONU News")],
  fr: [UN("fr", "ONU Info"), { name: "France 24 Français", url: "https://www.france24.com/fr/rss", homeUrl: "https://www.france24.com/fr/", note: "Canal RSS de France 24 en francés.", timeoutMs: 5_000 }, BBC("afrique", "BBC Afrique")],
  de: [{ name: "DW Deutsch", url: "https://rss.dw.com/xml/rss-de-all", homeUrl: "https://www.dw.com/de/", note: "Canal RSS de DW en alemán.", timeoutMs: 5_000 }],
  it: [{ name: "ANSA", url: "https://www.ansa.it/sito/ansait_rss.xml", homeUrl: "https://www.ansa.it/", note: "Agencia italiana ANSA.", timeoutMs: 5_000 }],
  ru: [BBC("russian", "BBC Русская служба"), UN("ru", "Новости ООН")],
  ar: [BBC("arabic", "BBC عربي"), UN("ar", "أخبار الأمم المتحدة"), { name: "France 24 عربي", url: "https://www.france24.com/ar/rss", homeUrl: "https://www.france24.com/ar/", note: "Canal RSS de France 24 en árabe.", timeoutMs: 5_000 }],
  zh: [BBC("zhongwen/simp", "BBC 中文"), UN("zh", "联合国新闻")],
  ja: [BBC("japanese", "BBC ニュース")],
  hi: [BBC("hindi", "BBC हिन्दी")],
};
const LANGUAGE_FEEDS = Object.fromEntries(Object.entries(LANGUAGE_FEED_LIST)
  .map(([lang, feeds]) => [lang, feeds.map((feed) => ({ ...feed, lang: feed.lang ?? lang }))])) as Record<NewsLanguage, NewsRssFeed[]>;

type Edition = { code: string; name: string; hl: string; gl: string; ceid: string; lang: NewsLanguage };
const ed = (code: string, name: string, hl: string, gl: string, ceid: string, lang: NewsLanguage): Edition => ({ code, name: `Google News · ${name}`, hl, gl, ceid, lang });
// Several regional editions per language, so the chosen language fills the feed.
const EDITIONS: Record<NewsLanguage, Edition[]> = {
  es: [ed("MX", "México", "es-419", "MX", "MX:es-419", "es"), ed("ES", "España", "es", "ES", "ES:es", "es"), ed("AR", "Argentina", "es-419", "AR", "AR:es-419", "es"),
    ed("CO", "Colombia", "es-419", "CO", "CO:es-419", "es"), ed("PE", "Perú", "es-419", "PE", "PE:es-419", "es"), ed("US-ES", "EE. UU. en español", "es-419", "US", "US:es-419", "es")],
  en: [ed("US", "Global inglés", "en-US", "US", "US:en", "en"), ed("GB", "Reino Unido", "en-GB", "GB", "GB:en", "en"), ed("IN", "India", "en-IN", "IN", "IN:en", "en"), ed("ZA", "África austral", "en-ZA", "ZA", "ZA:en", "en")],
  pt: [ed("BR", "Brasil", "pt-BR", "BR", "BR:pt-419", "pt"), ed("PT", "Portugal", "pt-PT", "PT", "PT:pt-150", "pt")],
  fr: [ed("FR", "Francia", "fr", "FR", "FR:fr", "fr"), ed("CA-FR", "Canadá francés", "fr-CA", "CA", "CA:fr", "fr")],
  de: [ed("DE", "Alemania", "de", "DE", "DE:de", "de"), ed("AT", "Austria", "de", "AT", "AT:de", "de"), ed("CH-DE", "Suiza", "de", "CH", "CH:de", "de")],
  it: [ed("IT", "Italia", "it", "IT", "IT:it", "it")],
  ru: [ed("RU", "Русский", "ru", "RU", "RU:ru", "ru")],
  ar: [ed("EG", "Mundo árabe", "ar", "EG", "EG:ar", "ar"), ed("AE", "Golfo", "ar", "AE", "AE:ar", "ar"), ed("LB", "Levante", "ar", "LB", "LB:ar", "ar")],
  zh: [ed("TW", "中文", "zh-TW", "TW", "TW:zh-Hant", "zh"), ed("HK", "香港", "zh-HK", "HK", "HK:zh-Hant", "zh")],
  ja: [ed("JP", "Japón", "ja", "JP", "JP:ja", "ja")],
  hi: [ed("IN-HI", "हिन्दी", "hi", "IN", "IN:hi", "hi")],
};
// A few editions in other languages keep the world view broad (and shown on request).
const WORLD_EDITIONS = [EDITIONS.en[0], EDITIONS.fr[0], EDITIONS.ar[0], EDITIONS.en[2], EDITIONS.pt[0]];

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
  const lang = request.lang ?? "es";
  const own = EDITIONS[lang];
  const world = WORLD_EDITIONS.filter((edition) => edition.lang !== lang);
  // Searches use fewer editions: direct publisher feeds below add redundancy
  // without hammering Google from the same address.
  const editions: Edition[] = rssQuery ? [...own.slice(0, 3), ...world.slice(0, 1)] : [...own, ...world.slice(0, 4)];
  if (country && !editions.some((edition) => edition.gl === request.country)) {
    editions.unshift({ code: request.country, name: `Google News · ${country.spanish}`, hl: "en", gl: request.country, ceid: `${request.country}:en`, lang: "en" });
  }
  const selectedEditions = editions;
  const googleFeeds: NewsRssFeed[] = selectedEditions.map((edition) => ({
    name: edition.name,
    url: rssQuery
      ? `https://news.google.com/rss/search?${new URLSearchParams({ q: rssQuery, hl: edition.hl, gl: edition.gl, ceid: edition.ceid })}`
      : `https://news.google.com/rss?${new URLSearchParams({ hl: edition.hl, gl: edition.gl, ceid: edition.ceid })}`,
    homeUrl: "https://news.google.com/",
    note: rssQuery
      ? "Búsqueda por tema y lugar en la edición regional. Los enlaces pasan por Google News; la hora la comunica el propio feed."
      : "Portada viva de la edición regional: titulares principales actualizados continuamente.",
    timeoutMs: 3_000,
    lang: edition.lang,
  }));
  const guardianSection: Record<PulseCategory, string> = {
    all: "world", politics: "politics", economy: "business", technology: "technology", science: "science",
    health: "society/health", climate: "environment/climate-crisis", security: "world", culture: "culture",
    sports: "sport", education: "education", factcheck: "media",
  };
  const categoryDirect = CATEGORY_DIRECT_FEEDS[request.category];
  const factcheck = request.category === "factcheck";
  const directFeeds: NewsRssFeed[] = factcheck ? [...(FACTCHECK_FEEDS[lang] ?? []), ...(lang === "en" ? [] : FACTCHECK_FEEDS.en ?? [])].map((feed) => ({ ...feed, filterToTopic: false })) : [
    ...(categoryDirect ? [{ ...categoryDirect, lang: "en" }] : []),
    ...LANGUAGE_FEEDS[lang],
    { name: "Al Jazeera English", url: "https://www.aljazeera.com/xml/rss/all.xml", homeUrl: "https://www.aljazeera.com/", note: "Canal RSS público directo de Al Jazeera English.", lang: "en", timeoutMs: 5_000 },
    { name: "NPR · World", url: "https://feeds.npr.org/1004/rss.xml", homeUrl: "https://www.npr.org/sections/world/", note: "Canal RSS público directo de NPR World.", lang: "en", timeoutMs: 5_000 },
    { name: `The Guardian · ${request.category}`, url: `https://www.theguardian.com/${guardianSection[request.category]}/rss`, homeUrl: `https://www.theguardian.com/${guardianSection[request.category]}`, note: "Canal RSS temático directo de The Guardian.", lang: "en", timeoutMs: 5_000, filterToTopic: false },
    { name: "UN News", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", homeUrl: "https://news.un.org/", note: "Canal RSS público de Noticias ONU; es una fuente institucional.", lang: "en", timeoutMs: 5_000 },
    { name: "France 24 English", url: "https://www.france24.com/en/rss", homeUrl: "https://www.france24.com/en/", note: "Canal RSS público directo de France 24 English.", lang: "en", timeoutMs: 5_000 },
  ].map((feed) => ({ ...feed, filterToTopic: feed.filterToTopic ?? request.category !== "all" }));
  const rss: NewsRssFeed[] = [...directFeeds, ...googleFeeds];
  const bbc = BBC_FEEDS[request.category];
  if (!factcheck) rss.push({
    lang: "en",
    name: bbc.name,
    url: bbc.url,
    homeUrl: "https://www.bbc.com/news",
    note: "Canal RSS público de BBC. Sus miniaturas se muestran como multimedia de la fuente y conservan el enlace al artículo original.",
    // World feeds stand in for categories without a dedicated BBC channel.
    // Filter them locally so Política, Seguridad and Educación remain coherent.
    filterToTopic: request.category !== "all" && ["politics", "security", "education"].includes(request.category),
  });
  return { gdelt: gdeltQuery ? `https://api.gdeltproject.org/api/v2/doc/doc?${gdeltParams}` : null, rss };
}
export async function loadNews(request: PulseRequest, now: number, fetcher: FetchLike = fetch): Promise<ProviderResult> {
  const urls = newsUrls(request);
  const sources: PulseSource[] = [];
  const errors: string[] = [];
  const gdeltTask = Promise.allSettled([
    urls.gdelt && now >= gdeltCooldownUntil
      ? boundedFetchText(urls.gdelt, "json", fetcher, 5_000).then((text) => {
        const data: unknown = JSON.parse(text);
        if (!data || typeof data !== "object" || !Array.isArray((data as { articles?: unknown }).articles)) throw new SyntaxError();
        return filterTimeAndDedupe(normalizeMany((data as { articles: unknown[] }).articles, { provider: "GDELT", timestampBasis: "observed" }), request.timespan, now);
      })
      : Promise.reject(new Error(urls.gdelt ? "GDELT en espera" : "GDELT omitido")),
  ]).then(([result]) => result);
  // Remote providers throttle bursts from shared edge addresses. A small pool
  // preserves global coverage without making every edition fail at once.
  const rssTask = settleLimited(urls.rss, 4, (feed) => boundedFetchText(feed.url, "xml", fetcher, feed.timeoutMs ?? 5_000)
      .then((text) => {
        const normalized = normalizeMany(parseRssItems(text), { provider: feed.name, timestampBasis: "published", lang: feed.lang });
        const scoped = feed.filterToTopic ? normalized.filter((article) => topicMatches(article.title, request.category)) : normalized;
        return filterTimeAndDedupe(scoped, request.timespan, now);
      }));
  const [gdelt, rssResults] = await Promise.all([gdeltTask, rssTask]);
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
      sources.push({ name: feed.name, url: feed.homeUrl, status: "error", count: 0, note });
    }
  });
  // Keep the view bounded while reserving room for source-provided multimedia.
  // A purely chronological cut can otherwise let high-volume text-only indexes
  // erase every photographic item even when a public feed supplied it.
  // Only outlets with public editorial standards make it through (lib/trusted.ts).
  const trusted = gathered.filter((article) => isTrustedHost(article.sourceHost ?? article.destinationHost));
  const untrustedDropped = gathered.length - trusted.length;
  const candidates = filterTimeAndDedupe(trusted, request.timespan, now, 280);
  const visual = candidates.filter((article) => article.media).slice(0, 24);
  const visualIds = new Set(visual.map((article) => article.id));
  const selected = [...visual, ...candidates.filter((article) => !visualIds.has(article.id)).slice(0, 216 - visual.length)]
    .sort((a, b) => b.seenDate.localeCompare(a.seenDate));
  const articles = await enrichMedia(selected, fetcher);
  return { articles, sources, errors, fetchedAt: new Date(now).toISOString(), untrustedDropped };
}

export async function loadLibrary(now: number, fetcher: FetchLike = fetch): Promise<ProviderResult> {
  const settled = await settleLimited(LIBRARY, 5, async (outlet) => {
    const text = await fetchProviderText(outlet.feed, "xml", fetcher, 6_000, 8_000);
    return filterTimeAndDedupe(normalizeMany(parseRssItems(text), { provider: outlet.name, sourceName: outlet.name, lang: outlet.language }), "7d", now, 40)
      .map((article) => ({ ...article, language: outlet.language, outlet: { id: outlet.id, blockedIn: outlet.blockedIn, ...(outlet.stateFunded ? { stateFunded: true } : {}) } }));
  });
  const articles: PulseArticle[] = [];
  const errors: string[] = [];
  const sources = settled.map((result, index): PulseSource => {
    const outlet = LIBRARY[index];
    if (result.status === "fulfilled") {
      articles.push(...result.value);
      return { name: outlet.name, url: outlet.home, status: result.value.length ? "ok" : "empty", count: result.value.length };
    }
    const note = errorMessage(result.reason); errors.push(`${outlet.name}: ${note}`);
    return { name: outlet.name, url: outlet.home, status: "error", count: 0, note };
  });
  const enriched = await enrichMedia(articles.sort((a, b) => b.seenDate.localeCompare(a.seenDate)), fetcher, 48);
  return { articles: enriched, sources, errors, fetchedAt: new Date(now).toISOString() };
}

export function parseEarthquakes(payload: unknown): PulseArticle[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { features?: unknown }).features)) throw new SyntaxError();
  return (payload as { features: unknown[] }).features.slice(0, 500).flatMap((feature) => {
    if (!feature || typeof feature !== "object") return [];
    const item = feature as { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown[] } };
    const properties = item.properties;
    const coordinates = item.geometry?.coordinates;
    if (!properties || !coordinates || typeof properties.mag !== "number" || !Number.isFinite(properties.mag) || properties.mag < 2.5 || properties.mag > 10 || properties.type !== "earthquake") return [];
    const raw = { title: `Terremoto M ${properties.mag.toFixed(1)} · ${typeof properties.place === "string" ? properties.place : "Ubicación indicada por USGS"}`, url: properties.url, timestamp: properties.time, location: { lat: coordinates[1], lng: coordinates[0], label: properties.place } };
    const article = normalizeArticle(raw, { provider: "USGS", sourceName: "USGS · registro sísmico", kind: "earthquake", lang: "es", timestampBasis: "event", reviewStatus: properties.status === "reviewed" ? "reviewed" : "preliminary" });
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
    const text = await fetchProviderText(feed.url, feed.format, fetcher, 7_000, 10_000);
    const articles = feed.kind === "earthquake" ? parseEarthquakes(JSON.parse(text)) : normalizeMany(parseRssItems(text), { provider: feed.name, sourceName: feed.name, kind: feed.kind, timestampBasis: "published", reviewStatus: feed.reviewStatus, lang: "en" })
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
  const key = request.mode === "news" ? JSON.stringify(request) : request.mode;
  const result = await cached(key, () => request.mode === "early" ? loadEarly(now) : request.mode === "library" ? loadLibrary(now) : loadNews(request, now), now);
  let articles = filterTimeAndDedupe(result.articles, request.timespan, now, request.mode === "library" ? 400 : 216);
  if (request.mode === "library" && request.category !== "all") articles = articles.filter((article) => topicMatches(article.title, request.category));
  if (request.mode === "early" && request.category !== "all") {
    articles = articles.filter((article) => request.category === "science"
      ? article.kind === "earthquake" || article.kind === "preprint" || article.provider === "NASA"
      : request.category === "technology" && article.provider === "arXiv");
  }
  articles = articles.map((article) => article.topic ? article : { ...article, topic: detectTopic(article.title) });
  if (request.mode !== "early") articles = corroborate(articles);
  rememberMediaHosts(articles.flatMap((article) => article.media ? [article.media.url] : []));
  // Town-only titles can lack the country name. Search context never becomes map evidence.
  const view = derivePulse(articles, { country: request.query ? undefined : request.country, query: request.query || undefined });
  const sources = result.sources.map((source) => ({ ...source, count: view.articles.filter((article) => article.provider === source.name).length }));
  return {
    ...view, mode: request.mode, timespan: request.timespan, category: request.category, pointBasis: "mentionedCountries",
    dataProvider: sources.filter((source) => source.status === "ok").map((source) => source.name).join(" · ") || "Sin resultados disponibles",
    fetchedAt: result.fetchedAt, untrustedDropped: result.untrustedDropped ?? 0, partial: result.errors.length > 0 || !view.articles.length, sources, errors: result.errors,
    coverageNote: request.mode === "library"
      ? "Biblioteca libre: medios cuyo sitio está reportado como bloqueado en al menos un país. Cada titular ofrece rutas alternativas (Archive.org, archive.today, proxy de traducción)."
      : request.mode === "early"
      ? "Fuentes públicas directas: sismos M2,5+ (USGS), alertas GDACS, publicaciones NASA e investigación en IA (arXiv). Son señales oficiales que pueden actualizarse; no predicen acontecimientos."
      : `Muestra combinada de hasta 216 titulares multilingües: índices regionales y canales RSS directos de medios y organismos internacionales. El mapa solo marca lugares explícitamente mencionados en la fuente.${request.query ? " La búsqueda por localidad aporta contexto y puede incluir coincidencias sin país identificado." : ""} Solo se muestran medios de la lista de confianza (agencias, emisoras públicas independientes, diarios con política de correcciones, periodismo en el exilio y verificadores); la propaganda estatal queda fuera. Cada titular enlaza su origen e indica cuántos otros medios confirman la historia.`,
  };
}
