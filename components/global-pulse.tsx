"use client";

import dynamic from "next/dynamic";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, Bookmark, BookmarkCheck, Bot, CheckCircle2, ChevronRight, Clock3, Compass, Database, ExternalLink, FlaskConical, Globe2, Info, Link2, Loader2, MapPin, Network, Newspaper, Pause, RefreshCw, Search, Sparkles, Volume2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { countries } from "@/lib/pulse-geography";
import type { PlaceResult, PlacesResponse } from "@/lib/pulse-places-types";
import type { PulseArticle, PulseCategory, PulseConnection, PulseMode, PulseResponse, PulseTimespan } from "@/lib/pulse-types";

const PulseGlobe = dynamic(() => import("@/components/pulse-globe"), { ssr: false, loading: () => <MapLoading label="Preparando la Tierra…" /> });

const CATEGORIES: Array<[PulseCategory, string]> = [
  ["all", "Panorama"], ["politics", "Política"], ["economy", "Economía"],
  ["technology", "Tecnología"], ["science", "Ciencia"], ["health", "Salud"],
  ["climate", "Clima"], ["security", "Seguridad"], ["culture", "Cultura"],
  ["sports", "Deportes"], ["education", "Educación"],
];
const WINDOWS: Array<[PulseTimespan, string]> = [["1h", "Última hora"], ["6h", "6 horas"], ["12h", "12 horas"], ["24h", "24 horas"], ["48h", "48 horas"], ["7d", "7 días"]];
type FeedMode = "latest" | "positive" | "negative" | "saved";
type WebMcpContext = { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> };

