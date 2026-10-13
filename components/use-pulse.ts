"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import type { PulseCategory, PulseMode, PulseResponse, PulseTimespan } from "@/lib/pulse-types";

export type PulseFilters = { category: PulseCategory; timespan: PulseTimespan; mode: PulseMode; country: string; query: string; lang: Lang };

/**
 * Live feed: debounced fetch when filters change, then a 60 s poll that pauses
 * while the tab is hidden. Refreshes keep the current view and report which
 * stories are new since the previous sample.
 */
export function usePulse(filters: PulseFilters, live: boolean) {
  const [data, setData] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cached, setCached] = useState(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const requestRef = useRef(0);
  const dataRef = useRef<PulseResponse | null>(null);
  const knownRef = useRef<Set<string> | null>(null);

  const fetchPulse = useCallback(async (signal?: AbortSignal, keep = false) => {
    const id = ++requestRef.current;
    setLoading(true);
    setError(false);
    if (!keep) knownRef.current = null;
    const params = new URLSearchParams({ category: filters.category, timespan: filters.timespan, mode: filters.mode, lang: filters.lang });
    if (filters.country) params.set("country", filters.country);
    if (filters.query) params.set("q", filters.query);
    try {
      let response = await fetch(`/api/pulse?${params}`, { signal, headers: { Accept: "application/json" } });
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        if (signal?.aborted) return;
        response = await fetch(`/api/pulse?${params}`, { signal, headers: { Accept: "application/json" } });
      }
      if (!response.ok) throw new Error(String(response.status));
      const result = await response.json() as PulseResponse;
      if (requestRef.current !== id) return;
      const previous = knownRef.current;
      setFreshIds(previous ? new Set(result.articles.filter((article) => !previous.has(article.id)).map((article) => article.id)) : new Set());
      knownRef.current = new Set(result.articles.map((article) => article.id));
      setCached(response.headers.get("x-pulso-offline") === "1");
      dataRef.current = result;
      setData(result);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (requestRef.current === id) setError(true);
    } finally {
      if (requestRef.current === id) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void fetchPulse(controller.signal, false), 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [fetchPulse]);

  useEffect(() => {
    if (!live) return;
    const refresh = () => { if (document.visibilityState === "visible") void fetchPulse(undefined, true); };
    const timer = window.setInterval(refresh, 60_000);
    const onVisible = () => {
      const fetchedAt = Date.parse(dataRef.current?.fetchedAt || "");
      if (document.visibilityState === "visible" && (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > 60_000)) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onVisible); };
  }, [fetchPulse, live]);

  return { data, loading, error, cached, freshIds, refresh: useCallback(() => fetchPulse(undefined, true), [fetchPulse]) };
}
