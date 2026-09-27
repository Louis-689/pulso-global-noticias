import type { PulseArticle } from "@/lib/pulse-types";

const SAVED_ARCHIVE_KEY = "ojo-global-saved-articles-v1";
const SAVED_IDS_KEY = "ojo-global-saved-ids-v1";
const LEGACY_ARCHIVE_KEY = "pulso-global-saved-articles-v2";
const LEGACY_IDS_KEY = "pulso-global-saved";
const SAVED_KINDS = new Set<PulseArticle["kind"]>(["news", "earthquake", "preprint", "official"]);
const SAVED_REVIEW_STATES = new Set<PulseArticle["reviewStatus"]>(["unknown", "preliminary", "reviewed", "not-peer-reviewed"]);
const SAVED_TIMESTAMP_BASES = new Set<PulseArticle["timestampBasis"]>(["published", "observed", "event"]);

function isSafeSavedUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSavedCountry(value: unknown): value is PulseArticle["mentionedCountries"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<PulseArticle["mentionedCountries"][number]>;
  return typeof item.code === "string" && /^[A-Z]{2}$/.test(item.code)
    && typeof item.name === "string" && item.name.length <= 100
    && typeof item.evidence === "string" && item.evidence.length <= 250
    && typeof item.lat === "number" && Number.isFinite(item.lat) && item.lat >= -90 && item.lat <= 90
    && typeof item.lng === "number" && Number.isFinite(item.lng) && item.lng >= -180 && item.lng <= 180;
}

/** Saved articles live in localStorage; treat every field as untrusted on the way back in. */
export function isSavedArticle(value: unknown): value is PulseArticle {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<PulseArticle>;
  const locationValid = item.location === undefined || (typeof item.location === "object" && item.location !== null
    && typeof item.location.lat === "number" && Number.isFinite(item.location.lat) && item.location.lat >= -90 && item.location.lat <= 90
    && typeof item.location.lng === "number" && Number.isFinite(item.location.lng) && item.location.lng >= -180 && item.location.lng <= 180
    && typeof item.location.label === "string" && item.location.label.length <= 250);
  const mediaValid = item.media === undefined || (typeof item.media === "object" && item.media !== null
    && isSafeSavedUrl(item.media.url) && (item.media.type === "image" || item.media.type === "video")
    && typeof item.media.credit === "string" && item.media.credit.length <= 150);
  return typeof item.id === "string" && item.id.length <= 150
    && typeof item.title === "string" && item.title.length <= 500
    && isSafeSavedUrl(item.url)
    && typeof item.domain === "string" && item.domain.length <= 255
    && typeof item.sourceName === "string" && item.sourceName.length <= 150
    && typeof item.destinationHost === "string" && item.destinationHost.length <= 255
    && typeof item.sourceCountry === "string" && item.sourceCountry.length <= 100
    && typeof item.language === "string" && item.language.length <= 100
    && typeof item.seenDate === "string" && Number.isFinite(Date.parse(item.seenDate))
    && (item.publishedAt === null || typeof item.publishedAt === "string" && Number.isFinite(Date.parse(item.publishedAt)))
    && typeof item.provider === "string" && item.provider.length <= 150
    && SAVED_KINDS.has(item.kind as PulseArticle["kind"])
    && SAVED_REVIEW_STATES.has(item.reviewStatus as PulseArticle["reviewStatus"])
    && SAVED_TIMESTAMP_BASES.has(item.timestampBasis as PulseArticle["timestampBasis"])
    && Array.isArray(item.mentionedCountries) && item.mentionedCountries.length <= 50 && item.mentionedCountries.every(isSavedCountry)
    // lexicalTone is a term count difference, not a normalized -1..1 score.
    // Preserve legitimate saved stories that contain several signal words.
    && typeof item.sentiment === "number" && Number.isSafeInteger(item.sentiment) && item.sentiment >= -100 && item.sentiment <= 100
    && Array.isArray(item.positiveTerms) && item.positiveTerms.length <= 100 && item.positiveTerms.every((term) => typeof term === "string" && term.length <= 100)
    && Array.isArray(item.negativeTerms) && item.negativeTerms.length <= 100 && item.negativeTerms.every((term) => typeof term === "string" && term.length <= 100)
    && locationValid && mediaValid;
}

export function loadSaved(): { ids: string[]; archive: PulseArticle[] } {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(SAVED_IDS_KEY) || localStorage.getItem(LEGACY_IDS_KEY) || "[]");
    const archive: unknown = JSON.parse(localStorage.getItem(SAVED_ARCHIVE_KEY) || localStorage.getItem(LEGACY_ARCHIVE_KEY) || "[]");
    const migrated = {
      ids: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(-200) : [],
      archive: Array.isArray(archive) ? archive.filter(isSavedArticle).slice(-200) : [],
    };
    if (!localStorage.getItem(SAVED_IDS_KEY) && migrated.ids.length) persistSaved(migrated.ids, migrated.archive);
    return migrated;
  } catch {
    return { ids: [], archive: [] };
  }
}

export function persistSaved(ids: string[], archive: PulseArticle[]) {
  try {
    localStorage.setItem(SAVED_IDS_KEY, JSON.stringify(ids));
    localStorage.setItem(SAVED_ARCHIVE_KEY, JSON.stringify(archive));
  } catch {
    /* The UI still works for this session when storage is unavailable. */
  }
}
