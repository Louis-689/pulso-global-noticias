"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronRight, Clock3, GitBranch, Globe2, Info, LocateFixed, Radio, Search, ShieldCheck, TrendingDown, TrendingUp, Volume2, VolumeX } from "lucide-react";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import { Slider } from "@/components/ui/slider";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

type PulsePoint = { id: string; lat: number; lng: number; name: string; count: number };
type PulseArticle = { url: string; title: string; domain: string; sourceCountry: string; language: string; seenDate: string; sentiment: number };
type PulseConnection = { startLat: number; startLng: number; endLat: number; endLng: number; label: string; weight: number };
type WebMcpContext = { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> };
type PulseResponse = {
  points: PulsePoint[];
  articles: PulseArticle[];
  connections: PulseConnection[];
  rankings: { positive: PulseArticle[]; negative: PulseArticle[] };
  tension: number;
  pointBasis: "mentionedLocations" | "sourceCountries" | "mentionedCountries";
  dataProvider?: string;
  fetchedAt: string;
  partial?: boolean;
};

const categories = [
  ["all", "Panorama"], ["politics", "Política"], ["economy", "Economía"],
  ["technology", "Tecnología"], ["science", "Ciencia"], ["health", "Salud"],
  ["climate", "Clima"], ["security", "Seguridad"], ["culture", "Cultura"],
] as const;

const timeWindows = [
  ["1h", "1 h"], ["6h", "6 h"], ["12h", "12 h"], ["24h", "24 h"], ["48h", "48 h"], ["7d", "7 días"],
] as const;

const countries = feature(
  worldAtlas as unknown as Parameters<typeof feature>[0],
  (worldAtlas as unknown as { objects: { countries: Parameters<typeof feature>[1] } }).objects.countries,
) as unknown as { features: object[] };

function relativeTime(value: string) {
  if (!value) return "reciente";
  const normalized = /^\d{14}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}Z`
    : value;
  const time = new Date(normalized).getTime();
  if (!Number.isFinite(time)) return "reciente";
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} d`;
}

