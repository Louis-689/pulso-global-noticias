import { NextRequest, NextResponse } from "next/server";
import countriesData from "world-countries";

const categoryQueries: Record<string, string> = {
  all: "(conflict OR economy OR technology OR climate OR health OR science OR diplomacy)",
  politics: "theme:GENERAL_GOVERNMENT", economy: "(economy OR markets OR trade OR inflation)",
  technology: "(technology OR artificial intelligence OR cybersecurity)", science: "(science OR research OR space)",
  health: "theme:HEALTH", climate: "theme:CLIMATE_CHANGE", security: "(conflict OR security OR military)", culture: "(culture OR arts OR society)",
};

const rssQueries: Record<string, string> = {
  all: "world news conflict economy technology climate health science diplomacy",
  politics: "world politics government election diplomacy", economy: "global economy markets trade inflation",
  technology: "technology artificial intelligence cybersecurity", science: "science research space",
  health: "global health medicine outbreak", climate: "climate environment weather",
  security: "global conflict security military", culture: "world culture arts society",
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

type CountryRecord = { cca2: string; name: { common: string; official: string }; altSpellings?: string[]; latlng: [number, number] };
type NormalizedArticle = { url: string; title: string; domain: string; sourceCountry: string; geoCountry: string; language: string; seenDate: string; sentiment: number };

const countryRecords = countriesData as CountryRecord[];
const countryLookup = new Map<string, CountryRecord>();
for (const country of countryRecords) {
  [country.name.common, country.name.official, ...(country.altSpellings ?? [])].forEach((name) => countryLookup.set(name.toLocaleLowerCase("en"), country));
}

const positiveTerms = ["agreement", "advance", "breakthrough", "growth", "improve", "launch", "peace", "recover", "rescue", "success", "vaccin", "win", "acuerdo", "avance", "crecimiento", "mejora", "récord", "paix", "succès"];
const negativeTerms = ["attack", "conflict", "crisis", "death", "disaster", "drought", "earthquake", "ebola", "fire", "flood", "killed", "missile", "outbreak", "threat", "war", "ataque", "crisis", "guerra", "muere", "muerte", "incendio", "inondation", "guerre", "mort"];
const stopWords = new Set(["about", "after", "again", "their", "there", "these", "those", "through", "under", "where", "which", "with", "desde", "entre", "sobre", "para", "como", "contra", "après", "avec", "dans", "pour", "sulla", "della", "degli"]);

function sentimentScore(title: string) {
  const text = title.toLocaleLowerCase();
  const contains = (term: string) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ending = term.length <= 4 ? "(?=$|[^\\p{L}])" : "";
    return new RegExp(`(^|[^\\p{L}])${escaped}${ending}`, "u").test(text);
  };
  return positiveTerms.reduce((score, term) => score + (contains(term) ? 1 : 0), 0)
    - negativeTerms.reduce((score, term) => score + (contains(term) ? 1 : 0), 0);
}

function titleTokens(title: string) {
  return new Set(title.toLocaleLowerCase().match(/[\p{L}\p{N}]{5,}/gu)?.filter((word) => !stopWords.has(word)) ?? []);
}

function resolveCountry(name: string) {
  return countryLookup.get(name.toLocaleLowerCase("en"));
}

function detectMentionedCountry(title: string) {
  const text = ` ${title.toLocaleLowerCase("en")} `;
  return [...countryRecords]
    .sort((a, b) => b.name.common.length - a.name.common.length)
    .find((country) => country.name.common.length > 3 && text.includes(` ${country.name.common.toLocaleLowerCase("en")} `))?.name.common ?? "";
}

