import countriesData from "world-countries";
import type { MentionedCountry, PulseArticle, PulseConnection, PulsePoint, PulseTimespan, PulseView } from "./pulse-types";

type CountryRecord = { cca2: string; name: { common: string; official: string }; translations: { spa?: { common: string; official: string } }; latlng: number[] };
const countries = countriesData as CountryRecord[];
const extraAliases: Record<string, string[]> = {
  US: ["United States", "Estados Unidos", "EE. UU.", "EE.UU.", "USA"],
  GB: ["United Kingdom", "Reino Unido", "Britain", "Gran Bretaña"],
  RU: ["Russia", "Rusia"], KR: ["South Korea", "Corea del Sur"], KP: ["North Korea", "Corea del Norte"],
  CD: ["DR Congo", "DRC", "República Democrática del Congo"], CG: ["Republic of the Congo", "República del Congo", "Congo-Brazzaville"],
  PS: ["Palestine", "Palestina", "Gaza"], CZ: ["Czech Republic", "República Checa"],
  AE: ["United Arab Emirates", "Emiratos Árabes Unidos"], CI: ["Ivory Coast", "Costa de Marfil"],
};
// Only explicit, reasonably unambiguous place names. This is mention extraction, not event geocoding.
const cityAliases: Record<string, string[]> = {
  PE: ["Lima", "Arequipa", "Cusco"], UA: ["Kyiv", "Kiev", "Kharkiv"], RU: ["Moscow", "Moscú"],
  ES: ["Madrid"], CN: ["Beijing", "Pekín"], IN: ["New Delhi", "Nueva Delhi"],
  AR: ["Buenos Aires"], CL: ["Santiago de Chile"], BR: ["São Paulo", "Sao Paulo"],
  MX: ["Mexico City", "Ciudad de México"], GB: ["London", "Londres"], FR: ["Paris", "París"],
};
// Bare names that are also common words, regions or cities create misleading
// pins (for example "reunión" as a meeting, or Guayana inside Ciudad Guayana).
// Longer official names remain eligible evidence.
const ambiguousNames = new Set(["congo", "georgia", "jordan", "chad", "reunion", "guayana", "guiana"]);
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const countryByCode = new Map(countries.map((country) => [country.cca2, country]));
const aliases = countries.flatMap((country) => {
  const names = [country.name.common, country.name.official, country.translations.spa?.common, country.translations.spa?.official, ...(extraAliases[country.cca2] ?? [])];
  return [...new Set(names.filter((name): name is string => Boolean(name) && !ambiguousNames.has(fold(name!))))]
    .filter((name) => name.length >= 4 || (extraAliases[country.cca2] ?? []).includes(name))
    .map((name) => ({ country, alias: fold(name), city: false }));
}).concat(countries.flatMap((country) => (cityAliases[country.cca2] ?? []).map((name) => ({ country, alias: fold(name), city: true }))));

export function countrySearchName(code: string): { english: string; spanish: string } | null {
  const country = countryByCode.get(code.toUpperCase());
  return country ? { english: country.name.common, spanish: country.translations.spa?.common ?? country.name.common } : null;
}

export function cleanText(value: unknown, maxLength = 700): string {
  if (typeof value !== "string") return "";
  return value.slice(0, 12_000)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
      const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
    })
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " })[entity] ?? " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function safeArticleUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2500 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    // Article links are navigation only. Reject local/private network destinations as well as scripts.
    if (!host.includes(".") || host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host) || /\.(localhost|local|internal|test|invalid)$/.test(host)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

export function parseTimestamp(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 946684800000 && value <= 8640000000000000 ? new Date(value).toISOString() : null;
  if (typeof value !== "string" || value.length > 80) return null;
  const text = value.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/.exec(text);
  const normalized = compact ? `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z` : text;
  if (!/(?:Z|GMT|UTC|[+-]\d{2}:?\d{2})$/i.test(normalized)) return null;
  const epoch = Date.parse(normalized);
  if (!Number.isFinite(epoch)) return null;
  const iso = new Date(epoch).toISOString();
  if (compact && iso.slice(0, 19) !== normalized.slice(0, 19)) return null;
  return iso;
}

export function inTimeWindow(timestamp: string, timespan: PulseTimespan, now: number): boolean {
  const milliseconds = timespan === "7d" ? 7 * 86400000 : Number(timespan.slice(0, -1)) * 3600000;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && time >= now - milliseconds && time <= now;
}

