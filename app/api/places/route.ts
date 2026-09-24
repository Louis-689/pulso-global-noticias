import type { PlaceHierarchy, PlaceLevel, PlaceResult, PlacesResponse } from "@/lib/pulse-places-types";

// The free endpoint is for private/non-commercial use. Commercial deployment
// needs OPEN_METEO_API_KEY or a separately provisioned geographic provider.
// https://open-meteo.com/en/terms
// https://open-meteo.com/en/docs/geocoding-api
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 192;
const MAX_BODY_BYTES = 180_000;
const REQUEST_TIMEOUT = 8_000;
const cache = new Map<string, { expires: number; data: PlacesResponse }>();
let active: { key: string; promise: Promise<PlacesResponse> } | undefined;
let lastStarted = 0;
let upstreamCooldownUntil = 0;

const attribution = "Geografía: GeoNames, consultada mediante Open-Meteo.";
const coverageNote = "Encontrar un lugar no garantiza que haya noticias públicas de esa localidad. La jerarquía y los nombres administrativos varían según el país; no es un censo completo.";

function payload(query: string, results: PlaceResult[] = [], error?: string): PlacesResponse {
  return {
    results, query, fetchedAt: new Date().toISOString(), cached: false,
    attribution, attributionUrl: "https://www.geonames.org/",
    providerUrl: "https://open-meteo.com/en/docs/geocoding-api", coverageNote,
    ...(error ? { error } : {}),
  };
}

function reply(data: PlacesResponse, status = 200, retry?: number) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": status === 200 ? "private, max-age=300" : "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(retry ? { "Retry-After": String(retry) } : {}),
    },
  });
}

function string(value: unknown, max = 160): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max) : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

function normalize(value: unknown): PlaceResult | null {
  const item = record(value);
  if (!item || !validId(item.id)) return null;
  const lat = item.latitude;
  const lng = item.longitude;
  const name = string(item.name);
  const featureCode = string(item.feature_code, 12);
  const countryCode = string(item.country_code, 2).toUpperCase();
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !name || !/^[A-Z]{2}$/.test(countryCode)) return null;
  // Never return individual street addresses, buildings, businesses or people.
  if (!/^(?:PPL[A-Z0-9]*|ADM[1-5]|PCLI)$/.test(featureCode)) return null;
  const country = string(item.country);
  const region = string(item.admin1) || null;
  const hierarchy: PlaceHierarchy[] = [];
  if (validId(item.country_id) && item.country_id !== item.id && country) {
    hierarchy.push({ id: String(item.country_id), name: country, level: "country" });
  }
  for (let i = 1; i <= 4; i += 1) {
    const id = item[`admin${i}_id`];
    const label = string(item[`admin${i}`]);
    if (validId(id) && id !== item.id && label && !hierarchy.some((part) => part.id === String(id))) {
      hierarchy.push({ id: String(id), name: label, level: i === 1 ? "region" : "administrative", administrativeLevel: i });
    }
  }
  const type = featureCode === "PCLI" ? "country" : featureCode.startsWith("ADM") ? "region"
    : ["PPLC", "PPLA", "PPLA2"].includes(featureCode) ? "city" : "locality";
  const labels = [...new Set([name, string(item.admin2), region, country].filter(Boolean))];
  return {
    id: String(item.id), name, displayName: labels.join(", "), lat, lng, type, featureCode,
    countryCode, country, region, city: type === "city" ? name : null,
    town: type === "locality" ? name : null, hierarchy,
    sourceUrl: `https://www.geonames.org/${item.id}`,
  };
}

async function fetchProvider(path: "search" | "get", params: URLSearchParams): Promise<unknown> {
  const key = process.env.OPEN_METEO_API_KEY?.trim();
  const url = new URL(`https://${key ? "customer-geocoding-api" : "geocoding-api"}.open-meteo.com/v1/${path}`);
  url.search = params.toString();
  if (key) url.searchParams.set("apikey", key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      signal: controller.signal, redirect: "manual",
      headers: { Accept: "application/json", "User-Agent": "PulsoGlobal/1.0 (+https://pulso-global-noticias.topos22.chatgpt.site)" },
    });
    if (response.status >= 300 && response.status < 400) throw new Error("provider-redirect-refused");
    if (response.status === 429) {
      upstreamCooldownUntil = Date.now() + 60_000;
      throw new Error("provider-rate-limit");
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("provider-unavailable");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_BODY_BYTES || !response.body) throw new Error("provider-response-invalid");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          throw new Error("provider-response-too-large");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (record(result)?.error) throw new Error("provider-response-invalid");
    return result;
  } finally { clearTimeout(timer); }
}

