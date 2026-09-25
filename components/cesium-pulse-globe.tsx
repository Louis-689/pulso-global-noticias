"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import { Compass, Loader2, Minus, Plus } from "lucide-react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { countries, worldFeatures } from "@/lib/pulse-geography";
import type { PulseArticle, PulseConnection, PulsePoint } from "@/lib/pulse-types";

type CesiumModule = typeof import("cesium");
type CesiumViewer = import("cesium").Viewer;
type CesiumHandler = import("cesium").ScreenSpaceEventHandler;

type Props = {
  points: PulsePoint[];
  connections: PulseConnection[];
  articles: PulseArticle[];
  selectedCountry: string;
  selectedPlace: { lat: number; lng: number; name: string } | null;
  onSelectCountry: (code: string) => void;
  onSelectArticle: (article: PulseArticle) => void;
  onSelectConnection: (connection: PulseConnection) => void;
  showConnections: boolean;
  showCountryAreas: boolean;
  showCountrySignals: boolean;
  showExactSignals: boolean;
  resetKey: number;
};

type Runtime = {
  Cesium: CesiumModule;
  viewer: CesiumViewer;
  handler: CesiumHandler;
  targets: Map<string, () => void>;
};

function hierarchy(Cesium: CesiumModule, polygon: number[][][]) {
  const outer = Cesium.Cartesian3.fromDegreesArray(polygon[0].flat());
  const holes = polygon.slice(1).map((ring) => new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(ring.flat())));
  return new Cesium.PolygonHierarchy(outer, holes);
}