export function detectMentionedCountries(title: string): MentionedCountry[] {
  const text = fold(title);
  const hits: Array<{ start: number; end: number; country: CountryRecord; evidence: string }> = [];
  for (const entry of aliases) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(entry.alias)})(?=$|[^\\p{L}\\p{N}])`, "gu");
    for (const match of text.matchAll(pattern)) {
      const start = match.index + match[1].length;
      const original = title.slice(start, start + entry.alias.length);
      if (entry.city && original[0] === original[0]?.toLowerCase()) continue;
      // New Mexico is a US state; bare Mexico inside it is not a country mention.
      if (entry.country.cca2 === "MX" && /(?:new|nuevo) $/.test(text.slice(0, start))) continue;
      hits.push({ start, end: start + entry.alias.length, country: entry.country, evidence: original });
    }
  }
  const selected = hits.filter((hit) => !hits.some((other) => other !== hit && other.start <= hit.start && other.end >= hit.end && other.end - other.start > hit.end - hit.start));
  const unique = new Map<string, MentionedCountry>();
  for (const hit of selected) {
    if (!unique.has(hit.country.cca2)) unique.set(hit.country.cca2, { code: hit.country.cca2, name: hit.country.translations.spa?.common ?? hit.country.name.common, lat: hit.country.latlng[0], lng: hit.country.latlng[1], evidence: hit.evidence });
  }
  return [...unique.values()].slice(0, 12);
}

const positiveLexicon = ["agreement", "agreements", "breakthrough", "growth", "improvement", "peace", "recovery", "rescue", "rescued", "success", "acuerdo", "acuerdos", "avance", "avances", "crecimiento", "mejora", "paz", "recuperación", "rescate", "éxito", "paix", "succès", "croissance"];
const negativeLexicon = ["attack", "attacks", "conflict", "crisis", "death", "deaths", "disaster", "drought", "earthquake", "flood", "killed", "missile", "outbreak", "threat", "war", "ataque", "ataques", "conflicto", "guerra", "muere", "mueren", "muerte", "muertes", "incendio", "inundación", "terremoto", "sequía", "amenaza", "guerre", "inondation", "mort"];
export function lexicalTone(title: string): Pick<PulseArticle, "sentiment" | "positiveTerms" | "negativeTerms"> {
  const text = fold(title);
  const found = (terms: string[]) => terms.filter((term) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(fold(term))}(?=$|[^\\p{L}\\p{N}])`, "u").test(text));
  const positiveTerms = found(positiveLexicon);
  const negativeTerms = found(negativeLexicon);
  return { sentiment: positiveTerms.length - negativeTerms.length, positiveTerms, negativeTerms };
}

function stableId(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `article-${(hash >>> 0).toString(36)}`;
}

export type ArticleContext = { provider: string; kind?: PulseArticle["kind"]; timestampBasis?: PulseArticle["timestampBasis"]; sourceName?: string; reviewStatus?: PulseArticle["reviewStatus"] };
export function normalizeArticle(raw: unknown, context: ArticleContext): PulseArticle | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const title = cleanText(record.title);
  const url = safeArticleUrl(record.url);
  const seenDate = parseTimestamp(record.timestamp ?? record.seendate ?? record.pubDate);
  if (!title || !url || !seenDate) return null;
  const destinationHost = new URL(url).hostname;
  const sourceName = context.sourceName ?? (cleanText(record.sourceName || record.domain, 150) || destinationHost);
  const timestampBasis = context.timestampBasis ?? "published";
  const rawLocation = record.location as { lat?: unknown; lng?: unknown; label?: unknown } | undefined;
  const location = rawLocation && typeof rawLocation.lat === "number" && typeof rawLocation.lng === "number" && Number.isFinite(rawLocation.lat) && Number.isFinite(rawLocation.lng) && Math.abs(rawLocation.lat) <= 90 && Math.abs(rawLocation.lng) <= 180
    ? { lat: rawLocation.lat, lng: rawLocation.lng, label: cleanText(rawLocation.label) || title } : undefined;
  return {
    id: stableId(url), url, title, domain: destinationHost, sourceName, destinationHost,
    sourceCountry: cleanText(record.sourcecountry, 80), language: cleanText(record.language, 30) || "No indicado",
    seenDate, publishedAt: timestampBasis === "published" ? seenDate : null, timestampBasis,
    provider: context.provider, kind: context.kind ?? "news", reviewStatus: context.reviewStatus ?? "unknown",
    mentionedCountries: detectMentionedCountries(title), ...(location ? { location } : {}), ...lexicalTone(title),
  };
}

