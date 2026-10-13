import type { PulseArticle } from "./pulse-types";
import type { Lang } from "./i18n";

const locale = (lang: Lang) => (lang === "zh" ? "zh-CN" : lang);

export function relativeTime(value: string | null, lang: Lang, now = Date.now()) {
  const time = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return "";
  const format = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto", style: "short" });
  const minutes = Math.round((time - now) / 60000);
  if (Math.abs(minutes) < 60) return format.format(Math.min(0, minutes), "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, "hour");
  return format.format(Math.round(hours / 24), "day");
}

const regionNames = new Map<string, Intl.DisplayNames>();
/** Country names in the reader's language, straight from the browser's CLDR data. */
export function countryName(code: string, lang: Lang, fallback = code) {
  if (code === "EU") return lang === "es" ? "Unión Europea" : new Intl.DisplayNames([locale(lang)], { type: "region" }).of("EU") ?? "EU";
  try {
    let names = regionNames.get(lang);
    if (!names) { names = new Intl.DisplayNames([locale(lang)], { type: "region" }); regionNames.set(lang, names); }
    return names.of(code) ?? fallback;
  } catch {
    return fallback;
  }
}

export function flag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

export function sourceLabel(article: PulseArticle) {
  return article.sourceName || article.destinationHost || article.domain;
}

export function preferredMediaUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("bbci.co.uk")) parsed.pathname = parsed.pathname.replace(/\/standard\/\d+\//, "/standard/800/");
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Stable hue per source so text-only cards still get their own color. */
