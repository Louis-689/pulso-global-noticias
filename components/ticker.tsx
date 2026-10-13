"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";
import { sourceLabel } from "@/lib/format";
import type { PulseArticle } from "@/lib/pulse-types";

/** Endless breaking-news strip. Hover or focus pauses it. */
export function Ticker({ label, articles, onOpen, titles }: { label: string; articles: PulseArticle[]; onOpen: (article: PulseArticle) => void; titles?: Map<string, string> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const key = articles.map((article) => article.id).join();

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !articles.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(track, { xPercent: 0 }, { xPercent: -50, ease: "none", duration: Math.max(40, articles.length * 9), repeat: -1 });
    const pause = () => gsap.to(tween, { timeScale: 0, duration: 0.4 });
    const play = () => gsap.to(tween, { timeScale: 1, duration: 0.6 });
    track.addEventListener("mouseenter", pause); track.addEventListener("mouseleave", play);
    track.addEventListener("focusin", pause); track.addEventListener("focusout", play);
    return () => {
      tween.kill();
      track.removeEventListener("mouseenter", pause); track.removeEventListener("mouseleave", play);
      track.removeEventListener("focusin", pause); track.removeEventListener("focusout", play);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!articles.length) return null;
  const items = [...articles, ...articles];
  return <div className="ticker" dir="ltr">
    <span className="ticker-label"><i />{label}</span>
    <div className="ticker-window">
      <div className="ticker-track" ref={trackRef}>
        {items.map((article, index) => <button key={`${article.id}-${index}`} tabIndex={index < articles.length ? 0 : -1} aria-hidden={index >= articles.length} onClick={() => onOpen(article)}>
          <b>{sourceLabel(article)}</b><span dir="auto">{titles?.get(article.id) ?? article.title}</span>
        </button>)}
      </div>
    </div>
  </div>;
}
