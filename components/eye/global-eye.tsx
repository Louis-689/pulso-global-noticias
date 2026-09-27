"use client";

import dynamic from "next/dynamic";
import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InstallAppButton } from "@/components/pwa-register";
import { countries } from "@/lib/pulse-geography";
import type { PlaceResult, PlacesResponse } from "@/lib/pulse-places-types";
import type { PulseArticle, PulseCategory, PulseConnection, PulseMode, PulseTimespan } from "@/lib/pulse-types";
import { evidenceSummary, kindLabel, relativeTime, sourceLabel } from "./format";
import { usePulse } from "./use-pulse";
import { loadSaved, persistSaved } from "./saved";
import { LeadStory, StoryMedia, StoryRow } from "./story";

const PulseGlobe = dynamic(() => import("@/components/pulse-globe"), { ssr: false, loading: () => <div className="map-loading"><span className="spinner" />Preparando la Tierra…</div> });
const CesiumPulseGlobe = dynamic(() => import("@/components/cesium-pulse-globe"), { ssr: false, loading: () => <div className="map-loading"><span className="spinner" />Cargando motor geoespacial…</div> });

const CATEGORIES: Array<{ group: string; items: Array<[PulseCategory, string]> }> = [
  { group: "El mundo", items: [["all", "Panorama"], ["politics", "Política"], ["economy", "Economía"], ["security", "Conflictos"]] },
  { group: "Conocimiento", items: [["technology", "Tecnología"], ["science", "Ciencia"], ["health", "Salud"], ["education", "Educación"]] },
  { group: "Sociedad", items: [["climate", "Clima"], ["culture", "Cultura"], ["sports", "Deportes"]] },
];
const EARLY_CATEGORIES = new Set<PulseCategory>(["all", "science", "technology"]);
const WINDOWS: Array<[PulseTimespan, string]> = [["1h", "1 hora"], ["6h", "6 horas"], ["12h", "12 horas"], ["24h", "24 horas"], ["48h", "48 horas"], ["7d", "7 días"]];
// Rankings must describe the data actually retained. Month/year controls were
// misleading because this release has no persistent historical warehouse yet.
const RANKING_WINDOWS: Array<[PulseTimespan, string]> = [["24h", "Día"], ["7d", "Semana"]];
type FeedMode = "latest" | "media" | "located" | "saved";
type SortMode = "newest" | "coverage" | "signal";
type MapMode = "realistic" | "illustrated" | "flat";
const categoryLabel = (id: PulseCategory) => CATEGORIES.flatMap((group) => group.items).find(([value]) => value === id)?.[1] || id;

