"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PulseCategory, PulseMode, PulseResponse, PulseTimespan } from "@/lib/pulse-types";

export type PulseFilters = { category: PulseCategory; timespan: PulseTimespan; mode: PulseMode; country: string; query: string };

export function emptyResponse(filters: PulseFilters, message: string): PulseResponse {
  return {
    mode: filters.mode, timespan: filters.timespan, category: filters.category, pointBasis: "mentionedCountries",
    dataProvider: "Sin resultados disponibles", fetchedAt: new Date().toISOString(), partial: true, sources: [], errors: [message],
    coverageNote: message, articles: [], points: [], connections: [], rankings: { positive: [], negative: [] }, tension: null,
    stats: { total: 0, located: 0, unlocated: 0, positive: 0, negative: 0, neutral: 0, scored: 0 },
  };
}

/**
 * Live pulse feed: debounced fetch on filter changes plus a 60 s polling loop
 * that pauses when the tab is hidden. Every refresh keeps the current view and
 * flags which article ids arrived since the previous successful sample.
 */
export function usePulse(filters: PulseFilters, live: boolean) {
  const [data, setData] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const requestRef = useRef(0);
  const dataRef = useRef<PulseResponse | null>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const freshTimerRef = useRef(0);

  const fetchPulse = useCallback(async (signal?: AbortSignal, preserveCurrent = false) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    if (!preserveCurrent) {
      dataRef.current = null;
      setData(null);
      knownIdsRef.current = null;
      setFreshIds(new Set());
    }
    const params = new URLSearchParams({ category: filters.category, timespan: filters.timespan, mode: filters.mode });
    if (filters.country) params.set("country", filters.country);
    if (filters.query) params.set("q", filters.query);
    try {
      let response = await fetch(`/api/pulse?${params}`, { signal, headers: { Accept: "application/json" } });
      // Rapidly moving through topics can briefly hit the edge's upstream
      // concurrency guard. Retry once instead of turning that transient state
      // into a misleading zero-news screen.
      if (response.status === 429) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 1800);
          signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        });
        response = await fetch(`/api/pulse?${params}`, { signal, headers: { Accept: "application/json" } });
      }
      if (!response.ok) throw new Error(String(response.status));
      const result = await response.json() as PulseResponse;
      if (requestRef.current !== requestId) return;
      const previous = knownIdsRef.current;
      if (previous) {
        const fresh = new Set(result.articles.filter((article) => !previous.has(article.id)).map((article) => article.id));
        if (fresh.size) {
          setFreshIds(fresh);
          window.clearTimeout(freshTimerRef.current);
          freshTimerRef.current = window.setTimeout(() => setFreshIds(new Set()), 120_000);
        }
      }
      knownIdsRef.current = new Set(result.articles.map((article) => article.id));
      dataRef.current = result;
      setData(result);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (requestRef.current !== requestId) return;
      const message = "No pudimos actualizar las fuentes. Vuelve a intentarlo.";
      setError(message);
      if (!preserveCurrent || !dataRef.current) {
        const fallback = emptyResponse(filters, message);
        dataRef.current = fallback;
        setData(fallback);
      }
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { if (!controller.signal.aborted) void fetchPulse(controller.signal, false); }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [fetchPulse]);

  useEffect(() => {
    if (!live) return;
    const refresh = () => { if (document.visibilityState === "visible") void fetchPulse(undefined, true); };
    const refreshIfStale = () => {
      const fetchedAt = Date.parse(dataRef.current?.fetchedAt || "");
      if (document.visibilityState === "visible" && (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt >= 60_000)) refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("online", refreshIfStale);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("online", refreshIfStale);
    };
  }, [fetchPulse, live]);

  useEffect(() => () => window.clearTimeout(freshTimerRef.current), []);

  return { data, loading, error, freshIds, refresh: useCallback(() => fetchPulse(undefined, true), [fetchPulse]) };
}
