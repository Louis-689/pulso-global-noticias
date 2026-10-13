import type { PulseArticle } from "./pulse-types";
import { trustedDomainOf } from "./trusted";

/**
 * Corroboration: a story counts as confirmed when other trusted outlets
 * published it too. Two headlines describe the same story when they share
 * at least three meaningful words, or two words plus a mentioned country.
 * It is a heuristic, so the UI names the outlets and links each one.
 */
const STOP = new Set(("this that with from have after over into about their there will would were been says said more than they what when como para pero sobre tras entre desde esta este estos estas sus los las del una unos unas porque cuando donde según ante hasta contra dans pour avec plus sont mais leur être also just only very year years años nach nicht eine einer über sich auch werden pelo pela")
  .split(" "));
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function keywords(title: string): Set<string> {
  return new Set(fold(title).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4 && !STOP.has(word)).map((word) => word.slice(0, 7)));
}

export function sameStory(a: PulseArticle, b: PulseArticle, ka = keywords(a.title), kb = keywords(b.title)): boolean {
  let shared = 0;
  for (const word of ka) if (kb.has(word)) shared++;
  if (shared >= 3) return true;
  return shared >= 2 && a.mentionedCountries.some((country) => b.mentionedCountries.some((other) => other.code === country.code));
}

// Group by the trusted-list entry, so bbc.co.uk and telegraph.co.uk stay distinct.
const outletKey = (article: PulseArticle) => {
  const host = article.sourceHost ?? article.destinationHost;
  return trustedDomainOf(host) ?? host.replace(/^www\./, "");
};

export function corroborate(articles: PulseArticle[]): PulseArticle[] {
  const words = articles.map((article) => keywords(article.title));
  return articles.map((article, i) => {
    const own = outletKey(article);
    const others = new Map<string, string>();
    articles.forEach((other, j) => {
      const key = outletKey(other);
      if (i === j || key === own || others.has(key) || other.kind !== "news") return;
      if (sameStory(article, other, words[i], words[j])) others.set(key, other.sourceName);
    });
    return others.size ? { ...article, confirmedBy: [...others.values()].slice(0, 8) } : article;
  });
}