export function GlobalEye() {
  const [category, setCategory] = useState<PulseCategory>("all");
  const [timespan, setTimespan] = useState<PulseTimespan>("24h");
  const [mode, setMode] = useState<PulseMode>("news");
  const [country, setCountry] = useState("");
  const [query, setQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [placeDraft, setPlaceDraft] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeMessage, setPlaceMessage] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<PulseArticle | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<PulseConnection | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>("latest");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [saved, setSaved] = useState<string[]>([]);
  const [savedArchive, setSavedArchive] = useState<PulseArticle[]>([]);
  const [liveMode, setLiveMode] = useState(true);
  const [showConnections, setShowConnections] = useState(false);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [showCountryAreas, setShowCountryAreas] = useState(true);
  const [showCountrySignals, setShowCountrySignals] = useState(true);
  const [showExactSignals, setShowExactSignals] = useState(true);
  const [mapMode, setMapMode] = useState<MapMode>("realistic");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [focusedArticleId, setFocusedArticleId] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && localStorage.getItem("pulso-notifications") === "on");
  const [visiblePage, setVisiblePage] = useState({ key: "", count: 30 });
  const searchRef = useRef<HTMLInputElement>(null);
  const placeRequestRef = useRef(0);
  const placeAbortRef = useRef<AbortController | null>(null);

  const filters = useMemo(() => ({ category, timespan, mode, country, query }), [category, timespan, mode, country, query]);
  const { data, loading, error, freshIds, refresh } = usePulse(filters, liveMode);
  const countryName = countries.find((item) => item.code === country)?.name;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = loadSaved();
      setSaved(stored.ids);
      setSavedArchive(stored.archive);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (!mapExpanded && !mobileFiltersOpen) return;
    const closeOverlay = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMapExpanded(false);
      setMobileFiltersOpen(false);
    };
    window.addEventListener("keydown", closeOverlay);
    return () => window.removeEventListener("keydown", closeOverlay);
  }, [mapExpanded, mobileFiltersOpen]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const articles = useMemo(() => data?.articles ?? [], [data?.articles]);
  const visibleArticles = useMemo(() => {
    const selected = feedMode === "media" ? articles.filter((item) => item.media)
      : feedMode === "located" ? articles.filter((item) => item.location || item.mentionedCountries.length)
      : feedMode === "saved" ? [...new Map([...articles.filter((item) => saved.includes(item.id)), ...savedArchive.filter((item) => saved.includes(item.id))].map((item) => [item.id, item])).values()]
      : articles;
    return [...selected].sort((a, b) => {
      if (sortMode === "coverage") return b.mentionedCountries.length - a.mentionedCountries.length || Date.parse(b.publishedAt || b.seenDate) - Date.parse(a.publishedAt || a.seenDate);
      if (sortMode === "signal") return (b.positiveTerms.length + b.negativeTerms.length + (b.kind === "official" || b.kind === "preprint" || b.kind === "earthquake" ? 3 : 0)) - (a.positiveTerms.length + a.negativeTerms.length + (a.kind === "official" || a.kind === "preprint" || a.kind === "earthquake" ? 3 : 0));
      return Date.parse(b.publishedAt || b.seenDate) - Date.parse(a.publishedAt || a.seenDate);
    });
  }, [feedMode, sortMode, articles, saved, savedArchive]);
  const pageKey = `${feedMode}|${sortMode}|${category}|${timespan}|${mode}|${country}|${query}`;
  const visibleCount = visiblePage.key === pageKey ? visiblePage.count : 30;
  const connectionArticles = useMemo(() => selectedConnection ? articles.filter((item) => selectedConnection.articleIds.includes(item.id)) : [], [selectedConnection, articles]);
  const focusedArticle = useMemo(() => articles.find((item) => item.id === focusedArticleId) ?? savedArchive.find((item) => item.id === focusedArticleId) ?? null, [articles, savedArchive, focusedArticleId]);
  const mapArticles = useMemo(() => focusedArticle && !articles.some((item) => item.id === focusedArticle.id) ? [focusedArticle, ...articles] : articles, [articles, focusedArticle]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSelectedPlace(null);
    setQuery(searchDraft.trim().slice(0, 100));
  }
  async function searchPlace(event: FormEvent) {
    event.preventDefault();
    const term = placeDraft.trim();
    if (term.length < 2) { setPlaceMessage("Escribe al menos dos letras."); return; }
    placeAbortRef.current?.abort();
    const controller = new AbortController();
    placeAbortRef.current = controller;
    const requestId = ++placeRequestRef.current;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setPlaceLoading(true);
    setPlaceMessage("");
    setPlaceResults([]);
    const params = new URLSearchParams({ q: term });
    if (country) params.set("country", country);
    if (selectedPlace?.region) params.set("parent", selectedPlace.region);
    try {
      const response = await fetch(`/api/places?${params}`, { signal: controller.signal, headers: { Accept: "application/json" } });
      const result = await response.json() as PlacesResponse;
      if (placeRequestRef.current !== requestId) return;
      setPlaceResults(result.results || []);
      setPlaceMessage(result.error || (result.results.length ? "" : "No encontramos ese lugar. Prueba su nombre oficial."));
    } catch (cause) {
      if (placeRequestRef.current === requestId) setPlaceMessage(cause instanceof DOMException && cause.name === "AbortError" ? "La búsqueda tardó demasiado." : "La búsqueda geográfica no está disponible ahora.");
    } finally {
      window.clearTimeout(timeout);
      if (placeRequestRef.current === requestId) { placeAbortRef.current = null; setPlaceLoading(false); }
    }
  }
  function cancelPlaceSearch() { placeRequestRef.current += 1; placeAbortRef.current?.abort(); placeAbortRef.current = null; setPlaceLoading(false); }
  function choosePlace(place: PlaceResult) {
    cancelPlaceSearch();
    setSelectedPlace(place);
    setCountry(place.countryCode);
    setPlaceDraft(place.name);
    setPlaceResults([]);
    setSearchDraft(place.name);
    setQuery(place.name);
    setMode("news");
    setMobileFiltersOpen(false);
  }
  function clearLocation() {
    cancelPlaceSearch();
    setSelectedPlace(null);
    setCountry("");
    setPlaceDraft("");
    setPlaceResults([]);
    setPlaceMessage("");
    setQuery("");
    setSearchDraft("");
    setCategory("all");
    setMode("news");
    setFeedMode("latest");
    setResetKey((value) => value + 1);
  }
  function selectMode(nextMode: PulseMode) {
    if (nextMode === "early" && !EARLY_CATEGORIES.has(category)) setCategory("all");
    setMode(nextMode);
  }
  function selectCategory(nextCategory: PulseCategory) {
    cancelPlaceSearch();
    setCategory(nextCategory);
    setFeedMode("latest");
    setMobileFiltersOpen(false);
    // A town search is intentionally narrow and was previously carried into
    // every topic without a visible explanation, often producing an apparent
    // all-zero dashboard. Topic navigation returns to the selected country (or
    // the world) while the exact-place box remains available for a new drilldown.
    if (selectedPlace || query) {
      setSelectedPlace(null);
      setQuery("");
      setSearchDraft("");
      setPlaceDraft("");
      setPlaceResults([]);
      setPlaceMessage("");
    }
  }
  function selectCountry(code: string) {
    cancelPlaceSearch();
    setSelectedPlace(null);
    setCountry(code);
    setQuery("");
    setSearchDraft("");
    setPlaceDraft("");
    setPlaceResults([]);
    setPlaceMessage("");
    setMobileFiltersOpen(false);
  }
  function focusArticleOnMap(article: PulseArticle) {
    setFocusedArticleId(article.id);
    setSelectedArticle(null);
    setMapExpanded(false);
    if (window.matchMedia("(max-width: 1100px)").matches) window.requestAnimationFrame(() => document.querySelector(".map-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function openArticle(article: PulseArticle) {
    setFocusedArticleId(article.id);
    setSelectedArticle(article);
  }
  function toggleSaved(article: PulseArticle) {
    const removing = saved.includes(article.id);
    const nextIds = removing ? saved.filter((id) => id !== article.id) : [...saved.filter((id) => id !== article.id), article.id].slice(-200);
    const nextArchive = removing ? savedArchive.filter((item) => item.id !== article.id) : [...savedArchive.filter((item) => item.id !== article.id), article].slice(-200);
    setSaved(nextIds);
    setSavedArchive(nextArchive);
    persistSaved(nextIds, nextArchive);
  }
  function toggleBriefing() {
    if (!("speechSynthesis" in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    if (!visibleArticles.length) return;
    const utterance = new SpeechSynthesisUtterance(`Ojo Global. ${visibleArticles.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}`).join(". ")}`);
    utterance.lang = "es-ES";
    utterance.rate = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }
  function handleFeedTabs(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const order: FeedMode[] = ["latest", "media", "located", "saved"];
    const current = Math.max(0, order.indexOf(feedMode));
    const next = event.key === "Home" ? 0 : event.key === "End" ? order.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + order.length) % order.length;
    const nextMode = order[next];
    const group = event.currentTarget;
    setFeedMode(nextMode);
    window.requestAnimationFrame(() => group.querySelector<HTMLButtonElement>(`[data-feed-mode="${nextMode}"]`)?.focus());
  }
  const title = selectedPlace?.displayName || countryName || (mode === "early" ? "Señales tempranas" : categoryLabel(category));
  const leadArticle = visibleArticles.find((article) => article.media) ?? visibleArticles[0];
  const remainingArticles = visibleArticles.filter((article) => article.id !== leadArticle?.id);
  const renderedArticles = remainingArticles.slice(0, Math.max(0, visibleCount - (leadArticle ? 1 : 0)));
  const statusLabel = loading ? "Actualizando" : error ? "Sin conexión" : data?.partial ? "Cobertura parcial" : "En vivo";
  const okSources = data?.sources.filter((source) => source.status === "ok") ?? [];
  const unavailable = !!error && !data?.sources.length;

  useEffect(() => {
    if (!notificationsEnabled || !freshIds.size || !("Notification" in window) || Notification.permission !== "granted") return;
    const newest = articles.find((article) => freshIds.has(article.id));
    if (!newest) return;
    const notification = new Notification(newest.kind === "earthquake" ? "Alerta sísmica detectada" : "Nueva señal en Pulso Global", {
      body: newest.title, icon: "/favicon.svg", tag: newest.id,
    });
    notification.onclick = () => { window.focus(); setFocusedArticleId(newest.id); setSelectedArticle(newest); notification.close(); };
  }, [articles, freshIds, notificationsEnabled]);

  async function toggleNotifications() {
    if (!("Notification" in window)) return;
    if (notificationsEnabled) {
      localStorage.removeItem("pulso-notifications");
      setNotificationsEnabled(false);
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      localStorage.setItem("pulso-notifications", "on");
      setNotificationsEnabled(true);
    }
  }

  return <main className="eye-console">
    <header className="eye-header">
      <button className="brand" onClick={clearLocation} aria-label="Volver al panorama mundial">
        <span className="brand-eye"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg></span>
        <span className="brand-text"><strong>OJO GLOBAL</strong><small>el mundo en tiempo real</small></span>
      </button>
      <form className="global-search" onSubmit={submitSearch} role="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <input ref={searchRef} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar tema, país o titular" aria-label="Buscar noticias" />
        {searchDraft && <button type="button" className="clear-search" onClick={() => { setSearchDraft(""); setQuery(""); setSelectedPlace(null); }} aria-label="Limpiar búsqueda">✕</button>}
        <kbd>Ctrl K</kbd>
      </form>
      <div className="header-actions">
        <span className={`sync-pill ${error ? "bad" : data?.partial ? "warn" : "ok"}`} aria-live="polite"><i />{statusLabel}</span>
        <button className={liveMode ? "live-toggle on" : "live-toggle"} onClick={() => setLiveMode((value) => !value)} aria-pressed={liveMode} title={liveMode ? "Pausar actualización automática" : "Reanudar actualización automática"}>
          {liveMode ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6" /></svg>EN VIVO</> : <>PAUSADO</>}
        </button>
        <button className="header-button" onClick={toggleBriefing} disabled={!visibleArticles.length} title="Escuchar los 5 principales titulares" aria-label="Escuchar los 5 principales titulares">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
        </button>
        <button className="header-button" onClick={() => void refresh()} disabled={loading} aria-label="Actualizar fuentes" title="Actualizar ahora">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "spin" : ""}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
        </button>
        <button className="mobile-filter-button" onClick={() => setMobileFiltersOpen((value) => !value)} aria-expanded={mobileFiltersOpen} aria-controls="eye-navigation" aria-label="Abrir filtros y temas">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        </button>
      </div>
    </header>

    {mobileFiltersOpen && <button className="rail-backdrop" aria-label="Cerrar filtros" onClick={() => setMobileFiltersOpen(false)} />}
    <aside id="eye-navigation" className={`eye-rail${mobileFiltersOpen ? " mobile-open" : ""}`} aria-label="Filtros y navegación">
      <div className="rail-block">
        <span className="rail-label">Vista</span>
        <div className="mode-switch">
          <button aria-pressed={mode === "news"} className={mode === "news" ? "active" : ""} onClick={() => selectMode("news")}>Noticias</button>
          <button aria-pressed={mode === "early"} className={mode === "early" ? "active" : ""} onClick={() => selectMode("early")}>Señales</button>
        </div>
        {mode === "early" && <p className="rail-hint">Sismos, alertas oficiales y prepublicaciones científicas.</p>}
      </div>
      <div className="rail-block">
        <span className="rail-label">Temas</span>
        {CATEGORIES.map((group) => <div className="rail-group" key={group.group}>
          <span className="rail-group-label">{group.group}</span>
          {group.items.map(([id, label]) => {
            const unavailable = mode === "early" && !EARLY_CATEGORIES.has(id);
            return <button key={id} disabled={unavailable} title={unavailable ? "Las señales tempranas cubren Panorama, Ciencia y Tecnología." : undefined} className={category === id ? "topic active" : "topic"} onClick={() => selectCategory(id)}>{label}</button>;
          })}
        </div>)}
      </div>
      <div className="rail-block">
        <span className="rail-label">Filtros</span>
        <label className="rail-field"><span>País</span>
          <select value={country} onChange={(event) => selectCountry(event.target.value)}>
            <option value="">Todo el mundo</option>
            {countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        <label className="rail-field"><span>Ventana</span>
          <select value={timespan} onChange={(event) => setTimespan(event.target.value as PulseTimespan)}>
            {WINDOWS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="rail-block">
        <span className="rail-label">Lugar exacto</span>
        <form className="place-search" onSubmit={searchPlace}>
          <input value={placeDraft} onChange={(event) => setPlaceDraft(event.target.value)} placeholder="Ciudad o pueblo" aria-label="Buscar ciudad o pueblo" />
          <button disabled={placeLoading} aria-label="Buscar lugar">{placeLoading ? <span className="spinner small" /> : "Ir"}</button>
        </form>
        {placeResults.length > 0 && <div className="place-results">
          {placeResults.map((place) => <button key={place.id} onClick={() => choosePlace(place)}>
            <strong>{place.name}</strong>
            <small>{place.displayName}</small>
          </button>)}
        </div>}
        {placeMessage && <p className="rail-hint">{placeMessage}</p>}
      </div>
      <button className={feedMode === "saved" ? "saved-toggle active" : "saved-toggle"} onClick={() => setFeedMode(feedMode === "saved" ? "latest" : "saved")}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" /></svg>
        Guardadas <b>{saved.length}</b>
      </button>
      <button className="rail-action" onClick={() => { setMobileFiltersOpen(false); setRankingsOpen(true); }}>Rankings de la muestra</button>
      <button className="rail-action" onClick={() => { setMobileFiltersOpen(false); setMethodOpen(true); }}>Misión y método</button>
      <button className="rail-action" onClick={() => void toggleNotifications()} aria-pressed={notificationsEnabled}>{notificationsEnabled ? "Avisos activados" : "Activar avisos en vivo"}</button>
      <a className="rail-action download-action" href="https://github.com/Louis-689/pulso-global-noticias/releases/latest/download/Pulso-Global-Windows.exe">Descargar para Windows</a>
      <InstallAppButton />
    </aside>

    <section className={`eye-workspace${mapExpanded ? " map-focus" : ""}`}>
      <div className={`eye-grid${mapExpanded ? " map-expanded" : ""}`}>
        <section className="map-panel" aria-label="Mapa mundial de noticias">
          <div className="map-overlay-top">
            <div className="map-title">
              <span className="map-kicker">OJO GLOBAL</span>
              <h1>{title}</h1>
              <p>{data ? `${data.points.length} países con menciones · ${data.stats.total} registros en muestra` : `Buscando ${categoryLabel(category).toLowerCase()} en fuentes públicas…`}</p>
            </div>
            <div className="map-tools">
              <div className="view-switch" role="group" aria-label="Vista del mapa">
                <button aria-pressed={mapMode === "realistic"} className={mapMode === "realistic" ? "active" : ""} onClick={() => setMapMode("realistic")}>Realista</button>
                <button aria-pressed={mapMode === "illustrated"} className={mapMode === "illustrated" ? "active" : ""} onClick={() => setMapMode("illustrated")}>Arte</button>
                <button aria-pressed={mapMode === "flat"} className={mapMode === "flat" ? "active" : ""} onClick={() => setMapMode("flat")}>2D</button>
              </div>
              <div className={`layer-dock${layerPanelOpen ? " open" : ""}`}>
                <button className="layer-master" onClick={() => setLayerPanelOpen((value) => !value)} aria-expanded={layerPanelOpen} aria-controls="eye-layers">Capas</button>
                {layerPanelOpen && <div id="eye-layers" className="layer-menu">
                  {mapMode === "realistic" && <button aria-pressed={showCountryAreas} onClick={() => setShowCountryAreas((value) => !value)}>Territorios</button>}
                  {mapMode === "realistic" && <button aria-pressed={showCountrySignals} onClick={() => setShowCountrySignals((value) => !value)}>Pulso por país</button>}
                  {mapMode === "realistic" && <button aria-pressed={showExactSignals} onClick={() => setShowExactSignals((value) => !value)}>Ubicación exacta</button>}
                  <button aria-pressed={showConnections} onClick={() => setShowConnections((value) => !value)}>Conexiones</button>
                </div>}
              </div>
              <button className="expand-button" onClick={() => setMapExpanded((value) => !value)} aria-label={mapExpanded ? "Salir de la vista amplia" : "Ampliar el mapa"} title={mapExpanded ? "Salir (Esc)" : "Ampliar mapa"}>
                {mapExpanded
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>}
              </button>
            </div>
          </div>
          <div className="globe-frame">
            {loading && !data
              ? <div className="map-loading"><span className="spinner" />Consultando fuentes públicas…</div>
              : mapMode === "realistic"
                ? <CesiumPulseGlobe points={data?.points ?? []} connections={data?.connections ?? []} articles={mapArticles} selectedCountry={country} selectedPlace={selectedPlace} focusedArticleId={focusedArticleId} onSelectCountry={selectCountry} onSelectArticle={openArticle} onSelectConnection={setSelectedConnection} showConnections={showConnections} showCountryAreas={showCountryAreas} showCountrySignals={showCountrySignals} showExactSignals={showExactSignals} resetKey={resetKey} />
                : <PulseGlobe points={data?.points ?? []} connections={data?.connections ?? []} articles={mapArticles} selectedCountry={country} selectedPlace={selectedPlace} focusedArticleId={focusedArticleId} onSelectCountry={selectCountry} onSelectArticle={openArticle} onSelectConnection={setSelectedConnection} showConnections={showConnections} flat={mapMode === "flat"} resetKey={resetKey} live={liveMode} />}
            {focusedArticle && <div className="map-focus-card" role="status">
              <button onClick={() => setSelectedArticle(focusedArticle)}>
                <small>ENFOQUE · {relativeTime(focusedArticle.publishedAt || focusedArticle.seenDate)}</small>
                <strong>{focusedArticle.title}</strong>
                <span>{sourceLabel(focusedArticle)}</span>
              </button>
              <button className="map-focus-close" onClick={() => setFocusedArticleId("")} aria-label="Cerrar noticia enfocada">✕</button>
            </div>}
            <div className="map-legend">
              {selectedPlace && <span><i className="dot selected" />lugar elegido</span>}
              <span><i className="dot exact" />coordenada publicada</span>
              <span><i className="dot country" />país mencionado</span>
            </div>
          </div>
          <div className="metric-strip">
            <div><strong>{unavailable ? "—" : data?.stats.total ?? "—"}</strong><span>registros</span></div>
            <div><strong>{unavailable ? "—" : data?.stats.located ?? "—"}</strong><span>geolocalizados</span></div>
            <div><strong>{unavailable ? "—" : data?.stats.unlocated ?? "—"}</strong><span>sin ubicar</span></div>
            <div><strong>{data?.tension == null ? "—" : `${data.tension}%`}</strong><span>tensión léxica</span></div>
            <button className="sources-link" onClick={() => setSourcesOpen(true)} title="Ver fuentes consultadas">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" /></svg>
              {okSources.length} fuentes
            </button>
          </div>
          {error && <div className="refresh-warning" role="alert"><span><strong>La actualización falló.</strong> {data?.articles.length ? "Conservamos la última muestra visible." : error}</span><button onClick={() => void refresh()} disabled={loading}>Reintentar</button></div>}
        </section>

        <aside className="news-panel" aria-label="Noticias de la consulta">
          <div className="news-heading">
            <h2>{mode === "early" ? "Señales verificables" : "Titulares en vivo"}</h2>
            <div className="news-tools">
              <span className={`result-count${loading && !data ? " loading" : ""}`}>{loading && !data ? "…" : unavailable ? "—" : visibleArticles.length}</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Ordenar noticias">
                <option value="newest">Más recientes</option>
                <option value="coverage">Mayor alcance</option>
                <option value="signal">Señal destacada</option>
              </select>
            </div>
          </div>
          <div className="feed-tabs" role="tablist" aria-label="Vista de titulares" onKeyDown={handleFeedTabs}>
            <button id="feed-tab-latest" data-feed-mode="latest" role="tab" aria-controls="pulse-feed" aria-selected={feedMode === "latest"} tabIndex={feedMode === "latest" ? 0 : -1} className={feedMode === "latest" ? "active" : ""} onClick={() => setFeedMode("latest")}>Recientes</button>
            <button id="feed-tab-media" data-feed-mode="media" role="tab" aria-controls="pulse-feed" aria-selected={feedMode === "media"} tabIndex={feedMode === "media" ? 0 : -1} className={feedMode === "media" ? "active" : ""} onClick={() => setFeedMode("media")}>Multimedia</button>
            <button id="feed-tab-located" data-feed-mode="located" role="tab" aria-controls="pulse-feed" aria-selected={feedMode === "located"} tabIndex={feedMode === "located" ? 0 : -1} className={feedMode === "located" ? "active" : ""} onClick={() => setFeedMode("located")}>En el mapa</button>
            <button id="feed-tab-saved" data-feed-mode="saved" role="tab" aria-controls="pulse-feed" aria-selected={feedMode === "saved"} tabIndex={feedMode === "saved" ? 0 : -1} className={feedMode === "saved" ? "active" : ""} onClick={() => setFeedMode("saved")}>Guardadas</button>
          </div>
          <div id="pulse-feed" className="feed" role="tabpanel" aria-labelledby={`feed-tab-${feedMode}`} aria-live="polite" aria-busy={loading}>
            {loading && !data && [1, 2, 3, 4].map((item) => <div className="story-skeleton" key={item} />)}
            {!loading && visibleArticles.length === 0 && <div className="empty-state">
              <strong>{feedMode === "saved" ? "Todavía no guardas noticias" : unavailable ? "Fuentes momentáneamente no disponibles" : "Sin resultados para esta combinación"}</strong>
              <p>{feedMode === "saved" ? "Usa el marcador de cualquier tarjeta para conservarla." : unavailable ? "Conservamos el estado de la interfaz. Pulsa Reintentar cuando vuelva la conexión." : "Amplía la ventana temporal, cambia el tema o borra el lugar."}</p>
            </div>}
            {leadArticle && <LeadStory key={leadArticle.id} article={leadArticle} fresh={freshIds.has(leadArticle.id)} saved={saved.includes(leadArticle.id)} onOpen={openArticle} onFocus={focusArticleOnMap} onSave={toggleSaved} />}
            <div className="story-list">
              {renderedArticles.map((article, index) => <StoryRow key={article.id} article={article} index={index + 2} fresh={freshIds.has(article.id)} saved={saved.includes(article.id)} onOpen={openArticle} onFocus={focusArticleOnMap} onSave={toggleSaved} />)}
            </div>
            {visibleCount < visibleArticles.length && <button className="load-more" onClick={() => setVisiblePage({ key: pageKey, count: visibleCount + 30 })}>Cargar 30 más <span>{visibleArticles.length - visibleCount} pendientes</span></button>}
          </div>
          <p className="coverage-note">{data?.coverageNote || "La cobertura depende de fuentes públicas disponibles."}</p>
        </aside>
      </div>
    </section>

    <Sheet open={!!selectedArticle} onOpenChange={(open) => !open && setSelectedArticle(null)}>
      <SheetContent className="story-sheet">
        {selectedArticle && <>
          <SheetHeader className="story-sheet-head">
            <div className="detail-badges">
              <span>{kindLabel(selectedArticle)}</span>
              <span>{selectedArticle.reviewStatus === "not-peer-reviewed" ? "Sin revisión por pares" : selectedArticle.reviewStatus === "preliminary" ? "Preliminar" : selectedArticle.reviewStatus === "reviewed" ? "Revisado" : "Estado no indicado"}</span>
            </div>
            <SheetTitle>{selectedArticle.title}</SheetTitle>
            <SheetDescription>{sourceLabel(selectedArticle)} · {relativeTime(selectedArticle.publishedAt || selectedArticle.seenDate)}</SheetDescription>
          </SheetHeader>
          <div className="story-detail">
            <StoryMedia key={selectedArticle.id} article={selectedArticle} featured expanded />
            <div className="detail-card"><span>Origen y hora</span><strong>{selectedArticle.provider}</strong><small>{selectedArticle.timestampBasis === "published" ? "Publicación" : selectedArticle.timestampBasis === "event" ? "Evento" : "Observación"}: {new Date(selectedArticle.seenDate).toLocaleString("es-ES")}</small></div>
            <div className="detail-card"><span>Nivel de evidencia</span><strong>{evidenceSummary(selectedArticle)[0]}</strong><small>{evidenceSummary(selectedArticle)[1]}</small></div>
            <section>
              <h3>Ubicación sustentada</h3>
              {selectedArticle.location && <p>{selectedArticle.location.label}: coordenadas publicadas por la fuente.</p>}
              {selectedArticle.mentionedCountries.length
                ? <ul>{selectedArticle.mentionedCountries.map((item) => <li key={item.code}><strong>{item.name}</strong><span>Evidencia: “{item.evidence}”</span></li>)}</ul>
                : <p>El titular no identifica un país de forma inequívoca; no se coloca en el mapa.</p>}
            </section>
            <div className="detail-actions">
              <button onClick={() => focusArticleOnMap(selectedArticle)} disabled={!selectedArticle.location && !selectedArticle.mentionedCountries.length}>Ver en el mapa</button>
              <button onClick={() => toggleSaved(selectedArticle)}>{saved.includes(selectedArticle.id) ? "Guardada" : "Guardar"}</button>
              <a href={selectedArticle.url} target="_blank" rel="noopener noreferrer">Abrir fuente original ↗</a>
            </div>
          </div>
        </>}
      </SheetContent>
    </Sheet>

    <Dialog open={!!selectedConnection} onOpenChange={(open) => !open && setSelectedConnection(null)}>
      <DialogContent className="evidence-dialog">
        <DialogHeader>
          <DialogTitle>Conexión documentada</DialogTitle>
          <DialogDescription>{selectedConnection?.label}. La línea existe porque los países aparecen en el mismo titular; no implica causalidad.</DialogDescription>
        </DialogHeader>
        <div className="evidence-list">
          {connectionArticles.map((article) => <button key={article.id} onClick={() => { setSelectedConnection(null); setSelectedArticle(article); }}>
            <span>{article.title}<small>{sourceLabel(article)}</small></span>
          </button>)}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={sourcesOpen} onOpenChange={setSourcesOpen}>
      <DialogContent className="sources-dialog">
        <DialogHeader>
          <DialogTitle>Fuentes consultadas</DialogTitle>
          <DialogDescription>Canales públicos usados para la vista actual. Un estado correcto significa que respondieron, no que cada afirmación esté verificada.</DialogDescription>
        </DialogHeader>
        <div className="sources-list">
          {data?.sources.map((source) => <article key={source.name}>
            <span className={`source-status ${source.status}`} />
            <div><strong>{source.name}</strong><p>{source.note || "Sin nota adicional."}</p></div>
            <span className="source-count">{source.count}</span>
            <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir sitio de ${source.name}`}>↗</a>
          </article>)}
          {!data?.sources.length && <p className="rail-hint">{loading ? "Consultando fuentes…" : "No hay fuentes disponibles en esta vista."}</p>}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={rankingsOpen} onOpenChange={setRankingsOpen}>
      <DialogContent className="rankings-dialog">
        <DialogHeader>
          <DialogTitle>Rankings de señales</DialogTitle>
          <DialogDescription>Top 10 exploratorio de la muestra recuperada. Cuenta vocabulario de impulso o presión; no mide verdad, importancia moral ni sentimiento humano.</DialogDescription>
        </DialogHeader>
        <div className="ranking-periods" role="group" aria-label="Periodo del ranking">
          {RANKING_WINDOWS.map(([id, label]) => <button key={id} aria-pressed={timespan === id} className={timespan === id ? "active" : ""} onClick={() => setTimespan(id)}>{label}</button>)}
        </div>
        <p className="ranking-sample">{loading ? "Actualizando periodo…" : `${data?.stats.total ?? 0} registros recuperados · ${data?.sources.filter((source) => source.status === "ok").length ?? 0} fuentes activas`}</p>
        <p className="ranking-sample">Mes y año aparecerán cuando exista un archivo histórico continuo. Pulso Global no presenta una portada reciente como si fuera historia completa.</p>
        <div className="rankings-grid">
          <section><h3>10 señales de impulso</h3>{data?.rankings.positive.length ? data.rankings.positive.map((article, index) => <button key={article.id} onClick={() => { setRankingsOpen(false); openArticle(article); }}><b>{index + 1}</b><span>{article.title}<small>{sourceLabel(article)}</small></span></button>) : <p>Sin coincidencias positivas en esta muestra.</p>}</section>
          <section><h3>10 señales de presión</h3>{data?.rankings.negative.length ? data.rankings.negative.map((article, index) => <button key={article.id} onClick={() => { setRankingsOpen(false); openArticle(article); }}><b>{index + 1}</b><span>{article.title}<small>{sourceLabel(article)}</small></span></button>) : <p>Sin coincidencias de presión en esta muestra.</p>}</section>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={methodOpen} onOpenChange={setMethodOpen}>
      <DialogContent className="method-dialog">
        <DialogHeader>
          <DialogTitle>Misión y método</DialogTitle>
          <DialogDescription>Pulso Global convierte fuentes públicas recientes en un atlas legible, trazable y honesto sobre sus límites.</DialogDescription>
        </DialogHeader>
        <div className="mission-seal"><strong>Misión</strong><p>Comprender el pulso humano, económico, científico y ambiental con origen, hora, geografía e incertidumbre visibles.</p></div>
        <div className="method-steps">
          <div><b>01</b><p><strong>Recoge</strong> titulares y señales públicas con hora rastreable.</p></div>
          <div><b>02</b><p><strong>Distingue</strong> noticias, registros oficiales y prepublicaciones.</p></div>
          <div><b>03</b><p><strong>Ubica</strong> solo coordenadas o lugares sustentados por la fuente.</p></div>
          <div><b>04</b><p><strong>Relaciona</strong> países co-mencionados sin afirmar causalidad.</p></div>
          <div><b>05</b><p><strong>Ordena</strong> la muestra sin inventar datos faltantes.</p></div>
          <div><b>06</b><p><strong>Expone límites</strong>: publicación no equivale a verificación.</p></div>
        </div>
        <p className="method-limit"><strong>Visión:</strong> avanzar hacia modelos históricos con backtesting e intervalos de confianza. La versión actual no presenta una muestra instantánea como predicción.</p>
      </DialogContent>
    </Dialog>
  </main>;
}

export default GlobalEye;