export function filterTimeAndDedupe(articles: PulseArticle[], timespan: PulseTimespan, now: number, limit = 120): PulseArticle[] {
  const urls = new Set<string>();
  const titles = new Set<string>();
  return articles.filter((article) => inTimeWindow(article.seenDate, timespan, now))
    .sort((a, b) => b.seenDate.localeCompare(a.seenDate))
    .filter((article) => {
      const canonical = new URL(article.url);
      for (const key of [...canonical.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) canonical.searchParams.delete(key);
      const title = fold(article.title);
      if (urls.has(canonical.href) || titles.has(title)) return false;
      urls.add(canonical.href); titles.add(title); return true;
    }).slice(0, limit);
}

export function derivePulse(input: PulseArticle[], options: { country?: string; query?: string; kinds?: PulseArticle["kind"][] } = {}): PulseView {
  const query = fold(options.query?.trim() ?? "");
  const articles = input.filter((article) => (!options.country || article.mentionedCountries.some((country) => country.code === options.country))
    && (!options.kinds || options.kinds.includes(article.kind))
    && (!query || fold([article.title, article.sourceName, article.destinationHost, ...article.mentionedCountries.map((country) => country.name)].join(" ")).includes(query)));
  const points = new Map<string, PulsePoint>();
  const connections = new Map<string, PulseConnection>();
  for (const article of articles) {
    for (const country of article.mentionedCountries) {
      const point = points.get(country.code) ?? { id: country.code, lat: country.lat, lng: country.lng, name: country.name, count: 0, articleIds: [] };
      point.count++; point.articleIds.push(article.id); points.set(country.code, point);
    }
    for (let i = 0; i < article.mentionedCountries.length; i++) for (let j = i + 1; j < article.mentionedCountries.length; j++) {
      const [source, target] = [article.mentionedCountries[i], article.mentionedCountries[j]].sort((a, b) => a.code.localeCompare(b.code));
      const key = `${source.code}-${target.code}`;
      const connection = connections.get(key) ?? { sourceId: source.code, targetId: target.code, startLat: source.lat, startLng: source.lng, endLat: target.lat, endLng: target.lng, label: `${source.name} · ${target.name}: mencionados en el mismo titular`, weight: 0, articleIds: [] };
      connection.weight++; connection.articleIds.push(article.id); connections.set(key, connection);
    }
  }
  const positive = articles.filter((article) => article.sentiment > 0).sort((a, b) => b.sentiment - a.sentiment);
  const negative = articles.filter((article) => article.sentiment < 0).sort((a, b) => a.sentiment - b.sentiment);
  const positiveTerms = articles.reduce((sum, article) => sum + article.positiveTerms.length, 0);
  const negativeTerms = articles.reduce((sum, article) => sum + article.negativeTerms.length, 0);
  const located = articles.filter((article) => article.mentionedCountries.length > 0).length;
  return {
    articles, points: [...points.values()].sort((a, b) => b.count - a.count),
    connections: [...connections.values()].sort((a, b) => b.weight - a.weight).slice(0, 24),
    rankings: { positive: positive.slice(0, 10), negative: negative.slice(0, 10) },
    tension: positiveTerms + negativeTerms ? Math.round(100 * negativeTerms / (positiveTerms + negativeTerms)) : null,
    stats: { total: articles.length, located, unlocated: articles.length - located, positive: positive.length, negative: negative.length, neutral: articles.length - positive.length - negative.length, scored: articles.filter((article) => article.positiveTerms.length + article.negativeTerms.length > 0).length },
  };
}

export function parseRssItems(xml: string): Array<Record<string, unknown>> {
  if (xml.length > 1_500_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<rss\b/i.test(xml)) throw new Error("RSS inválido");
  const articles: Array<Record<string, unknown>> = [];
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const item = match[1];
    const pick = (tag: string) => cleanText(item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1], tag === "link" ? 2500 : 700);
    articles.push({ title: pick("title"), url: pick("link"), sourceName: pick("source"), timestamp: pick("pubDate"), announceType: pick("arxiv:announce_type"), journalReference: pick("arxiv:journal_reference") });
    if (articles.length >= 500) break;
  }
  return articles;
}