function MapLoading({ label }: { label: string }) { return <div className="map-loading"><Loader2 className="spin" aria-hidden="true" /><span>{label}</span></div>; }
function relativeTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "hora no publicada";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return "hace menos de 1 min";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} d`;
}
function sourceLabel(article: PulseArticle) { return article.sourceName || article.destinationHost || article.domain; }
function kindLabel(article: PulseArticle) {
  return article.kind === "earthquake" ? "Evento sísmico" : article.kind === "preprint" ? "Prepublicación" : article.kind === "official" ? "Fuente oficial" : "Noticia";
}
function emptyResponse(mode: PulseMode, timespan: PulseTimespan, category: PulseCategory, message: string): PulseResponse {
  return { mode, timespan, category, pointBasis: "mentionedCountries", dataProvider: "Sin resultados disponibles", fetchedAt: new Date().toISOString(), partial: true, sources: [], errors: [message], coverageNote: message, articles: [], points: [], connections: [], rankings: { positive: [], negative: [] }, tension: null, stats: { total: 0, located: 0, unlocated: 0, positive: 0, negative: 0, neutral: 0, scored: 0 } };
}

export function GlobalPulse() {
  const [category, setCategory] = useState<PulseCategory>("all");
  const [timespan, setTimespan] = useState<PulseTimespan>("24h");
  const [mode, setMode] = useState<PulseMode>("news");
  const [data, setData] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [placeDraft, setPlaceDraft] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeMessage, setPlaceMessage] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<PulseArticle | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<PulseConnection | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>("latest");
  const [saved, setSaved] = useState<string[]>([]);
  const [showConnections, setShowConnections] = useState(false);
  const [flatMap, setFlatMap] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const countryName = countries.find((item) => item.code === country)?.name;

  const fetchPulse = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++requestRef.current;
    setLoading(true); setError(""); setData(null);
    const params = new URLSearchParams({ category, timespan, mode });
    if (country) params.set("country", country);
    if (query) params.set("q", query);
    try {
      const response = await fetch(`/api/pulse?${params}`, { signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(String(response.status));
      const result = await response.json() as PulseResponse;
      if (requestRef.current === requestId) setData(result);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (requestRef.current !== requestId) return;
      const message = "No pudimos actualizar las fuentes. Vuelve a intentarlo.";
      setError(message); setData(emptyResponse(mode, timespan, category, message));
    } finally { if (requestRef.current === requestId) setLoading(false); }
  }, [category, timespan, mode, country, query]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void fetchPulse(controller.signal); });
    return () => controller.abort();
  }, [fetchPulse]);
  useEffect(() => { const timer = window.setInterval(() => { if (document.visibilityState === "visible") void fetchPulse(); }, 15 * 60 * 1000); return () => window.clearInterval(timer); }, [fetchPulse]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setSaved(JSON.parse(localStorage.getItem("pulso-global-saved") || "[]")); } catch { setSaved([]); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "configure_pulse_view", title: "Configurar Pulso Global",
      description: "Cambia la cobertura por categoría, ventana, modo, país o consulta.",
      inputSchema: { type: "object", additionalProperties: false, properties: {
        category: { type: "string", enum: CATEGORIES.map(([id]) => id) }, timespan: { type: "string", enum: WINDOWS.map(([id]) => id) },
        mode: { type: "string", enum: ["news", "early"] }, country: { type: "string", pattern: "^[A-Z]{2}$" }, query: { type: "string", maxLength: 100 },
      } }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        if (!input || typeof input !== "object") throw new Error("La entrada debe ser un objeto.");
        const value = input as Record<string, unknown>;
        if (typeof value.category === "string" && CATEGORIES.some(([id]) => id === value.category)) setCategory(value.category as PulseCategory);
        if (typeof value.timespan === "string" && WINDOWS.some(([id]) => id === value.timespan)) setTimespan(value.timespan as PulseTimespan);
        if (value.mode === "news" || value.mode === "early") setMode(value.mode);
        if (typeof value.country === "string" && /^[A-Z]{2}$/.test(value.country)) setCountry(value.country);
        if (typeof value.query === "string" && value.query.length <= 100) { setSearchDraft(value.query); setQuery(value.query.trim()); }
        return { accepted: true };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const articles = useMemo(() => data?.articles ?? [], [data?.articles]);
  const visibleArticles = useMemo(() => feedMode === "positive" ? data?.rankings.positive ?? [] : feedMode === "negative" ? data?.rankings.negative ?? [] : feedMode === "saved" ? articles.filter((item) => saved.includes(item.id)) : articles, [feedMode, data?.rankings, articles, saved]);
  const connectionArticles = useMemo(() => selectedConnection ? articles.filter((item) => selectedConnection.articleIds.includes(item.id)) : [], [selectedConnection, articles]);
  const scenarios = useMemo(() => {
    const stats = data?.stats; const scored = stats?.scored || 0; const total = stats?.total || 0;
    return [
      { icon: Activity, title: "Presión informativa", value: scored ? `${Math.round(((stats?.negative || 0) / scored) * 100)}%` : "Sin base", text: "Titulares clasificables con vocabulario adverso. No mide emociones de una población." },
      { icon: Globe2, title: "Alcance geográfico", value: total ? `${Math.round(((stats?.located || 0) / total) * 100)}%` : "Sin base", text: "Parte de la muestra con países mencionados de forma explícita." },
      { icon: FlaskConical, title: "Señales científicas", value: String(articles.filter((item) => item.kind === "preprint" || item.kind === "official").length), text: "Fuentes oficiales y prepublicaciones presentes en la consulta." },
    ];
  }, [data?.stats, articles]);

  function submitSearch(event: FormEvent) { event.preventDefault(); setQuery(searchDraft.trim().slice(0, 100)); }
  async function searchPlace(event: FormEvent) {
    event.preventDefault(); const term = placeDraft.trim();
    if (term.length < 2) { setPlaceMessage("Escribe al menos dos letras."); return; }
    setPlaceLoading(true); setPlaceMessage(""); setPlaceResults([]);
    const params = new URLSearchParams({ q: term }); if (country) params.set("country", country); if (selectedPlace?.region) params.set("parent", selectedPlace.region);
    try { const response = await fetch(`/api/places?${params}`); const result = await response.json() as PlacesResponse; setPlaceResults(result.results || []); setPlaceMessage(result.error || (result.results.length ? result.coverageNote : "No encontramos ese lugar. Prueba su nombre oficial.")); }
    catch { setPlaceMessage("La búsqueda geográfica no está disponible ahora."); } finally { setPlaceLoading(false); }
  }
  function choosePlace(place: PlaceResult) { setSelectedPlace(place); setCountry(place.countryCode); setPlaceDraft(place.name); setPlaceResults([]); setSearchDraft(place.name); setQuery(place.name); setMode("news"); }
  function clearLocation() { setSelectedPlace(null); setCountry(""); setPlaceDraft(""); setPlaceResults([]); setPlaceMessage(""); setQuery(""); setSearchDraft(""); setResetKey((value) => value + 1); }
  function selectCountry(code: string) { setSelectedPlace(null); setCountry(code); setQuery(""); setSearchDraft(""); setPlaceMessage(""); }
  function toggleSaved(article: PulseArticle) { setSaved((current) => { const next = current.includes(article.id) ? current.filter((id) => id !== article.id) : [...current, article.id].slice(-200); localStorage.setItem("pulso-global-saved", JSON.stringify(next)); return next; }); }
  function toggleBriefing() {
    if (!("speechSynthesis" in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    if (!visibleArticles.length) return;
    const utterance = new SpeechSynthesisUtterance(`Pulso Global. ${visibleArticles.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}`).join(". ")}`);
    utterance.lang = "es-PE"; utterance.rate = 1; utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); setSpeaking(true);
  }
  const title = selectedPlace?.displayName || countryName || (mode === "early" ? "Señales públicas tempranas" : "Panorama mundial");

  return <main className="world-console">
    <header className="app-header">
      <button className="brand" onClick={clearLocation} aria-label="Volver al panorama mundial"><span className="brand-orbit"><Globe2 /></span><span><strong>PULSO</strong> GLOBAL<small>observatorio geográfico</small></span></button>
      <form className="global-search" onSubmit={submitSearch} role="search"><Search /><input ref={searchRef} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar tema, país o titular" aria-label="Buscar noticias" />{searchDraft && <button type="button" className="clear-search" onClick={() => { setSearchDraft(""); setQuery(""); }} aria-label="Limpiar búsqueda"><X /></button>}<kbd>Ctrl K</kbd></form>
      <div className="header-actions"><button className="header-button" onClick={toggleBriefing} disabled={!visibleArticles.length}>{speaking ? <Pause /> : <Volume2 />}<span>{speaking ? "Detener" : "Briefing"}</span></button><button className="refresh-button" onClick={() => void fetchPulse()} disabled={loading} aria-label="Actualizar fuentes"><RefreshCw className={loading ? "spin" : ""} /></button></div>
    </header>

    <aside className="side-rail" aria-label="Navegación principal">
      <div className="rail-section"><span className="eyebrow">VISTA</span>
        <button className={mode === "news" ? "rail-action active" : "rail-action"} onClick={() => setMode("news")}><Newspaper /><span>Actualidad</span></button>
        <button className={mode === "early" ? "rail-action active amber" : "rail-action"} onClick={() => setMode("early")}><Sparkles /><span>Señales tempranas</span></button>
        <button className="rail-action" onClick={() => setScenarioOpen(true)}><Bot /><span>Escenarios</span></button>
        <button className={feedMode === "saved" ? "rail-action active" : "rail-action"} onClick={() => setFeedMode(feedMode === "saved" ? "latest" : "saved")}><Bookmark /><span>Guardadas <b>{saved.length}</b></span></button>
      </div>
      <div className="rail-section categories"><span className="eyebrow">TEMAS</span>{CATEGORIES.map(([id, label]) => <button key={id} className={category === id ? "topic active" : "topic"} onClick={() => setCategory(id)}>{label}<ChevronRight /></button>)}</div>
      <button className="method-link" onClick={() => setMethodOpen(true)}><Info />Cómo se calcula</button>
    </aside>

    <section className="workspace">
      <div className="workspace-heading"><div><div className="breadcrumb"><span>Mundo</span>{countryName && <><ChevronRight /><span>{countryName}</span></>}{selectedPlace && <><ChevronRight /><strong>{selectedPlace.name}</strong></>}</div><h1>{title}</h1><p>{mode === "early" ? "Eventos oficiales y publicaciones recientes; revisa su estado antes de interpretarlos." : "Titulares públicos situados solo cuando el lugar aparece explícitamente en la fuente."}</p></div><div className="sync-state" aria-live="polite"><span className={loading ? "sync-dot busy" : error || data?.partial ? "sync-dot warning" : "sync-dot"} /><div><strong>{loading ? "Actualizando" : error ? "Con incidencia" : data?.partial ? "Cobertura parcial" : "Consulta actualizada"}</strong><small>{data ? new Date(data.fetchedAt).toLocaleString("es-PE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "Conectando fuentes"}</small></div></div></div>
      <div className="filter-bar">
        <label><span>País</span><select value={country} onChange={(event) => selectCountry(event.target.value)}><option value="">Todo el mundo</option>{countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
        <label><span>Ventana</span><select value={timespan} onChange={(event) => setTimespan(event.target.value as PulseTimespan)}>{WINDOWS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <form className="place-search" onSubmit={searchPlace}><label htmlFor="place-query">Región, ciudad o pueblo</label><div><MapPin /><input id="place-query" value={placeDraft} onChange={(event) => setPlaceDraft(event.target.value)} placeholder={country ? `Buscar dentro de ${countryName}` : "Ej. Písac, Cusco"} /><button disabled={placeLoading}>{placeLoading ? <Loader2 className="spin" /> : "Ir"}</button></div></form>
        <div className="view-switch" aria-label="Vista del mapa"><button className={!flatMap ? "active" : ""} onClick={() => setFlatMap(false)}>3D</button><button className={flatMap ? "active" : ""} onClick={() => setFlatMap(true)}>2D</button></div>
      </div>
      {(placeResults.length > 0 || placeMessage) && <div className="place-results" aria-live="polite">{placeResults.map((place) => <button key={place.id} onClick={() => choosePlace(place)}><MapPin /><span><strong>{place.name}</strong><small>{place.displayName} · {place.type === "region" ? "región" : place.type === "city" ? "ciudad" : "localidad"}</small></span><ArrowRight /></button>)}{placeMessage && <p>{placeMessage} <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">Geografía: GeoNames/Open-Meteo</a></p>}</div>}

      <div className="content-grid">
        <section className="map-panel" aria-label="Mapa mundial de noticias">
          <div className="map-topline"><div><span className="map-kicker"><Compass /> OJO GLOBAL</span><strong>{data?.points.length ?? 0} países con menciones explícitas</strong></div><div className="map-toggles"><button className={showConnections ? "active" : ""} onClick={() => setShowConnections((value) => !value)}><Network />Conexiones <b>{data?.connections.length ?? 0}</b></button><button onClick={() => setResetKey((value) => value + 1)}><Compass />Centrar</button></div></div>
          <div className="globe-frame">{loading && !data ? <MapLoading label="Consultando fuentes públicas…" /> : <PulseGlobe points={data?.points ?? []} connections={data?.connections ?? []} articles={data?.articles ?? []} selectedCountry={country} onSelectCountry={selectCountry} onSelectArticle={setSelectedArticle} onSelectConnection={setSelectedConnection} showConnections={showConnections} flat={flatMap} resetKey={resetKey} />}<div className="map-legend"><span><i className="dot exact" /> coordenada publicada</span><span><i className="dot country" /> centro aproximado de país</span></div></div>
          <div className="metric-strip"><div><span>Muestra</span><strong>{data?.stats.total ?? 0}</strong><small>registros</small></div><div><span>Geolocalizados</span><strong>{data?.stats.located ?? 0}</strong><small>por mención</small></div><div><span>Sin ubicar</span><strong>{data?.stats.unlocated ?? 0}</strong><small>no se inventan</small></div><div><span>Tensión lexical</span><strong>{data?.tension == null ? "—" : `${data.tension}%`}</strong><small>{data?.tension == null ? "base insuficiente" : "muestra actual"}</small></div></div>
        </section>

        <aside className="news-panel" aria-label="Noticias de la consulta">
          <div className="news-heading"><div><span className="eyebrow">COBERTURA</span><h2>{mode === "early" ? "Señales verificables" : "Últimos titulares"}</h2></div><span className="result-count">{visibleArticles.length}</span></div>
          <div className="feed-tabs" role="tablist"><button role="tab" aria-selected={feedMode === "latest"} className={feedMode === "latest" ? "active" : ""} onClick={() => setFeedMode("latest")}>Recientes</button><button role="tab" aria-selected={feedMode === "positive"} className={feedMode === "positive" ? "active" : ""} onClick={() => setFeedMode("positive")}>Impulso</button><button role="tab" aria-selected={feedMode === "negative"} className={feedMode === "negative" ? "active" : ""} onClick={() => setFeedMode("negative")}>Presión</button></div>
          <div className="feed" aria-busy={loading}>{loading && !data && [1, 2, 3, 4].map((item) => <div className="story-skeleton" key={item} />)}{!loading && visibleArticles.length === 0 && <div className="empty-state"><Database /><strong>Sin resultados para esta combinación</strong><p>Amplía la ventana, cambia el tema o borra el lugar. No rellenamos huecos con datos inventados.</p></div>}{visibleArticles.map((article) => <article className="story" key={article.id}><button className="story-open" onClick={() => setSelectedArticle(article)}><div className="story-meta"><span>{kindLabel(article)}</span><time dateTime={article.publishedAt || article.seenDate}><Clock3 />{relativeTime(article.publishedAt || article.seenDate)}</time></div><h3>{article.title}</h3><div className="story-bottom"><span>{sourceLabel(article)}</span><span>{article.mentionedCountries.slice(0, 2).map((item) => item.name).join(" · ") || "sin lugar explícito"}</span><ChevronRight /></div></button><button className="save-story" onClick={() => toggleSaved(article)} aria-label={saved.includes(article.id) ? "Quitar de guardadas" : "Guardar noticia"}>{saved.includes(article.id) ? <BookmarkCheck /> : <Bookmark />}</button></article>)}</div>
          <div className="coverage-note"><Info /><span>{data?.coverageNote || "La cobertura depende de fuentes públicas disponibles."}</span></div>
        </aside>
      </div>
    </section>

    <Sheet open={!!selectedArticle} onOpenChange={(open) => !open && setSelectedArticle(null)}><SheetContent className="story-sheet">{selectedArticle && <><SheetHeader className="story-sheet-head"><div className="detail-badges"><span>{kindLabel(selectedArticle)}</span><span>{selectedArticle.reviewStatus === "not-peer-reviewed" ? "Sin revisión por pares" : selectedArticle.reviewStatus === "preliminary" ? "Preliminar" : selectedArticle.reviewStatus === "reviewed" ? "Revisado" : "Estado no indicado"}</span></div><SheetTitle>{selectedArticle.title}</SheetTitle><SheetDescription>{sourceLabel(selectedArticle)} · {relativeTime(selectedArticle.publishedAt || selectedArticle.seenDate)}</SheetDescription></SheetHeader><div className="story-detail"><div className="source-card"><Database /><div><span>Origen y hora</span><strong>{selectedArticle.provider}</strong><small>{selectedArticle.timestampBasis === "published" ? "Publicación" : selectedArticle.timestampBasis === "event" ? "Evento" : "Observación"}: {new Date(selectedArticle.seenDate).toLocaleString("es-PE")}</small></div></div><section><h3>Ubicación sustentada</h3>{selectedArticle.location && <p><MapPin />{selectedArticle.location.label}: coordenadas publicadas por la fuente.</p>}{selectedArticle.mentionedCountries.length ? <ul>{selectedArticle.mentionedCountries.map((item) => <li key={item.code}><strong>{item.name}</strong><span>Evidencia en el titular: “{item.evidence}”</span></li>)}</ul> : <p>El titular no identifica un país de forma inequívoca; no se coloca en el mapa.</p>}</section><section><h3>Lectura de tono</h3><p>{selectedArticle.positiveTerms.length || selectedArticle.negativeTerms.length ? `Coincidencias: ${[...selectedArticle.positiveTerms, ...selectedArticle.negativeTerms].join(", ")}.` : "No se detectaron términos del vocabulario exploratorio."} Esto describe palabras, no veracidad, intención ni sentimiento humano.</p></section><div className="detail-actions"><button onClick={() => toggleSaved(selectedArticle)}>{saved.includes(selectedArticle.id) ? <BookmarkCheck /> : <Bookmark />}{saved.includes(selectedArticle.id) ? "Guardada" : "Guardar"}</button><a href={selectedArticle.url} target="_self" rel="noopener noreferrer">Abrir fuente original <ExternalLink /></a></div></div></>}</SheetContent></Sheet>

    <Dialog open={!!selectedConnection} onOpenChange={(open) => !open && setSelectedConnection(null)}><DialogContent className="evidence-dialog"><DialogHeader><DialogTitle>Conexión documentada</DialogTitle><DialogDescription>{selectedConnection?.label}. La línea existe porque los países aparecen en el mismo titular; no implica causalidad.</DialogDescription></DialogHeader><div className="evidence-list">{connectionArticles.map((article) => <button key={article.id} onClick={() => { setSelectedConnection(null); setSelectedArticle(article); }}><Link2 /><span>{article.title}<small>{sourceLabel(article)}</small></span><ChevronRight /></button>)}</div></DialogContent></Dialog>
    <Dialog open={scenarioOpen} onOpenChange={setScenarioOpen}><DialogContent className="scenario-dialog"><DialogHeader><span className="modal-kicker"><Bot /> LABORATORIO DE ESCENARIOS</span><DialogTitle>Indicadores para formular hipótesis</DialogTitle><DialogDescription>Resumen de la muestra actual. No predice decisiones individuales, mercados, conflictos ni descubrimientos.</DialogDescription></DialogHeader><div className="scenario-grid">{scenarios.map((item) => <article key={item.title}><item.icon /><span>{item.title}</span><strong>{item.value}</strong><p>{item.text}</p></article>)}</div><div className="scenario-rule"><AlertTriangle /><p><strong>Uso responsable:</strong> una predicción real requiere series históricas, variables externas, evaluación contra datos futuros y márgenes de error. Este prototipo aún no cumple esas condiciones.</p></div></DialogContent></Dialog>
    <Dialog open={methodOpen} onOpenChange={setMethodOpen}><DialogContent className="method-dialog"><DialogHeader><span className="modal-kicker"><CheckCircle2 /> METODOLOGÍA</span><DialogTitle>Qué muestra Pulso Global</DialogTitle><DialogDescription>Un visor de cobertura pública con límites visibles.</DialogDescription></DialogHeader><div className="method-steps"><div><b>01</b><p><strong>Recoge</strong> titulares, documentos oficiales y señales públicas con hora verificable.</p></div><div><b>02</b><p><strong>Ubica</strong> países nombrados explícitamente o coordenadas entregadas por la fuente.</p></div><div><b>03</b><p><strong>Relaciona</strong> países co-mencionados en el mismo titular y conserva evidencia.</p></div><div><b>04</b><p><strong>Expone límites</strong>: una ausencia significa “sin dato en esta muestra”, no “no ocurrió”.</p></div></div></DialogContent></Dialog>
  </main>;
}
