"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PulseArticle } from "@/lib/pulse-types";
import { translateMany } from "@/lib/translate-client";

export type TranslatableItem = { id: string; text: string; lang?: string };

/** Texts translated into `lang`, keyed by id. Items already in `lang` (or of unknown language) are left alone. */
export function useTranslated(items: TranslatableItem[], lang: string): Map<string, string> {
  const [out, setOut] = useState<Map<string, string>>(new Map());
  const tried = useRef(new Set<string>());
  const foreign = items.filter((item) => item.lang && item.lang !== lang && item.text);
  const key = foreign.map((item) => item.id).join();

  useEffect(() => { tried.current = new Set(); setOut(new Map()); }, [lang]);
  useEffect(() => {
    const pending = foreign.filter((item) => !tried.current.has(item.id));
    if (!pending.length) return;
    pending.forEach((item) => tried.current.add(item.id));
    let alive = true;
    const groups = new Map<string, TranslatableItem[]>();
    for (const item of pending) groups.set(item.lang!, [...(groups.get(item.lang!) ?? []), item]);
    const timer = window.setTimeout(() => {
      for (const [from, group] of groups) {
        void translateMany(group.map((item) => item.text), from, lang).then((texts) => {
          if (!alive) return;
          setOut((current) => {
            const next = new Map(current);
            group.forEach((item, index) => { if (texts[index]) next.set(item.id, texts[index]!); });
            return next;
          });
        });
      }
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); pending.forEach((item) => tried.current.delete(item.id)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang]);

  return out;
}

/** Headlines of the given stories translated into `lang`, keyed by story id. */
export function useTranslatedTitles(articles: PulseArticle[], lang: string): Map<string, string> {
  const items = useMemo(() => articles.map((article) => ({ id: article.id, text: article.title, lang: article.lang })), [articles]);
  return useTranslated(items, lang);
}
