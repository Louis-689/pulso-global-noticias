"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { animate } from "animejs";
import { Compass, Loader2, Minus, Plus } from "lucide-react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { countries, worldFeatures } from "@/lib/pulse-geography";
import type { PulseArticle, PulseConnection, PulsePoint } from "@/lib/pulse-types";

type CesiumModule = typeof import("cesium");
type CesiumViewer = import("cesium").Viewer;
type CesiumHandler = import("cesium").ScreenSpaceEventHandler;
type CesiumDataSource = import("cesium").CustomDataSource;

type Props = {
  points: PulsePoint[];
  connections: PulseConnection[];
  articles: PulseArticle[];
  selectedCountry: string;
  selectedPlace: { lat: number; lng: number; name: string } | null;
  focusedArticleId: string;
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
  signals: CesiumDataSource;
  targets: Map<string, () => void>;
  disposeInput: () => void;
};

function hierarchy(Cesium: CesiumModule, polygon: number[][][]) {
  const outer = Cesium.Cartesian3.fromDegreesArray(polygon[0].flat());
  const holes = polygon.slice(1).map((ring) => new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(ring.flat())));
  return new Cesium.PolygonHierarchy(outer, holes);
}

export default function CesiumPulseGlobe({ points, connections, articles, selectedCountry, selectedPlace, focusedArticleId, onSelectCountry, onSelectArticle, onSelectConnection, showConnections, showCountryAreas, showCountrySignals, showExactSignals, resetKey }: Props) {
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
    let viewer: CesiumViewer | null = null;
    void (async () => {
      try {
        (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium/";
        const Cesium = await import("cesium");
        if (cancelled) return;
        viewer = new Cesium.Viewer(host, {
          animation: false, baseLayer: false, baseLayerPicker: false, fullscreenButton: false,
          geocoder: false, homeButton: false, infoBox: false, navigationHelpButton: false,
          sceneModePicker: false, selectionIndicator: false, timeline: false, scene3DOnly: true,
          skyBox: false, shouldAnimate: false, requestRenderMode: true, maximumRenderTimeChange: Number.POSITIVE_INFINITY,
        });
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#9d8973");
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#e7dfd3");
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 120_000;
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = 45_000_000;
        viewer.scene.screenSpaceCameraController.inertiaZoom = 0.35;
        viewer.scene.screenSpaceCameraController.maximumMovementRatio = 0.08;
        viewer.scene.screenSpaceCameraController.zoomEventTypes = [Cesium.CameraEventType.RIGHT_DRAG, Cesium.CameraEventType.PINCH];
        const imagery = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"));
        if (cancelled) { viewer.destroy(); return; }
        viewer.imageryLayers.addImageryProvider(imagery);
        const signals = new Cesium.CustomDataSource("pulse-signals");
        await viewer.dataSources.add(signals);
        signals.clustering.enabled = true;
        signals.clustering.pixelRange = 48;
        signals.clustering.minimumClusterSize = 2;
        const removeClusterListener = signals.clustering.clusterEvent.addEventListener((entities, cluster) => {
          cluster.billboard.id = entities;
          cluster.point.id = entities;
          cluster.label.id = entities;
          cluster.billboard.show = false;
          cluster.point.show = true;
          cluster.point.pixelSize = Math.min(38, 22 + Math.sqrt(entities.length) * 2.5);
          cluster.point.color = Cesium.Color.fromCssColorString("#c49659").withAlpha(0.96);
          cluster.point.outlineColor = Cesium.Color.fromCssColorString("#4a382b");
          cluster.point.outlineWidth = 3;
          cluster.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
          cluster.label.show = true;
          cluster.label.text = String(entities.length);
          cluster.label.font = "700 12px Inter, sans-serif";
          cluster.label.fillColor = Cesium.Color.fromCssColorString("#35291f");
          cluster.label.outlineColor = Cesium.Color.fromCssColorString("#fffdf9");
          cluster.label.outlineWidth = 1;
          cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
          cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
          cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
          cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        });
        const targets = new Map<string, () => void>();
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement: { position: import("cesium").Cartesian2 }) => {
          const picked = viewer?.scene.pick(movement.position) as { id?: { id?: string } | import("cesium").Entity[] } | undefined;
          if (Array.isArray(picked?.id) && picked.id.length > 1 && viewer) {
            if (viewer.camera.positionCartographic.height <= 170_000) {
              const preferred = picked.id.find((entity) => entity.id.startsWith("pulse-article:")) ?? picked.id[0];
              targets.get(preferred.id)?.();
              return;
            }
            const positions = picked.id.flatMap((entity) => {
              const position = entity.position?.getValue(viewer!.clock.currentTime);
              return position ? [position] : [];
            });
            if (positions.length) {
              const sphere = Cesium.BoundingSphere.fromPoints(positions);
              const range = Math.max(140_000, sphere.radius * 4.5, viewer.camera.positionCartographic.height * 0.38);
              viewer.camera.flyToBoundingSphere(sphere, {
                duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.8,
                offset: new Cesium.HeadingPitchRange(viewer.camera.heading, -Math.PI / 2, range),
              });
            }
            return;
          }
          const id = Array.isArray(picked?.id) ? picked.id[0]?.id : picked?.id?.id;
          if (id) targets.get(id)?.();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        let wheelDelta = 0;
        let wheelFrame = 0;
        const onWheel = (event: WheelEvent) => {
          event.preventDefault();
          wheelDelta += Math.max(-240, Math.min(240, event.deltaY));
          if (wheelFrame) return;
          wheelFrame = window.requestAnimationFrame(() => {
            const delta = Math.max(-240, Math.min(240, wheelDelta));
            wheelDelta = 0;
            wheelFrame = 0;
            const height = viewer!.camera.positionCartographic.height;
            const ratio = Math.max(0.012, Math.min(0.12, Math.abs(delta) / 1500));
            const distance = height * ratio;
            if (delta < 0 && height > 125_000) viewer!.camera.zoomIn(Math.min(distance, height - 120_000));
            if (delta > 0 && height < 44_500_000) viewer!.camera.zoomOut(Math.min(distance, 45_000_000 - height));
            viewer!.scene.requestRender();
          });
        };
        viewer.scene.canvas.addEventListener("wheel", onWheel, { passive: false });
        const disposeInput = () => {
          viewer?.scene.canvas.removeEventListener("wheel", onWheel);
          if (wheelFrame) window.cancelAnimationFrame(wheelFrame);
          removeClusterListener();
        };
        runtime = { Cesium, viewer, handler, signals, targets, disposeInput };
        runtimeRef.current = runtime;
        viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-38, 18, 15_800_000) });
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          animate(host, { opacity: [0, 1], scale: [0.985, 1], duration: 750, ease: "out(3)" });
        }
        setReady(true);
      } catch (error) {
        if (cancelled) return;
        if (viewer && !viewer.isDestroyed()) viewer.destroy();
        console.error("[cesium]", error instanceof Error ? error.message : "initialization-failed");
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (runtime) {
        runtime.disposeInput();
        runtime.handler.destroy();
        if (!runtime.viewer.isDestroyed()) runtime.viewer.destroy();
      } else if (viewer && !viewer.isDestroyed()) viewer.destroy();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !ready) return;
    const { Cesium, viewer, signals, targets } = runtime;
    viewer.entities.removeAll();
    signals.entities.removeAll();
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
            material: Cesium.Color.fromCssColorString(feature.properties.code === selectedCountry ? "#a6653a" : hasNews ? "#9a8066" : "#d4c7b5").withAlpha(feature.properties.code === selectedCountry ? 0.62 : hasNews ? 0.34 : 0.18),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(feature.properties.code === selectedCountry ? "#fff4df" : "#705c49").withAlpha(0.6),
          },
        });
        targets.set(id, () => callbacksRef.current.onSelectCountry(feature.properties.code));
      });
    }

    if (showCountrySignals) for (const point of points) {
      const id = `pulse-country:${point.id}`;
      signals.entities.add({ id, name: `${point.name}: ${point.count} titulares`, position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat, 26_000), point: { pixelSize: Math.max(8, Math.min(16, 7 + Math.sqrt(point.count))), color: Cesium.Color.fromCssColorString("#8f6545"), outlineColor: Cesium.Color.fromCssColorString("#3f3025"), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
      targets.set(id, () => callbacksRef.current.onSelectCountry(point.id));
    }
    if (showExactSignals) for (const article of articles) {
      if (!article.location) continue;
      const id = `pulse-article:${article.id}`;
      const focused = article.id === focusedArticleId;
      signals.entities.add({ id, name: article.title, position: Cesium.Cartesian3.fromDegrees(article.location.lng, article.location.lat, focused ? 68_000 : 42_000), point: { pixelSize: focused ? 18 : 10, color: Cesium.Color.fromCssColorString(focused ? "#c49659" : "#b76845"), outlineColor: Cesium.Color.fromCssColorString("#fff7e8"), outlineWidth: focused ? 4 : 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
      targets.set(id, () => callbacksRef.current.onSelectArticle(article));
    }
    if (selectedPlace) {
      viewer.entities.add({ id: "selected-place", name: selectedPlace.name, position: Cesium.Cartesian3.fromDegrees(selectedPlace.lng, selectedPlace.lat, 58_000), point: { pixelSize: 17, color: Cesium.Color.fromCssColorString("#c49659"), outlineColor: Cesium.Color.fromCssColorString("#fff7e8"), outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    }
    if (showConnections) {
      for (const connection of connections) {
        const id = `connection:${connection.sourceId}:${connection.targetId}`;
        viewer.entities.add({ id, name: connection.label, polyline: { positions: Cesium.Cartesian3.fromDegreesArrayHeights([connection.startLng, connection.startLat, 90_000, connection.endLng, connection.endLat, 90_000]), width: 2.4, material: Cesium.Color.fromCssColorString("#b85c3b").withAlpha(0.85), arcType: Cesium.ArcType.GEODESIC } });
        targets.set(id, () => callbacksRef.current.onSelectConnection(connection));
      }
    }
    viewer.scene.requestRender();
  }, [articles, connections, focusedArticleId, points, ready, selectedCountry, selectedPlace, showConnections, showCountryAreas, showCountrySignals, showExactSignals]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !ready) return;
    const country = countries.find((item) => item.code === selectedCountry);
    const target = selectedPlace || country;
    runtime.viewer.camera.flyTo({
      destination: target ? runtime.Cesium.Cartesian3.fromDegrees(target.lng, target.lat, selectedPlace ? 580_000 : 2_900_000) : runtime.Cesium.Cartesian3.fromDegrees(-38, 18, 15_800_000),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.25,
    });
  }, [ready, resetKey, selectedCountry, selectedPlace]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !ready || !focusedArticleId) return;
    const article = articles.find((item) => item.id === focusedArticleId);
    const country = article?.mentionedCountries[0];
    const target = article?.location || country;
    if (!target) return;
    runtime.viewer.camera.flyTo({
      destination: runtime.Cesium.Cartesian3.fromDegrees(target.lng, target.lat, article?.location ? 720_000 : 2_600_000),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.05,
    });
  }, [articles, focusedArticleId, ready]);

  const zoom = (factor: number) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const height = runtime.viewer.camera.positionCartographic.height;
    if (factor > 0) runtime.viewer.camera.zoomIn(Math.max(60_000, height * 0.16));
    else runtime.viewer.camera.zoomOut(Math.max(60_000, height * 0.18));
    runtime.viewer.scene.requestRender();
  };
  const reset = () => runtimeRef.current?.viewer.camera.flyTo({ destination: runtimeRef.current.Cesium.Cartesian3.fromDegrees(-38, 18, 15_800_000), duration: 1 });
  const handleKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1); }
    else if (event.key === "-" || event.key === "_") { event.preventDefault(); zoom(-1); }
    else if (event.key === "Home" || event.key === "0") { event.preventDefault(); reset(); }
  };

  return <div className="cesium-globe" role="region" tabIndex={0} aria-label="Tierra realista interactiva de noticias. Usa más y menos para acercar o alejar, e Inicio para centrar." onKeyDown={handleKeyboard}>
    <div ref={hostRef} className="cesium-canvas" />
    {showConnections && <div className="sr-only" aria-label="Conexiones documentadas disponibles">
      {connections.map((connection) => <button key={`${connection.sourceId}-${connection.targetId}`} onClick={() => onSelectConnection(connection)}>{connection.label}. Abrir titulares compartidos.</button>)}
    </div>}
    {!ready && !failed && <div className="map-loading"><Loader2 className="spin" aria-hidden="true" /><span>Cargando Tierra realista…</span></div>}
    {failed && <div className="cesium-failure" role="alert"><strong>No se pudo iniciar Cesium.</strong><span>Usa la vista ilustrada o el mapa 2D.</span></div>}
    <div className="globe-navigation-help"><strong>Tierra realista</strong><span>Arrastra para rotar · rueda: zoom suave · los grupos se abren al acercar</span></div>
    <div className="globe-controls" aria-label="Controles de la Tierra" style={{ position: "absolute", right: 18, bottom: 20, display: "flex", gap: 5 }}>
      <button type="button" onClick={() => zoom(1)} aria-label="Acercar Tierra" title="Acercar"><Plus size={17} /></button>
      <button type="button" onClick={() => zoom(-1)} aria-label="Alejar Tierra" title="Alejar"><Minus size={17} /></button>
      <button type="button" onClick={reset} aria-label="Centrar Tierra" title="Centrar Tierra"><Compass size={17} /></button>
    </div>
  </div>;
}
