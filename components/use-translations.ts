"use client";

import { useEffect, useRef, useState } from "react";
import type { PulseArticle } from "@/lib/pulse-types";
import { translateMany } from "@/lib/translate-client";

/** Headlines of the given stories translated into `lang`, keyed by story id. */
export function useTranslatedTitles(articles: PulseArticle[], lang: string): Map<string, string> {
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const tried = useRef(new Set<string>());
  const key = articles.filter((article) => article.lang && article.lang !== lang).map((article) => article.id).join();

  useEffect(() => { tried.current = new Set(); setTitles(new Map()); }, [lang]);
  useEffect(() => {
    const pending = articles.filter((article) => article.lang && article.lang !== lang && !tried.current.has(article.id));
    if (!pending.length) return;
    pending.forEach((article) => tried.current.add(article.id));
    let alive = true;
    const groups = new Map<string, PulseArticle[]>();
    for (const article of pending) groups.set(article.lang!, [...(groups.get(article.lang!) ?? []), article]);
    const timer = window.setTimeout(() => {
      for (const [from, group] of groups) {
        void translateMany(group.map((article) => article.title), from, lang).then((out) => {
          if (!alive) { group.forEach((article) => tried.current.delete(article.id)); return; }
          setTitles((current) => {
            const next = new Map(current);
            group.forEach((article, index) => { if (out[index]) next.set(article.id, out[index]!); });
            return next;
          });
        });
      }
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); pending.forEach((article) => tried.current.delete(article.id)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang]);

  return titles;
}
