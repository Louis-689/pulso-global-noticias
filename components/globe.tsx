"use client";

import { geoContains, geoDistance, geoGraticule10, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";
import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import countryData from "@/lib/country-data.json";
import { countryName } from "@/lib/format";
import type { Lang } from "@/lib/i18n";

export type GlobePoint = { code: string; lat: number; lng: number; count: number };
export type GlobeArc = { startLat: number; startLng: number; endLat: number; endLng: number; weight: number };
type CountryFeature = GeoJSON.Feature<GeoJSON.Geometry, { name: string }> & { code: string };

const numericToCode = new Map(countryData.filter((item) => item.numeric).map((item) => [String(Number(item.numeric)), item.code]));
const FEATURES: CountryFeature[] = (feature(
  world as unknown as Parameters<typeof feature>[0],
  (world as unknown as { objects: { countries: Parameters<typeof feature>[1] } }).objects.countries,
) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string }>).features
  .map((item) => ({ ...item, code: numericToCode.get(String(Number(item.id))) ?? "" }));
const GRATICULE = geoGraticule10();
const SPHERE: GeoPermissibleObjects = { type: "Sphere" };

type Props = {
  points: GlobePoint[];
  arcs?: GlobeArc[];
  highlight?: string[];
  selected?: string;
  focus?: { lat: number; lng: number } | null;
  lang: Lang;
  hint: string;
  onSelectCountry?: (code: string) => void;
};

/**
 * Lightweight canvas globe (d3-geo orthographic). No WebGL, so it runs on any
 * phone. GSAP drives the camera; a rAF loop draws pulses, arcs and highlights.
 */