export function GlobalPulse() {
  const [category, setCategory] = useState("all");
  const [data, setData] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedPoint, setSelectedPoint] = useState<PulsePoint | null>(null);
  const [timeIndex, setTimeIndex] = useState(3);
  const [showConnections, setShowConnections] = useState(true);
  const [rankMode, setRankMode] = useState<"positive" | "negative">("positive");
  const [speaking, setSpeaking] = useState(false);
  const globeRef = useRef<{ pointOfView: (position: { lat: number; lng: number; altitude: number }, ms?: number) => void } | null>(null);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "configure_pulse_view",
      title: "Configurar radar de noticias",
      description: "Cambia la categoría y la ventana temporal visibles en Pulso Global.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", enum: categories.map(([id]) => id) },
          timeWindow: { type: "string", enum: timeWindows.map(([id]) => id) },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input: unknown) {
        if (!input || typeof input !== "object") throw new Error("La entrada debe ser un objeto.");
        const candidate = input as { category?: string; timeWindow?: string };
        const categoryIndex = candidate.category ? categories.findIndex(([id]) => id === candidate.category) : -1;
        const windowIndex = candidate.timeWindow ? timeWindows.findIndex(([id]) => id === candidate.timeWindow) : -1;
        if (candidate.category && categoryIndex < 0) throw new Error("Categoría no válida.");
        if (candidate.timeWindow && windowIndex < 0) throw new Error("Ventana temporal no válida.");
        if (categoryIndex >= 0) setCategory(categories[categoryIndex][0]);
        if (windowIndex >= 0) setTimeIndex(windowIndex);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { category: categoryIndex >= 0 ? categories[categoryIndex][0] : undefined, timeWindow: windowIndex >= 0 ? timeWindows[windowIndex][0] : undefined };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/pulse?category=${category}&timespan=${timeWindows[timeIndex][0]}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo consultar GDELT");
        return response.json() as Promise<PulseResponse>;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setData({ points: [], articles: [], connections: [], rankings: { positive: [], negative: [] }, tension: 50, pointBasis: "sourceCountries", dataProvider: "Fuentes temporalmente no disponibles", fetchedAt: new Date().toISOString(), partial: true });
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [category, timeIndex]);

  const articles = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    if (!term) return data?.articles ?? [];
    return (data?.articles ?? []).filter((item) => `${item.title} ${item.domain} ${item.sourceCountry}`.toLocaleLowerCase("es").includes(term));
  }, [data?.articles, query]);
  const maxCount = Math.max(1, ...(data?.points ?? []).map((point) => point.count));

  function focusPoint(point: object) {
    const pulsePoint = point as PulsePoint;
    setSelectedPoint(pulsePoint);
    globeRef.current?.pointOfView({ lat: pulsePoint.lat, lng: pulsePoint.lng, altitude: 1.35 }, 900);
  }

  function toggleBriefing() {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const headlines = (data?.articles ?? []).slice(0, 5).map((article, index) => `${index + 1}. ${article.title}`).join(". ");
    if (!headlines) return;
    const briefing = new SpeechSynthesisUtterance(`Pulso Global. Estos son los titulares más recientes. ${headlines}`);
    briefing.lang = "es-ES";
    briefing.rate = 1.02;
    briefing.onend = () => setSpeaking(false);
    briefing.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(briefing);
    setSpeaking(true);
  }

  return (
    <main className="pulse-shell">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark"><Globe2 aria-hidden="true" /></span><div><h1>PULSO<span>GLOBAL</span></h1><p>observatorio de noticias</p></div></div>
        <label className="search-field"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar país, medio o titular" aria-label="Buscar noticias" /><kbd>⌘ K</kbd></label>
        <div className="live-cluster"><div className="live-copy"><span className={loading ? "status-dot loading" : "status-dot"} /><div><strong>{loading ? "SINCRONIZANDO" : "EN VIVO"}</strong><small>GDELT · ventana {timeWindows[timeIndex][1]}</small></div></div><button className={speaking ? "briefing-button active" : "briefing-button"} onClick={toggleBriefing} aria-label={speaking ? "Detener briefing" : "Escuchar briefing"}>{speaking ? <VolumeX /> : <Volume2 />}<span>{speaking ? "Detener" : "Briefing"}</span></button><button className="icon-button" aria-label="Centrar globo" onClick={() => globeRef.current?.pointOfView({ lat: 12, lng: -18, altitude: 2.25 }, 900)}><LocateFixed /></button></div>
      </header>

      <aside className="category-rail" aria-label="Categorías">
        <p className="rail-label">SEÑALES</p>
        <nav>{categories.map(([id, label]) => <button key={id} className={category === id ? "category-button active" : "category-button"} onClick={() => setCategory(id)} aria-pressed={category === id}><span className="envelope-icon" aria-hidden="true"><i /></span><span>{label}</span></button>)}</nav>
        <div className="trust-badge"><ShieldCheck /><span>FUENTES<br />TRAZABLES</span></div>
      </aside>

      <section className="globe-stage" aria-label="Mapa mundial de señales noticiosas">
        <div className="map-caption"><span><Radio /> RADAR GLOBAL</span><strong>{(data?.points.length ?? 0).toLocaleString("es-ES")} {data?.pointBasis === "mentionedLocations" ? "lugares mencionados" : data?.pointBasis === "mentionedCountries" ? "países mencionados" : "mercados de origen"}</strong></div>
        <div className="globe-wrap"><Globe ref={globeRef} backgroundColor="rgba(0,0,0,0)" globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg" bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png" showAtmosphere atmosphereColor="#4ddfd1" atmosphereAltitude={0.16} polygonsData={countries.features} polygonCapColor={() => "rgba(5, 20, 29, 0.10)"} polygonSideColor={() => "rgba(21, 232, 203, 0.015)"} polygonStrokeColor={() => "rgba(92, 226, 210, 0.26)"} pointsData={data?.points ?? []} pointLat="lat" pointLng="lng" pointColor={() => "#ffb547"} pointAltitude={(point) => 0.045 + ((point as PulsePoint).count / maxCount) * 0.16} pointRadius={(point) => 0.12 + Math.sqrt((point as PulsePoint).count / maxCount) * 0.34} pointLabel={(point) => `${(point as PulsePoint).name} · ${(point as PulsePoint).count} artículos`} onPointClick={focusPoint} ringsData={data?.points.slice(0, 16) ?? []} ringLat="lat" ringLng="lng" ringColor={() => (t: number) => `rgba(255, 181, 71, ${Math.max(0, 1 - t)})`} ringMaxRadius={2.1} ringPropagationSpeed={1.1} ringRepeatPeriod={1550} arcsData={showConnections ? (data?.connections ?? []) : []} arcStartLat="startLat" arcStartLng="startLng" arcEndLat="endLat" arcEndLng="endLng" arcLabel="label" arcColor={() => ["rgba(88,227,210,.18)", "rgba(255,181,71,.78)"]} arcAltitude={(arc) => .12 + Math.min(.3, (arc as PulseConnection).weight * .035)} arcStroke={(arc) => .25 + Math.min(.55, (arc as PulseConnection).weight * .08)} arcDashLength={.45} arcDashGap={.9} arcDashAnimateTime={2200} /></div>
        <div className="globe-toolbar"><button className={showConnections ? "active" : ""} onClick={() => setShowConnections((value) => !value)}><GitBranch />Conexiones <b>{data?.connections?.length ?? 0}</b></button></div>
        <div className="tension-card" style={{ "--tension": `${data?.tension ?? 50}%` } as React.CSSProperties}><div className="tension-head"><span>ÍNDICE DE TENSIÓN</span><strong>{data?.tension ?? 50}</strong></div><div className="tension-track"><i /></div><p>Tono lexical en la muestra visible</p></div>
        <div className="ranking-card">
          <div className="ranking-tabs"><button className={rankMode === "positive" ? "active" : ""} onClick={() => setRankMode("positive")}><TrendingUp />Top</button><button className={rankMode === "negative" ? "active negative" : ""} onClick={() => setRankMode("negative")}><TrendingDown />Flop</button></div>
          <ol>{(data?.rankings?.[rankMode] ?? []).slice(0, 3).map((item, index) => <li key={`${rankMode}-${item.url}`}><b>0{index + 1}</b><span>{item.title}</span></li>)}</ol>
          {(data?.rankings?.[rankMode]?.length ?? 0) === 0 && <p className="no-ranking">Sin suficientes señales clasificables.</p>}
          <details className="method-details"><summary><Info /> metodología</summary><p>Ordena titulares reales de esta muestra por términos de tono visibles. Es una señal exploratoria, no una verificación editorial.</p></details>
        </div>
        <div className="map-legend" aria-label="Leyenda del mapa"><span><i className="signal warm" /> volumen alto</span><span><i className="signal cool" /> límites nacionales</span><span><i className="signal dim" /> clic para acercar</span></div>
        {selectedPoint && <div className="place-card"><button onClick={() => setSelectedPoint(null)} aria-label="Cerrar detalle">×</button><span>{data?.pointBasis === "sourceCountries" ? "ORIGEN EDITORIAL" : "LUGAR MENCIONADO"}</span><h2>{selectedPoint.name}</h2><p>{selectedPoint.count} artículos en la cobertura consultada. Este punto indica {data?.pointBasis === "sourceCountries" ? "el país del medio, no necesariamente el lugar del hecho" : "un país identificado explícitamente en el titular"}.</p></div>}
        <div className="timeline-dock"><div className="timeline-copy"><Clock3 /><span>VIAJE TEMPORAL</span><strong>{timeWindows[timeIndex][1]}</strong></div><Slider min={0} max={timeWindows.length - 1} step={1} value={[timeIndex]} onValueChange={(value) => setTimeIndex(value[0])} aria-label="Ventana temporal" /><div className="timeline-labels"><span>1 h</span><span>ahora</span><span>7 días</span></div></div>
      </section>

      <aside className="signal-panel">
        <div className="panel-heading"><div><span>ÚLTIMAS SEÑALES</span><h2>Ahora en el mundo</h2></div><Activity aria-hidden="true" /></div>
        <div className="feed-list" aria-live="polite">
          {loading && Array.from({ length: 5 }).map((_, index) => <div className="story-skeleton" key={index} />)}
          {!loading && articles.slice(0, 12).map((article, index) => <a className="story-card" href={article.url} target="_blank" rel="noreferrer" key={`${article.url}-${index}`}><div className="story-meta"><span>{article.sourceCountry || article.language || "GLOBAL"}</span><time><Clock3 /> {relativeTime(article.seenDate)}</time></div><h3>{article.title}</h3><div className="story-source"><span>{article.domain}</span><ChevronRight /></div></a>)}
          {!loading && articles.length === 0 && <div className="empty-feed"><Radio /><strong>Sin señales para este filtro</strong><span>Prueba otra categoría o limpia la búsqueda.</span></div>}
        </div>
        <footer className="source-note"><span>Datos: {data?.dataProvider ?? "conectando…"}</span><span>{data?.partial ? "cobertura parcial" : "actualización continua"}</span></footer>
      </aside>
    </main>
  );
}
