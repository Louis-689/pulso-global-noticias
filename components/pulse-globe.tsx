"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
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
  live: boolean;
  selectedPlace: { lat: number; lng: number; name: string } | null;
};

type MapPoint = { lat: number; lng: number; count: number; name: string; country?: PulsePoint; article?: PulseArticle; selectedPlace?: boolean };
type MapFeature = WorldFeature & { path: string };
const mapFeatures: MapFeature[] = worldFeatures.map((item) => ({ ...item, path: worldFeaturePath(item) }));
const ATLAS_PALETTE = ["#91a67f", "#c68a62", "#d2aa64", "#6f9e98", "#879b72", "#b97961", "#8ba6a0", "#b59b68"];
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const projected = (lat: number, lng: number) => ({ x: ((lng + 180) / 360) * 1000, y: ((90 - lat) / 180) * 500 });
const isValidLocation = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const atlasColor = (code: string) => ATLAS_PALETTE[[...code].reduce((total, character) => total + character.charCodeAt(0), 0) % ATLAS_PALETTE.length];

class GlobeBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function PulseGlobe({ points, connections, articles, selectedCountry, onSelectCountry, onSelectArticle, onSelectConnection, showConnections, flat, resetKey, live, selectedPlace }: PulseGlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 640, height: 480 });
  const [webglFailed, setWebglFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [flatZoomState, setFlatZoomState] = useState({ key: "", value: 1 });
  const flatFocusKey = `${resetKey}:${selectedPlace?.lat ?? ""}:${selectedPlace?.lng ?? ""}:${selectedCountry}`;
  const defaultFlatZoom = selectedPlace ? 3.4 : selectedCountry ? 1.9 : 1;
  const flatZoom = flatZoomState.key === flatFocusKey ? flatZoomState.value : defaultFlatZoom;
  const material = useMemo(() => new MeshPhongMaterial({ color: "#397f8a", emissive: "#102f38", specular: "#f4d69a", shininess: 18 }), []);
  const useFlat = flat || webglFailed;
  const counts = useMemo(() => new Map(points.map((point) => [point.id, point.count])), [points]);
  const mapPoints = useMemo<MapPoint[]>(() => [
    ...(selectedPlace && isValidLocation(selectedPlace.lat, selectedPlace.lng) ? [{ lat: selectedPlace.lat, lng: selectedPlace.lng, count: 1, name: selectedPlace.name, selectedPlace: true }] : []),
    ...points.filter((point) => isValidLocation(point.lat, point.lng)).map((point) => ({ lat: point.lat, lng: point.lng, count: point.count, name: point.name, country: point })),
    ...articles.filter((article) => article.location && isValidLocation(article.location.lat, article.location.lng)).map((article) => ({ lat: article.location!.lat, lng: article.location!.lng, count: 1, name: article.location!.label, article })),
  ], [points, articles, selectedPlace]);
  const country = countries.find((item) => item.code === selectedCountry);
  const focusLat = selectedPlace?.lat ?? country?.lat ?? 0;
  const focusLng = selectedPlace?.lng ?? country?.lng ?? 0;
  const focus = projected(focusLat, focusLng);

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
    globeRef.current?.pointOfView(selectedPlace ? { lat: selectedPlace.lat, lng: selectedPlace.lng, altitude: 0.28 } : country ? { lat: country.lat, lng: country.lng, altitude: 0.58 } : { lat: 18, lng: -38, altitude: 0.95 }, reducedMotion ? 0 : 800);
  }, [country, ready, useFlat, reducedMotion, resetKey, selectedPlace]);

  useEffect(() => {
    if (!ready || useFlat) return;
    const canvas = globeRef.current?.renderer().domElement;
    const lost = (event: Event) => { event.preventDefault(); setWebglFailed(true); };
    canvas?.addEventListener("webglcontextlost", lost);
    return () => canvas?.removeEventListener("webglcontextlost", lost);
  }, [ready, useFlat]);

  useEffect(() => {
    if (!ready || useFlat) return;
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = live && !reducedMotion && !selectedCountry;
    controls.autoRotateSpeed = 0.28;
  }, [live, ready, reducedMotion, selectedCountry, useFlat]);

  const onReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    controls.autoRotate = live && !reducedMotion && !selectedCountry;
    controls.autoRotateSpeed = 0.28;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.62;
    controls.zoomSpeed = 0.82;
    controls.minDistance = 105;
    controls.maxDistance = 520;
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    setReady(true);
  }, [live, reducedMotion, selectedCountry]);

  const selectPoint = (point: MapPoint) => point.article ? onSelectArticle(point.article) : point.country && onSelectCountry(point.country.id);
  const zoom = (direction: number) => {
    if (useFlat) setFlatZoomState((current) => ({ key: flatFocusKey, value: Math.max(1, Math.min(4, (current.key === flatFocusKey ? current.value : defaultFlatZoom) + direction * 0.5)) }));
    else {
      const view = globeRef.current?.pointOfView();
      if (view) globeRef.current?.pointOfView({ ...view, altitude: Math.max(0.2, Math.min(3.8, view.altitude - direction * 0.34)) }, reducedMotion ? 0 : 300);
    }
  };
  const reset = () => {
    setFlatZoomState({ key: flatFocusKey, value: 1 });
    globeRef.current?.pointOfView({ lat: 18, lng: -38, altitude: 0.95 }, reducedMotion ? 0 : 650);
  };
  const moveCamera = (latDelta: number, lngDelta: number) => {
    if (useFlat) return;
    const view = globeRef.current?.pointOfView();
    if (!view) return;
    globeRef.current?.pointOfView({ ...view, lat: Math.max(-88, Math.min(88, view.lat + latDelta)), lng: ((view.lng + lngDelta + 540) % 360) - 180 }, reducedMotion ? 0 : 260);
  };
  const handleMapKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1); }
    else if (event.key === "-" || event.key === "_") { event.preventDefault(); zoom(-1); }
    else if (event.key === "Home" || event.key === "0") { event.preventDefault(); reset(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveCamera(10, 0); }
    else if (event.key === "ArrowDown") { event.preventDefault(); moveCamera(-10, 0); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); moveCamera(0, -12); }
    else if (event.key === "ArrowRight") { event.preventDefault(); moveCamera(0, 12); }
  };
  const landColor = (item: WorldFeature) => item.properties.code === selectedCountry ? "#df6844" : item.properties.code === hovered ? "#e8bf6f" : counts.has(item.properties.code) ? "#2d827d" : atlasColor(item.properties.code || String(item.id || "world"));

  return <div ref={hostRef} className="globe-host" role="region" tabIndex={0} aria-label="Planeta interactivo de noticias" aria-describedby="globe-navigation-help" onKeyDown={handleMapKeyboard}>
    {useFlat ? <svg viewBox={`${Math.max(0, Math.min(1000 - 1000 / flatZoom, focus.x - 500 / flatZoom))} ${Math.max(0, Math.min(500 - 500 / flatZoom, focus.y - 250 / flatZoom))} ${1000 / flatZoom} ${500 / flatZoom}`} width="100%" height="100%" aria-label="Mapa mundial: selecciona un país para consultar su cobertura. También puedes usar el buscador de países." role="group" style={{ display: "block" }}>
      {[-60, -30, 0, 30, 60].map((latitude) => <path key={latitude} d={`M0,${projected(latitude, 0).y}H1000`} stroke="#e9d7a8" opacity="0.18" fill="none" />)}
      {[-120, -60, 0, 60, 120].map((longitude) => <path key={longitude} d={`M${projected(0, longitude).x},0V500`} stroke="#e9d7a8" opacity="0.18" fill="none" />)}
      {mapFeatures.map((item, index) => <path key={`${item.id}-${index}`} d={item.path} fill={landColor(item)} stroke="#5d5135" strokeWidth="0.65" vectorEffect="non-scaling-stroke" fillRule="evenodd" role={item.properties.code ? "button" : undefined} tabIndex={item.properties.code ? 0 : undefined} aria-label={item.properties.code ? `Explorar ${item.properties.spanishName}: ${counts.get(item.properties.code) || 0} titulares` : undefined} onClick={() => item.properties.code && onSelectCountry(item.properties.code)} onKeyDown={(event) => { if (item.properties.code && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectCountry(item.properties.code); } }} onMouseEnter={() => setHovered(item.properties.code)} onMouseLeave={() => setHovered("")} style={{ cursor: item.properties.code ? "pointer" : "default", transition: "fill .2s ease" }}><title>{item.properties.spanishName}: {counts.get(item.properties.code) || 0} titulares en esta muestra</title></path>)}
      {showConnections && connections.map((connection) => {
        const start = projected(connection.startLat, connection.startLng);
        const end = projected(connection.endLat, connection.endLng);
        if (Math.abs(start.x - end.x) > 500) return null;
        return <path key={`${connection.sourceId}-${connection.targetId}`} d={`M${start.x},${start.y}Q${(start.x + end.x) / 2},${Math.min(start.y, end.y) - Math.min(90, Math.abs(start.x - end.x) / 3)} ${end.x},${end.y}`} fill="none" stroke="#eab777" strokeWidth="2.5" strokeOpacity="0.75" vectorEffect="non-scaling-stroke" role="button" tabIndex={0} aria-label={`${connection.label}. Abrir evidencia compartida`} onClick={() => onSelectConnection(connection)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectConnection(connection); } }} style={{ cursor: "pointer" }}><title>{connection.label}. Abrir evidencia compartida</title></path>;
      })}
      {mapPoints.map((point) => {
        const position = projected(point.lat, point.lng);
        const interactive = !!(point.article || point.country);
        return <g key={point.selectedPlace ? `selected-${point.name}` : point.article?.id || point.country!.id} {...(interactive ? { role: "button", tabIndex: 0, onClick: () => selectPoint(point), onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPoint(point); } } } : {})} aria-label={point.selectedPlace ? `Lugar seleccionado: ${point.name}` : point.article ? `Ver evento: ${point.article.title}` : `Ver ${point.name}: ${point.count} titulares`} style={{ cursor: interactive ? "pointer" : "default" }}>
          <circle cx={position.x} cy={position.y} r={(point.selectedPlace ? 9 : Math.max(4, Math.min(9, 3 + Math.sqrt(point.count)))) / Math.sqrt(flatZoom)} fill={point.selectedPlace ? "#f4c05f" : point.article ? "#ee8b5b" : "#9edbd0"} stroke={point.selectedPlace ? "#fff1bd" : "#173734"} strokeWidth={point.selectedPlace ? "2.5" : "1.5"} vectorEffect="non-scaling-stroke" />
          <title>{point.selectedPlace ? `${point.name} · lugar seleccionado` : point.article?.title || `${point.name}: ${point.count} titulares · ubicación aproximada del país`}</title>
        </g>;
      })}
    </svg> : <GlobeBoundary onFailure={() => setWebglFailed(true)}>
      <Globe ref={globeRef} width={dimensions.width} height={dimensions.height} backgroundColor="rgba(0,0,0,0)" globeMaterial={material} showAtmosphere atmosphereColor="#b8e4df" atmosphereAltitude={0.14} showGraticules onGlobeReady={onReady}
        polygonsData={worldFeatures} polygonAltitude={(item) => (item as WorldFeature).properties.code === selectedCountry ? 0.011 : 0.003} polygonCapColor={(item) => landColor(item as WorldFeature)} polygonSideColor={() => "#5d6b4d"} polygonStrokeColor={() => "#ead9a8"} polygonsTransitionDuration={reducedMotion ? 0 : 180}
        polygonLabel={(item) => { const value = item as WorldFeature; return `<div style="padding:9px 11px;color:#f7efd9;background:#173734;border:1px solid #b5965f;border-radius:4px;font:13px/1.5 Georgia,serif"><strong>${escapeHtml(value.properties.spanishName)}</strong><br/>${counts.get(value.properties.code) || 0} titulares en esta muestra<br/><span style="color:#bcd8d1">Clic para explorar el país</span></div>`; }}
        onPolygonHover={(item) => setHovered(item ? (item as WorldFeature).properties.code : "")} onPolygonClick={(item) => { const code = (item as WorldFeature).properties.code; if (code) onSelectCountry(code); }}
        pointsData={mapPoints} pointLat="lat" pointLng="lng" pointAltitude={(item) => (item as MapPoint).selectedPlace ? 0.035 : 0.018} pointColor={(item) => (item as MapPoint).selectedPlace ? "#f4c05f" : (item as MapPoint).article ? "#ee8b5b" : "#a8e0d5"} pointRadius={(item) => (item as MapPoint).selectedPlace ? 0.72 : Math.max(0.26, Math.min(0.8, 0.2 + Math.sqrt((item as MapPoint).count) * 0.11))} pointResolution={12} pointsTransitionDuration={reducedMotion ? 0 : 450}
        pointLabel={(item) => { const value = item as MapPoint; return `<div style="max-width:260px;padding:9px 11px;color:#f7efd9;background:#173734;border:1px solid #b5965f;border-radius:4px;font:13px/1.5 Georgia,serif">${escapeHtml(value.selectedPlace ? value.name : value.article?.title || `${value.name}: ${value.count} titulares`)}<br/><span style="color:#bcd8d1">${value.selectedPlace ? "Lugar seleccionado · las noticias siguen exigiendo evidencia explícita" : value.article ? "Ubicación publicada por la fuente · clic para abrir" : "Centro aproximado del país · clic para explorar"}</span></div>`; }} onPointClick={(item) => { const value = item as MapPoint; if (!value.selectedPlace) selectPoint(value); }}
        arcsData={showConnections ? connections : []} arcStartLat="startLat" arcStartLng="startLng" arcEndLat="endLat" arcEndLng="endLng" arcColor={() => ["#a8e0d5cc", "#df8a55cc"]} arcStroke={0.45} arcAltitudeAutoScale={0.35} arcDashLength={0.34} arcDashGap={0.12} arcDashAnimateTime={live && !reducedMotion ? 1800 : 0} arcsTransitionDuration={reducedMotion ? 0 : 400} arcLabel={(item) => escapeHtml(`${(item as PulseConnection).label} · Clic para ver los titulares compartidos`)} onArcClick={(item) => onSelectConnection(item as PulseConnection)}
      />
    </GlobeBoundary>}
    {webglFailed && <p role="status" style={{ position: "absolute", top: 12, left: 16, right: 16, margin: 0, color: "#d2e2eb", fontSize: 12 }}>Vista 2D activada: tu dispositivo no pudo iniciar el globo 3D. La cobertura sigue disponible.</p>}
    <div className="globe-navigation-help" id="globe-navigation-help"><strong>Explora la Tierra</strong><span>Arrastra para rotar · rueda para acercar · flechas para navegar</span></div>
    <div className="globe-controls" aria-label="Controles del mapa" style={{ position: "absolute", right: 18, bottom: 20, display: "flex", gap: 5 }}>
      <button type="button" onClick={() => zoom(1)} aria-label="Acercar mapa" title="Acercar"><Plus size={17} /></button>
      <button type="button" onClick={() => zoom(-1)} aria-label="Alejar mapa" title="Alejar"><Minus size={17} /></button>
      <button type="button" onClick={reset} aria-label="Centrar vista mundial" title="Centrar vista mundial"><Compass size={17} /></button>
    </div>
  </div>;
}