function parseRssItems(xml: string) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 40).map((match) => {
    const item = match[1];
    const pick = (tag: string) => cleanText(item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]);
    const title = pick("title");
    const url = pick("link");
    const source = pick("source") || (() => { try { return new URL(url).hostname; } catch { return "Google News"; } })();
    return { url, title, domain: source, sourcecountry: "", geocountry: detectMentionedCountry(title), language: "English", seendate: pick("pubDate") };
  }).filter((item) => item.title && item.url);
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") ?? "all";
  const requestedTimespan = request.nextUrl.searchParams.get("timespan") ?? "24h";
  const timespan = /^(1h|6h|12h|24h|48h|7d)$/.test(requestedTimespan) ? requestedTimespan : "24h";
  const common = `query=${encodeURIComponent(categoryQueries[category] ?? categoryQueries.all)}&timespan=${timespan}`;
  const articleResult = await Promise.allSettled([
    fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${common}&mode=artlist&maxrecords=40&sort=datedesc&format=json`, { headers: { Accept: "application/json" }, next: { revalidate: 600 } }),
  ]).then(([result]) => result);
  let articles: Array<Record<string, unknown>> = [];
  let dataProvider = "GDELT DOC 2.0";
  if (articleResult.status === "fulfilled" && articleResult.value.ok) {
    const payload = (await articleResult.value.json()) as { articles?: Array<Record<string, unknown>> };
    articles = payload.articles ?? [];
  }
  if (articles.length === 0) {
    const rssQuery = rssQueries[category] ?? rssQueries.all;
    try {
      const rssResponse = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(rssQuery)}&hl=en&gl=US&ceid=US:en`, { headers: { Accept: "application/rss+xml, application/xml, text/xml" }, next: { revalidate: 600 } });
      if (rssResponse.ok) {
        articles = parseRssItems(await rssResponse.text());
        dataProvider = "Google News RSS · respaldo";
      }
    } catch {
      dataProvider = "Fuentes temporalmente no disponibles";
    }
  }
  const normalizedArticles: NormalizedArticle[] = articles.map((article) => {
    const title = cleanText(article.title || "Titular sin título");
    const sourceCountry = cleanText(article.sourcecountry);
    const geoCountry = cleanText(article.geocountry) || sourceCountry;
    return { url: String(article.url ?? "#"), title, domain: cleanText(article.domain || "fuente no identificada"), sourceCountry, geoCountry, language: cleanText(article.language), seenDate: String(article.seendate ?? ""), sentiment: sentimentScore(title) };
  });

  const countryCounts = new Map<string, number>();
  for (const article of normalizedArticles) {
    if (article.geoCountry) countryCounts.set(article.geoCountry, (countryCounts.get(article.geoCountry) ?? 0) + 1);
  }
  const editorialPoints = [...countryCounts.entries()].flatMap(([name, count]) => {
    const country = resolveCountry(name);
    if (!country || !Array.isArray(country.latlng)) return [];
    return [{ id: country.cca2, lat: country.latlng[0], lng: country.latlng[1], name, count }];
  });

  const connectionMap = new Map<string, { source: CountryRecord; target: CountryRecord; sourceName: string; targetName: string; weight: number }>();
  for (let left = 0; left < normalizedArticles.length; left += 1) {
    const source = resolveCountry(normalizedArticles[left].geoCountry);
    if (!source) continue;
    const leftTokens = titleTokens(normalizedArticles[left].title);
    for (let right = left + 1; right < normalizedArticles.length; right += 1) {
      const target = resolveCountry(normalizedArticles[right].geoCountry);
      if (!target || source.cca2 === target.cca2) continue;
      const shared = [...titleTokens(normalizedArticles[right].title)].filter((token) => leftTokens.has(token)).length;
      if (shared === 0) continue;
      const [first, second] = source.cca2 < target.cca2 ? [source, target] : [target, source];
      const key = `${first.cca2}-${second.cca2}`;
      const current = connectionMap.get(key);
      connectionMap.set(key, { source: first, target: second, sourceName: first.name.common, targetName: second.name.common, weight: (current?.weight ?? 0) + shared });
    }
  }
  const connections = [...connectionMap.values()].sort((a, b) => b.weight - a.weight).slice(0, 14).map((item) => ({
    startLat: item.source.latlng[0], startLng: item.source.latlng[1], endLat: item.target.latlng[0], endLng: item.target.latlng[1],
    label: `${item.sourceName} ↔ ${item.targetName}`, weight: item.weight,
  }));

  const positive = normalizedArticles.filter((article) => article.sentiment > 0).sort((a, b) => b.sentiment - a.sentiment).slice(0, 10);
  const negative = normalizedArticles.filter((article) => article.sentiment < 0).sort((a, b) => a.sentiment - b.sentiment).slice(0, 10);
  const positiveWeight = normalizedArticles.reduce((sum, article) => sum + Math.max(0, article.sentiment), 0);
  const negativeWeight = normalizedArticles.reduce((sum, article) => sum + Math.max(0, -article.sentiment), 0);
  const tension = positiveWeight + negativeWeight > 0 ? Math.round((negativeWeight / (positiveWeight + negativeWeight)) * 100) : 50;

  const response = NextResponse.json({
    points: editorialPoints,
    pointBasis: dataProvider.startsWith("GDELT") ? "sourceCountries" : "mentionedCountries",
    dataProvider,
    articles: normalizedArticles,
    connections,
    rankings: { positive, negative },
    tension,
    fetchedAt: new Date().toISOString(), partial: normalizedArticles.length === 0 || editorialPoints.length === 0,
  });
  response.headers.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate=900");
  return response;
}
