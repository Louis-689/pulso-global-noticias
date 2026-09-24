"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { MeshPhongMaterial } from "three";
import { Compass, Minus, Plus } from "lucide-react";
import { countries, worldFeatures, worldFeaturePath, type WorldFeature } from "@/lib/pulse-geography";
import type { PulseArticle, PulseConnection, PulsePoint } from "@/lib/pulse-types";

export type PulseGlobeProps = {
  points: PulsePoint[];
  connections: PulseConnection[];
  articles: PulseArticle[];
  selectedCountry: string;
  onSelectCountry: (code: string) => void;
  onSelectArticle: (article: PulseArticle) => void;
  onSelectConnection: (connection: PulseConnection) => void;
  showConnections: boolean;
  flat: boolean;
  resetKey: number;
};

type MapPoint = { lat: number; lng: number; count: number; name: string; country?: PulsePoint; article?: PulseArticle };
type MapFeature = WorldFeature & { path: string };
const mapFeatures: MapFeature[] = worldFeatures.map((item) => ({ ...item, path: worldFeaturePath(item) }));
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const projected = (lat: number, lng: number) => ({ x: ((lng + 180) / 360) * 1000, y: ((90 - lat) / 180) * 500 });
const isValidLocation = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

class GlobeBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function PulseGlobe({ points, connections, articles, selectedCountry, onSelectCountry, onSelectArticle, onSelectConnection, showConnections, flat, resetKey }: PulseGlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 640, height: 480 });
  const [webglFailed, setWebglFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [flatZoomState, setFlatZoomState] = useState({ key: resetKey, value: 1 });
  const flatZoom = flatZoomState.key === resetKey ? flatZoomState.value : 1;
  const material = useMemo(() => new MeshPhongMaterial({ color: "#0b2840", emissive: "#031421", specular: "#1b475c", shininess: 14 }), []);
  const useFlat = flat || webglFailed;
  const counts = useMemo(() => new Map(points.map((point) => [point.id, point.count])), [points]);
  const mapPoints = useMemo<MapPoint[]>(() => [
    ...points.filter((point) => isValidLocation(point.lat, point.lng)).map((point) => ({ lat: point.lat, lng: point.lng, count: point.count, name: point.name, country: point })),
    ...articles.filter((article) => article.location && isValidLocation(article.location.lat, article.location.lng)).map((article) => ({ lat: article.location!.lat, lng: article.location!.lng, count: 1, name: article.location!.label, article })),
  ], [points, articles]);
  const country = countries.find((item) => item.code === selectedCountry);
  const focus = projected(country?.lat || 0, country?.lng || 0);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      setDimensions((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    if (!ready || useFlat) return;
    globeRef.current?.pointOfView(country ? { lat: country.lat, lng: country.lng, altitude: 1.45 } : { lat: 18, lng: -38, altitude: 2.05 }, reducedMotion ? 0 : 800);
  }, [country, ready, useFlat, reducedMotion, resetKey]);

  useEffect(() => {
    if (!ready || useFlat) return;
    const canvas = globeRef.current?.renderer().domElement;
    const lost = (event: Event) => { event.preventDefault(); setWebglFailed(true); };
    canvas?.addEventListener("webglcontextlost", lost);
    return () => canvas?.removeEventListener("webglcontextlost", lost);
  }, [ready, useFlat]);

  const onReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    controls.autoRotate = false;
    controls.enablePan = false;
    controls.minDistance = 125;
    controls.maxDistance = 480;
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    setReady(true);
  }, []);

  const selectPoint = (point: MapPoint) => point.article ? onSelectArticle(point.article) : point.country && onSelectCountry(point.country.id);
  const zoom = (direction: number) => {
    if (useFlat) setFlatZoomState((current) => ({ key: resetKey, value: Math.max(1, Math.min(4, (current.key === resetKey ? current.value : 1) + direction * 0.5)) }));
    else {
      const view = globeRef.current?.pointOfView();
      if (view) globeRef.current?.pointOfView({ ...view, altitude: Math.max(0.35, Math.min(3.6, view.altitude - direction * 0.4)) }, reducedMotion ? 0 : 300);
    }
  };
  const reset = () => {
    setFlatZoomState({ key: resetKey, value: 1 });
    globeRef.current?.pointOfView({ lat: 18, lng: -38, altitude: 2.05 }, reducedMotion ? 0 : 650);
  };
  const landColor = (item: WorldFeature) => item.properties.code === selectedCountry ? "#52c5b1" : item.properties.code === hovered ? "#438493" : counts.has(item.properties.code) ? "#2b6577" : "#243f52";

  return <div ref={hostRef} className="globe-host" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "radial-gradient(ellipse at 50% 38%, #132e43 0%, #0a1b2c 64%, #071522 100%)" }}>
    {useFlat ? <svg viewBox={`${Math.max(0, Math.min(1000 - 1000 / flatZoom, focus.x - 500 / flatZoom))} ${Math.max(0, Math.min(500 - 500 / flatZoom, focus.y - 250 / flatZoom))} ${1000 / flatZoom} ${500 / flatZoom}`} width="100%" height="100%" aria-label="Mapa mundial: selecciona un país para consultar su cobertura. También puedes usar el buscador de países." role="group" style={{ display: "block" }}>
      {[-60, -30, 0, 30, 60].map((latitude) => <path key={latitude} d={`M0,${projected(latitude, 0).y}H1000`} stroke="#b3cadc" opacity="0.08" fill="none" />)}
      {[-120, -60, 0, 60, 120].map((longitude) => <path key={longitude} d={`M${projected(0, longitude).x},0V500`} stroke="#b3cadc" opacity="0.08" fill="none" />)}
      {mapFeatures.map((item, index) => <path key={`${item.id}-${index}`} d={item.path} fill={landColor(item)} stroke="#7695a7" strokeWidth="0.5" vectorEffect="non-scaling-stroke" fillRule="evenodd" onClick={() => item.properties.code && onSelectCountry(item.properties.code)} onMouseEnter={() => setHovered(item.properties.code)} onMouseLeave={() => setHovered("")} style={{ cursor: item.properties.code ? "pointer" : "default" }}><title>{item.properties.spanishName}: {counts.get(item.properties.code) || 0} titulares en esta muestra</title></path>)}
      {showConnections && connections.map((connection) => {
        const start = projected(connection.startLat, connection.startLng);
        const end = projected(connection.endLat, connection.endLng);
        if (Math.abs(start.x - end.x) > 500) return null;
        return <path key={`${connection.sourceId}-${connection.targetId}`} d={`M${start.x},${start.y}Q${(start.x + end.x) / 2},${Math.min(start.y, end.y) - Math.min(90, Math.abs(start.x - end.x) / 3)} ${end.x},${end.y}`} fill="none" stroke="#eab777" strokeWidth="2.5" strokeOpacity="0.75" vectorEffect="non-scaling-stroke" onClick={() => onSelectConnection(connection)} style={{ cursor: "pointer" }}><title>{connection.label}. Abrir evidencia compartida</title></path>;
      })}
      {mapPoints.map((point) => {
        const position = projected(point.lat, point.lng);
        return <g key={point.article?.id || point.country!.id} role="button" tabIndex={0} aria-label={point.article ? `Ver evento: ${point.article.title}` : `Ver ${point.name}: ${point.count} titulares`} onClick={() => selectPoint(point)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPoint(point); } }} style={{ cursor: "pointer" }}>
          <circle cx={position.x} cy={position.y} r={Math.max(4, Math.min(9, 3 + Math.sqrt(point.count))) / Math.sqrt(flatZoom)} fill={point.article ? "#ffb96c" : "#7de8d2"} stroke="#0a2030" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <title>{point.article?.title || `${point.name}: ${point.count} titulares · ubicación aproximada del país`}</title>
        </g>;
      })}
    </svg> : <GlobeBoundary onFailure={() => setWebglFailed(true)}>
      <Globe ref={globeRef} width={dimensions.width} height={dimensions.height} backgroundColor="rgba(0,0,0,0)" globeMaterial={material} showAtmosphere atmosphereColor="#5f9ab6" atmosphereAltitude={0.13} showGraticules={false} onGlobeReady={onReady}
        polygonsData={worldFeatures} polygonAltitude={(item) => (item as WorldFeature).properties.code === selectedCountry ? 0.009 : 0.003} polygonCapColor={(item) => landColor(item as WorldFeature)} polygonSideColor={() => "#173145"} polygonStrokeColor={() => "#7391a5"} polygonsTransitionDuration={reducedMotion ? 0 : 180}
        polygonLabel={(item) => { const value = item as WorldFeature; return `<div style="padding:8px 10px;color:#f3f9fc;background:#102c3e;border-radius:8px;font:13px/1.5 system-ui"><strong>${escapeHtml(value.properties.spanishName)}</strong><br/>${counts.get(value.properties.code) || 0} titulares en esta muestra<br/><span style="color:#aac5d2">Clic para explorar el país</span></div>`; }}
        onPolygonHover={(item) => setHovered(item ? (item as WorldFeature).properties.code : "")} onPolygonClick={(item) => { const code = (item as WorldFeature).properties.code; if (code) onSelectCountry(code); }}
        pointsData={mapPoints} pointLat="lat" pointLng="lng" pointAltitude={0.018} pointColor={(item) => (item as MapPoint).article ? "#ffb96c" : "#82efd8"} pointRadius={(item) => Math.max(0.26, Math.min(0.8, 0.2 + Math.sqrt((item as MapPoint).count) * 0.11))} pointResolution={12} pointsTransitionDuration={reducedMotion ? 0 : 450}
        pointLabel={(item) => { const value = item as MapPoint; return `<div style="max-width:260px;padding:8px 10px;color:#f3f9fc;background:#102c3e;border-radius:8px;font:13px/1.5 system-ui">${escapeHtml(value.article?.title || `${value.name}: ${value.count} titulares`)}<br/><span style="color:#aac5d2">${value.article ? "Ubicación publicada por la fuente · clic para abrir" : "Centro aproximado del país · clic para explorar"}</span></div>`; }} onPointClick={(item) => selectPoint(item as MapPoint)}
        arcsData={showConnections ? connections : []} arcStartLat="startLat" arcStartLng="startLng" arcEndLat="endLat" arcEndLng="endLng" arcColor={() => ["#7de8d2bb", "#eab777bb"]} arcStroke={0.45} arcAltitudeAutoScale={0.35} arcDashLength={1} arcDashGap={0} arcsTransitionDuration={reducedMotion ? 0 : 400} arcLabel={(item) => escapeHtml(`${(item as PulseConnection).label} · Clic para ver los titulares compartidos`)} onArcClick={(item) => onSelectConnection(item as PulseConnection)}
      />
    </GlobeBoundary>}
    {webglFailed && <p role="status" style={{ position: "absolute", top: 12, left: 16, right: 16, margin: 0, color: "#d2e2eb", fontSize: 12 }}>Vista 2D activada: tu dispositivo no pudo iniciar el globo 3D. La cobertura sigue disponible.</p>}
    <div className="globe-controls" aria-label="Controles del mapa" style={{ position: "absolute", right: 18, bottom: 20, display: "flex", gap: 5 }}>
      <button type="button" onClick={() => zoom(1)} aria-label="Acercar mapa" title="Acercar"><Plus size={17} /></button>
      <button type="button" onClick={() => zoom(-1)} aria-label="Alejar mapa" title="Alejar"><Minus size={17} /></button>
      <button type="button" onClick={reset} aria-label="Centrar vista mundial" title="Centrar vista mundial"><Compass size={17} /></button>
    </div>
  </div>;
}
