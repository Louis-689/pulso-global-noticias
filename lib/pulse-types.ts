export const PULSE_TIMESPANS = ["1h", "6h", "12h", "24h", "48h", "7d", "30d", "365d"] as const;
export type PulseTimespan = (typeof PULSE_TIMESPANS)[number];
export type PulseMode = "news" | "early" | "library";
export type PulseCategory = "all" | "politics" | "economy" | "technology" | "science" | "health" | "climate" | "security" | "culture" | "sports" | "education";

export type MentionedCountry = { code: string; name: string; lat: number; lng: number; evidence: string };
export type PulseArticle = {
  id: string;
  url: string;
  title: string;
  domain: string;
  sourceName: string;
  destinationHost: string;
  sourceCountry: string;
  language: string;
  seenDate: string;
  publishedAt: string | null;
  timestampBasis: "published" | "observed" | "event";
  provider: string;
  kind: "news" | "earthquake" | "preprint" | "official";
  reviewStatus: "unknown" | "preliminary" | "reviewed" | "not-peer-reviewed";
  media?: { url: string; type: "image" | "video"; credit: string };
  /** Playable video declared by the publisher (YouTube embed or MP4/WebM). */
  video?: string;
  /** First topic whose vocabulary appears in the headline (for color and icon). */
  topic?: PulseCategory;
  mentionedCountries: MentionedCountry[];
  location?: { lat: number; lng: number; label: string };
  sentiment: number;
  /** Host of the outlet that wrote it (differs from destinationHost for aggregator links). */
  sourceHost?: string;
  /** Short summary from the feed, when the publisher provides one. */
  summary?: string;
  /** Other trusted outlets that published the same story. */
  confirmedBy?: string[];
  /** Library mode: outlet that publishes it and where it is reported as blocked. */
  outlet?: { id: string; blockedIn: string[]; stateFunded?: boolean };
  positiveTerms: string[];
  negativeTerms: string[];
};
export type PulsePoint = { id: string; lat: number; lng: number; name: string; count: number; articleIds: string[] };
export type PulseConnection = {
  sourceId: string; targetId: string;
  startLat: number; startLng: number; endLat: number; endLng: number;
  label: string; weight: number; articleIds: string[];
};
export type PulseStats = { total: number; located: number; unlocated: number; positive: number; negative: number; neutral: number; scored: number };
export type PulseView = {
  articles: PulseArticle[];
  points: PulsePoint[];
  connections: PulseConnection[];
  rankings: { positive: PulseArticle[]; negative: PulseArticle[] };
  tension: number | null;
  stats: PulseStats;
};
export type PulseSource = { name: string; url: string; status: "ok" | "empty" | "error"; count: number; note?: string };
export type PulseResponse = PulseView & {
  mode: PulseMode;
  timespan: PulseTimespan;
  category: PulseCategory;
  pointBasis: "mentionedCountries";
  dataProvider: string;
  fetchedAt: string;
  partial: boolean;
  sources: PulseSource[];
  errors: string[];
  coverageNote: string;
  /** Headlines discarded because their outlet is not on the trusted list. */
  untrustedDropped?: number;
};