async function search(query: string, country: string, parent: string, level: PlaceLevel | "", id: string): Promise<PlacesResponse> {
  if (id) {
    const result = normalize(await fetchProvider("get", new URLSearchParams({ id, language: "es" })));
    return payload(query, result && (!country || result.countryCode === country) ? [result] : []);
  }
  const searchName = level === "region" ? query.replace(/^(?:departamento|regi[oó]n|provincia|estado)\s+(?:de\s+)?/i, "") : query;
  const params = new URLSearchParams({ name: parent ? `${searchName}, ${parent}` : searchName, count: "15", language: "es", format: "json" });
  if (country) params.set("countryCode", country);
  const raw = record(await fetchProvider("search", params));
  if (!raw || (raw.results !== undefined && !Array.isArray(raw.results))) throw new Error("provider-response-invalid");
  const entries: unknown[] = Array.isArray(raw.results) ? raw.results.slice(0, 15) : [];
  let results = entries.map(normalize).filter((item): item is PlaceResult => !!item && (!country || item.countryCode === country));
  if (level === "region") {
    // The search endpoint indexes settlements. Resolve their actual admin1 IDs;
    // never reuse a city's coordinates and falsely label them as a region.
    const regionIds = [...new Set(entries.map((item) => record(item)?.admin1_id).filter(validId))].slice(0, 3);
    const regions: PlaceResult[] = [];
    for (const regionId of regionIds) {
      const region = normalize(await fetchProvider("get", new URLSearchParams({ id: String(regionId), language: "es" })));
      if (region && region.type === "region" && (!country || region.countryCode === country)) regions.push(region);
    }
    const normalizedName = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
    results = regions.filter((region) => normalizedName(region.name).includes(normalizedName(searchName)));
  } else if (level === "city") {
    results = results.filter((item) => item.type === "city");
  } else if (level === "locality") {
    results = results.filter((item) => item.type === "locality");
  }
  return payload(query, results.filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index).slice(0, 5));
}

/** Explicit user-submitted place search only: do not wire this to autocomplete. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().replace(/\s+/g, " ");
  const country = (params.get("country") ?? "").toUpperCase();
  const parent = (params.get("parent") ?? "").trim();
  const level = params.get("level") ?? "";
  const id = params.get("id") ?? "";
  // Only place names. No addresses, emails, URLs, coordinates or phone numbers.
  const isPlaceName = (name: string) => name.length <= 100 && /^[\p{L}\p{M} .,'’()\-]+$/u.test(name);
  if ((id && (!/^\d{1,10}$/.test(id) || !validId(Number(id)) || query.length > 0))
    || (!id && (query.length < 2 || !isPlaceName(query)))
    || (country && !/^[A-Z]{2}$/.test(country))
    || (parent && !isPlaceName(parent))
    || !["", "region", "city", "locality"].includes(level)) {
    return reply(payload(query.slice(0, 100), [], "Escribe el nombre público de un lugar (2–100 letras). No incluyas domicilios ni datos personales."), 400);
  }
  const cacheKey = JSON.stringify([query.toLocaleLowerCase("es"), country, parent.toLocaleLowerCase("es"), level, id]);
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
  const cached = cache.get(cacheKey);
  if (cached) return reply({ ...cached.data, cached: true });
  if (active?.key === cacheKey) {
    try { return reply(await active.promise); }
    catch { return reply(payload(query, [], "El servicio geográfico no respondió. Vuelve a buscar en unos instantes."), 503); }
  }
  if (active || now - lastStarted < 1_000 || now < upstreamCooldownUntil) {
    return reply(payload(query, [], "Hay una consulta geográfica en curso. Espera unos segundos y vuelve a buscar."), 429, now < upstreamCooldownUntil ? 60 : 2);
  }
  lastStarted = now;
  const promise = search(query, country, parent, level as PlaceLevel | "", id);
  active = { key: cacheKey, promise };
  try {
    const data = await promise;
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL, data });
    return reply(data);
  } catch (error) {
    console.error("[places]", error instanceof Error ? error.message : "unknown-error");
    return reply(payload(query, [], "El servicio geográfico no está disponible. No se inventaron ubicaciones; inténtalo de nuevo."), 503);
  } finally {
    if (active?.promise === promise) active = undefined;
  }
}
