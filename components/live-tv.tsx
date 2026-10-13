"use client";

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import type { DictKey } from "@/lib/i18n";
import { channelsFor, liveEmbed } from "@/lib/i18n-extra";

/** Live international news channels. The player loads only when the section is near the screen. */
export function LiveTV({ lang, t }: { lang: string; t: (key: DictKey) => string }) {
  const channels = channelsFor(lang);
  const [active, setActive] = useState(channels[0].id);
  const [near, setNear] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const channel = channels.find((item) => item.id === active) ?? channels[0];

  useEffect(() => { setActive(channelsFor(lang)[0].id); }, [lang]);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); observer.disconnect(); } }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (screenRef.current) gsap.fromTo(screenRef.current, { scale: 0.97, autoAlpha: 0.4 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: "back.out(2)" });
  }, [active]);

  return <section className="tv" ref={rootRef} aria-label={t("tv.title")}>
    <div className="tv-head">
      <h2><span className="tv-dot" />📺 {t("tv.title")}</h2>
      <p>{t("tv.hint")}</p>
    </div>
    <div className="tv-body">
      <div className="tv-screen" ref={screenRef}>
        {near
          ? <iframe key={channel.id} src={liveEmbed(channel)} title={channel.name} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          : <div className="tv-placeholder">📺</div>}
      </div>
      <div className="tv-channels" role="tablist">
        {channels.map((item) => <button key={item.id} role="tab" aria-selected={item.id === active} className={item.id === active ? "on" : ""} onClick={() => setActive(item.id)}>
          <span className="tv-live">LIVE</span>
          <strong>{item.name}</strong>
          <small>{item.lang.toUpperCase()}</small>
        </button>)}
      </div>
    </div>
  </section>;
}