export function Globe({ points, arcs = [], highlight = [], selected = "", focus, lang, hint, onSelectCountry }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camera = useRef({ lambda: 20, phi: -18, scale: 1 });
  const drag = useRef<{ x: number; y: number; lambda: number; phi: number; moved: boolean } | null>(null);
  const hoverRef = useRef("");
  const idleUntil = useRef(0);
  const live = useRef({ points, arcs, highlight: new Set(highlight), selected });
  const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null);
  const onSelectRef = useRef(onSelectCountry);
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  useEffect(() => { onSelectRef.current = onSelectCountry; }, [onSelectCountry]);
  useEffect(() => { live.current = { points, arcs, highlight: new Set(highlight), selected }; }, [points, arcs, highlight, selected]);

  // Camera flies to the focused place.
  useEffect(() => {
    if (!focus) return;
    idleUntil.current = Date.now() + 9000;
    let target = -focus.lng;
    const current = camera.current.lambda;
    target += Math.round((current - target) / 360) * 360;
    gsap.to(camera.current, { lambda: target, phi: Math.max(-60, Math.min(60, -focus.lat)), duration: 1.6, ease: "power3.inOut", overwrite: true });
  }, [focus]);

  // Intro: the planet rises into view.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const tween = gsap.fromTo(camera.current, { scale: 0.55, lambda: camera.current.lambda - 120 }, { scale: 1, lambda: camera.current.lambda, duration: 2.4, ease: "expo.out" });
    return () => { tween.kill(); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const context = canvas.getContext("2d")!;
    const projection = geoOrthographic().clipAngle(90).precision(0.6);
    const path = geoPath(projection, context);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0, height = 0, radius = 0, frame = 0, last = performance.now();

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width; height = rect.height;
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      radius = Math.min(width, height) / 2 - 12;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    // Off-screen globes stop drawing; in lite mode they redraw ~8 times a second without spinning.
    let onScreen = true;
    const seen = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; });
    seen.observe(wrap);

    const draw = (now: number) => {
      const lite = document.documentElement.dataset.lite === "1";
      if (!onScreen || (lite && !drag.current && now - last < 120)) { frame = requestAnimationFrame(draw); return; }
      const dt = Math.min(64, now - last); last = now;
      const cam = camera.current;
      if (!drag.current && !reduce && !lite && Date.now() > idleUntil.current) cam.lambda += dt * 0.006;
      const r = radius * cam.scale;
      projection.translate([width / 2, height / 2]).scale(r).rotate([cam.lambda, cam.phi]);
      const t = now / 1000;
      const { points: pts, arcs: lines, highlight: blocked, selected: chosen } = live.current;
      context.clearRect(0, 0, width, height);

      // Atmosphere glow
      const glow = context.createRadialGradient(width / 2, height / 2, r * 0.9, width / 2, height / 2, r * 1.25);
      glow.addColorStop(0, "rgba(139,92,246,0.25)"); glow.addColorStop(1, "rgba(139,92,246,0)");
      context.fillStyle = glow; context.fillRect(0, 0, width, height);

      // Ocean
      const ocean = context.createRadialGradient(width / 2 - r * 0.35, height / 2 - r * 0.4, r * 0.1, width / 2, height / 2, r);
      ocean.addColorStop(0, "#9fdcff"); ocean.addColorStop(1, "#3b82f6");
      context.beginPath(); path(SPHERE); context.fillStyle = ocean; context.fill();

      context.beginPath(); path(GRATICULE); context.strokeStyle = "rgba(255,255,255,0.25)"; context.lineWidth = 0.6; context.stroke();

      const blink = 0.45 + 0.25 * Math.sin(t * 3);
      for (const country of FEATURES) {
        context.beginPath(); path(country);
        const isBlocked = blocked.has(country.code);
        const isSelected = chosen && country.code === chosen;
        const isHover = hoverRef.current === country.code;
        context.fillStyle = isSelected ? "#ffc83d"
          : isBlocked ? `rgba(255,70,60,${0.55 + blink * 0.6})`
          : isHover ? "#fff3c4" : "#c7f0d8";
        context.fill();
        context.strokeStyle = isBlocked ? "#b91c1c" : "rgba(30,90,60,0.35)";
        context.lineWidth = isBlocked ? 0.9 : 0.5; context.stroke();
      }

      // Arcs between countries named in the same headline
      context.lineCap = "round";
      lines.slice(0, 14).forEach((arc, index) => {
        context.beginPath();
        path({ type: "LineString", coordinates: [[arc.startLng, arc.startLat], [arc.endLng, arc.endLat]] });
        context.setLineDash([6, 10]); context.lineDashOffset = -t * 24 - index * 7;
        context.strokeStyle = "#8b5cf6"; context.lineWidth = Math.min(3, 0.8 + arc.weight * 0.4); context.stroke();
      });
      context.setLineDash([]);

      // News pulses
      const center: [number, number] = [-cam.lambda, -cam.phi];
      for (const [index, point] of pts.entries()) {
        if (geoDistance([point.lng, point.lat], center) > Math.PI / 2 - 0.05) continue;
        const xy = projection([point.lng, point.lat]); if (!xy) continue;
        const size = 2.2 + Math.sqrt(point.count) * 1.7;
        const phase = ((t * 0.6 + index * 0.137) % 1);
        context.beginPath(); context.arc(xy[0], xy[1], size + phase * 20, 0, Math.PI * 2);
        context.strokeStyle = `rgba(255,90,78,${0.8 * (1 - phase)})`; context.lineWidth = 2; context.stroke();
        context.beginPath(); context.arc(xy[0], xy[1], size, 0, Math.PI * 2);
        context.fillStyle = point.code === chosen ? "#1d1747" : "#ff5a4e"; context.fill(); context.strokeStyle = "#fff"; context.lineWidth = 1.5; context.stroke();
      }

      // Rim light
      context.beginPath(); path(SPHERE); context.strokeStyle = "rgba(255,255,255,0.9)"; context.lineWidth = 3; context.stroke();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    const local = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top] as [number, number]; };
    const countryAt = (xy: [number, number]) => {
      const coords = projection.invert?.(xy);
      if (!coords || Math.hypot(xy[0] - width / 2, xy[1] - height / 2) > radius * camera.current.scale) return null;
      return FEATURES.find((item) => geoContains(item, coords)) ?? null;
    };
    const down = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, lambda: camera.current.lambda, phi: camera.current.phi, moved: false };
      gsap.killTweensOf(camera.current);
    };
    const move = (event: PointerEvent) => {
      const state = drag.current;
      if (state) {
        const dx = event.clientX - state.x, dy = event.clientY - state.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) state.moved = true;
        const k = 90 / (radius || 200);
        camera.current.lambda = state.lambda + dx * k;
        camera.current.phi = Math.max(-70, Math.min(70, state.phi - dy * k));
        idleUntil.current = Date.now() + 6000;
        return;
      }
      const xy = local(event);
      const hit = countryAt(xy);
      const code = hit?.code ?? "";
      if (code !== hoverRef.current) hoverRef.current = code;
      setTooltip(hit && code ? { name: countryName(code, langRef.current, hit.properties.name), x: xy[0], y: xy[1] } : null);
    };
    const up = (event: PointerEvent) => {
      const state = drag.current; drag.current = null;
      if (state && !state.moved) {
        const hit = countryAt(local(event));
        if (hit?.code) onSelectRef.current?.(hit.code);
      }
    };
    const leave = () => { hoverRef.current = ""; setTooltip(null); };
    const cancel = () => { drag.current = null; leave(); };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointercancel", cancel);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); seen.disconnect();
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointerleave", leave);
    };
  }, []);

  return <div className="globe" ref={wrapRef}>
    <canvas ref={canvasRef} aria-label={hint} role="img" />
    {tooltip && <span className="globe-tip" style={{ transform: `translate(${tooltip.x + 14}px, ${tooltip.y - 10}px)` }}>{tooltip.name}</span>}
    <span className="globe-hint">{hint}</span>
  </div>;
}