export default function CesiumPulseGlobe({ points, connections, articles, selectedCountry, selectedPlace, onSelectCountry, onSelectArticle, onSelectConnection, showConnections, showCountryAreas, showCountrySignals, showExactSignals, resetKey }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const callbacksRef = useRef({ onSelectCountry, onSelectArticle, onSelectConnection });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onSelectCountry, onSelectArticle, onSelectConnection };
  }, [onSelectCountry, onSelectArticle, onSelectConnection]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let runtime: Runtime | null = null;
    void (async () => {
      try {
        (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium/";
        const Cesium = await import("cesium");
        if (cancelled) return;
        const viewer = new Cesium.Viewer(host, {
          animation: false, baseLayer: false, baseLayerPicker: false, fullscreenButton: false,
          geocoder: false, homeButton: false, infoBox: false, navigationHelpButton: false,
          sceneModePicker: false, selectionIndicator: false, timeline: false, scene3DOnly: true,
          skyBox: false, shouldAnimate: false,
        });
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#173e48");
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0b2932");
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 120_000;
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = 45_000_000;
        const imagery = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"));
        if (cancelled) { viewer.destroy(); return; }
        viewer.imageryLayers.addImageryProvider(imagery);
        const targets = new Map<string, () => void>();
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement: { position: import("cesium").Cartesian2 }) => {
          const picked = viewer.scene.pick(movement.position) as { id?: { id?: string } } | undefined;
          const id = picked?.id?.id;
          if (id) targets.get(id)?.();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        runtime = { Cesium, viewer, handler, targets };
        runtimeRef.current = runtime;
        viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-38, 18, 18_500_000) });
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          animate(host, { opacity: [0, 1], scale: [0.985, 1], duration: 750, ease: "out(3)" });
        }
        setReady(true);
      } catch (error) {
        console.error("[cesium]", error instanceof Error ? error.message : "initialization-failed");
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      setReady(false);
      if (runtime) {
        runtime.handler.destroy();
        if (!runtime.viewer.isDestroyed()) runtime.viewer.destroy();
      }
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !ready) return;
    const { Cesium, viewer, targets } = runtime;
    viewer.entities.removeAll();
    targets.clear();
    const counts = new Map(points.map((point) => [point.id, point.count]));

    if (showCountryAreas) for (const feature of worldFeatures) {
      if (!feature.properties.code) continue;
      const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      polygons.forEach((polygon, index) => {
        const id = `country:${feature.properties.code}:${index}`;
        const hasNews = counts.has(feature.properties.code);
        viewer.entities.add({
          id,
          name: feature.properties.spanishName,
          polygon: {
            hierarchy: hierarchy(Cesium, polygon),
            height: 0,
            material: Cesium.Color.fromCssColorString(feature.properties.code === selectedCountry ? "#df6844" : hasNews ? "#2d827d" : "#b89b68").withAlpha(feature.properties.code === selectedCountry ? 0.58 : hasNews ? 0.34 : 0.12),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(feature.properties.code === selectedCountry ? "#fff0bd" : "#e4c989").withAlpha(0.72),
          },
        });
        targets.set(id, () => callbacksRef.current.onSelectCountry(feature.properties.code));
      });
    }

    if (showCountrySignals) for (const point of points) {
      const id = `pulse-country:${point.id}`;
      viewer.entities.add({ id, name: `${point.name}: ${point.count} titulares`, position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat, 26_000), point: { pixelSize: Math.max(8, Math.min(19, 7 + Math.sqrt(point.count))), color: Cesium.Color.fromCssColorString("#9ee4da"), outlineColor: Cesium.Color.fromCssColorString("#173734"), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
      targets.set(id, () => callbacksRef.current.onSelectCountry(point.id));
    }
    if (showExactSignals) for (const article of articles) {
      if (!article.location) continue;
      const id = `pulse-article:${article.id}`;
      viewer.entities.add({ id, name: article.title, position: Cesium.Cartesian3.fromDegrees(article.location.lng, article.location.lat, 42_000), point: { pixelSize: 11, color: Cesium.Color.fromCssColorString("#f29661"), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
      targets.set(id, () => callbacksRef.current.onSelectArticle(article));
    }
    if (selectedPlace) {
      viewer.entities.add({ id: "selected-place", name: selectedPlace.name, position: Cesium.Cartesian3.fromDegrees(selectedPlace.lng, selectedPlace.lat, 58_000), point: { pixelSize: 17, color: Cesium.Color.fromCssColorString("#f4c05f"), outlineColor: Cesium.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    }
    if (showConnections) {
      for (const connection of connections) {
        const id = `connection:${connection.sourceId}:${connection.targetId}`;
        viewer.entities.add({ id, name: connection.label, polyline: { positions: Cesium.Cartesian3.fromDegreesArrayHeights([connection.startLng, connection.startLat, 90_000, connection.endLng, connection.endLat, 90_000]), width: 2.4, material: Cesium.Color.fromCssColorString("#efb877").withAlpha(0.88), arcType: Cesium.ArcType.GEODESIC } });
        targets.set(id, () => callbacksRef.current.onSelectConnection(connection));
      }
    }
    viewer.scene.requestRender();
  }, [articles, connections, points, ready, selectedCountry, selectedPlace, showConnections, showCountryAreas, showCountrySignals, showExactSignals]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !ready) return;
    const country = countries.find((item) => item.code === selectedCountry);
    const target = selectedPlace || country;
    runtime.viewer.camera.flyTo({
      destination: target ? runtime.Cesium.Cartesian3.fromDegrees(target.lng, target.lat, selectedPlace ? 580_000 : 2_900_000) : runtime.Cesium.Cartesian3.fromDegrees(-38, 18, 18_500_000),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.25,
    });
  }, [ready, resetKey, selectedCountry, selectedPlace]);

  const zoom = (factor: number) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const height = runtime.viewer.camera.positionCartographic.height;
    if (factor > 0) runtime.viewer.camera.zoomIn(Math.max(80_000, height * 0.32));
    else runtime.viewer.camera.zoomOut(Math.max(80_000, height * 0.38));
  };
  const reset = () => runtimeRef.current?.viewer.camera.flyTo({ destination: runtimeRef.current.Cesium.Cartesian3.fromDegrees(-38, 18, 18_500_000), duration: 1 });

  return <div className="cesium-globe" role="region" aria-label="Tierra realista interactiva de noticias">
    <div ref={hostRef} className="cesium-canvas" />
    {!ready && !failed && <div className="map-loading"><Loader2 className="spin" aria-hidden="true" /><span>Cargando Tierra realista…</span></div>}
    {failed && <div className="cesium-failure" role="alert"><strong>No se pudo iniciar Cesium.</strong><span>Usa la vista ilustrada o el mapa 2D.</span></div>}
    <div className="globe-navigation-help"><strong>Tierra realista</strong><span>Arrastra para rotar · rueda para acercar · clic en un país o señal</span></div>
    <div className="globe-controls" aria-label="Controles de la Tierra" style={{ position: "absolute", right: 18, bottom: 20, display: "flex", gap: 5 }}>
      <button type="button" onClick={() => zoom(1)} aria-label="Acercar Tierra" title="Acercar"><Plus size={17} /></button>
      <button type="button" onClick={() => zoom(-1)} aria-label="Alejar Tierra" title="Alejar"><Minus size={17} /></button>
      <button type="button" onClick={reset} aria-label="Centrar Tierra" title="Centrar Tierra"><Compass size={17} /></button>
    </div>
  </div>;
}
