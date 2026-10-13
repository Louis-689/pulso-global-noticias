/**
 * Which language a headline is written in. Feeds declare it, GDELT names it in
 * English ("Spanish"), and the writing system settles mixed editions: an
 * Arabic-script title in an English feed is not English.
 */
const NAMES: Record<string, string> = {
  english: "en", spanish: "es", portuguese: "pt", french: "fr", german: "de", italian: "it", russian: "ru",
  arabic: "ar", chinese: "zh", japanese: "ja", hindi: "hi", persian: "fa", farsi: "fa", ukrainian: "uk",
  korean: "ko", turkish: "tr", dutch: "nl", polish: "pl", hebrew: "he", urdu: "ur", bengali: "bn",
};

/** "es", "es-419", "Spanish" → "es". Unknown values give undefined. */
export function langCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().toLowerCase();
  if (/^[a-z]{2}(?:[-_][a-z0-9]+)*$/.test(clean)) return clean.slice(0, 2);
  return NAMES[clean];
}

const SCRIPT_OF: Record<string, string> = { ru: "cyrl", uk: "cyrl", ar: "arab", fa: "arab", ur: "arab", zh: "han", ja: "kana", hi: "deva", ko: "hang", he: "hebr", bn: "beng" };

/** Language guessed from the writing system, for non-Latin scripts only. */
export function scriptLang(text: string): string | undefined {
  const count = (pattern: RegExp) => text.match(pattern)?.length ?? 0;
  const letters = count(/\p{L}/gu) || 1;
  const share = (pattern: RegExp) => count(pattern) / letters;
  if (share(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) > 0.05) return "ja";
  if (share(/\p{Script=Han}/gu) > 0.3) return "zh";
  if (share(/\p{Script=Hangul}/gu) > 0.3) return "ko";
  if (share(/\p{Script=Cyrillic}/gu) > 0.5) return "ru";
  if (share(/\p{Script=Arabic}/gu) > 0.5) return "ar";
  if (share(/\p{Script=Devanagari}/gu) > 0.5) return "hi";
  if (share(/\p{Script=Hebrew}/gu) > 0.5) return "he";
  if (share(/\p{Script=Bengali}/gu) > 0.5) return "bn";
  return undefined;
}

/** Declared language, unless the title's script plainly contradicts it. */
export function detectLang(title: string, declared?: string): string | undefined {
  const fromScript = scriptLang(title);
  // A Latin-script title in a feed declared as Russian, Arabic… is not that language.
  if (!fromScript) return declared && SCRIPT_OF[declared] && mostlyLatin(title) ? undefined : declared;
  if (declared && SCRIPT_OF[declared] === SCRIPT_OF[fromScript]) return declared;
  return fromScript;
}

const mostlyLatin = (title: string) => (title.match(/\p{Script=Latin}/gu)?.length ?? 0) > title.length * 0.4;
