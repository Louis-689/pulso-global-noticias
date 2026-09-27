import assert from "node:assert/strict";
import test from "node:test";
import { isSavedArticle, loadSaved, persistSaved } from "../components/eye/saved";
import type { PulseArticle } from "../lib/pulse-types";

const article: PulseArticle = {
  id: "saved-1", url: "https://example.com/story", title: "Historia guardada", domain: "example.com", sourceName: "Example",
  destinationHost: "example.com", sourceCountry: "PE", language: "es", seenDate: "2026-09-26T12:00:00.000Z", publishedAt: null,
  timestampBasis: "published", provider: "test", kind: "news", reviewStatus: "unknown", mentionedCountries: [], sentiment: 3,
  positiveTerms: ["avance"], negativeTerms: [],
};

test("archivo local acepta la escala léxica real y limita registros", () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key), clear: () => values.clear(), key: () => null, get length() { return values.size; },
  } });
  try {
    assert.equal(isSavedArticle(article), true);
    persistSaved([article.id], [article]);
    assert.deepEqual(loadSaved().ids, [article.id]);
    assert.equal(loadSaved().archive[0]?.sentiment, 3);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});
