"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import countryData from "@/lib/country-data.json";
import { countryName, flag } from "@/lib/format";
import { detectLanguage, LANGUAGES, translator, type DictKey, type Lang } from "@/lib/i18n";
import { blockingCountries, LIBRARY, type LibraryOutlet } from "@/lib/library";
import { buildOfflineHtml } from "@/lib/offline";
import { loadSaved, persistSaved } from "@/lib/saved";
import { TOPICS } from "@/lib/topics";
import type { PulseArticle, PulseCategory, PulseMode, PulseTimespan } from "@/lib/pulse-types";
import { Globe } from "./globe";
import { LiveTV } from "./live-tv";
import { Reader } from "./reader";
import { SafeAccess } from "./safe-access";
import { StoryCard } from "./story-card";
import { Ticker } from "./ticker";
import { useDialog } from "./use-dialog";
import { usePulse } from "./use-pulse";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

type Tab = "news" | "library" | "signals" | "saved";
const TABS: Tab[] = ["news", "library", "signals", "saved"];
const CATEGORIES: PulseCategory[] = ["all", "politics", "economy", "security", "technology", "science", "health", "climate", "culture", "sports", "education"];
const SIGNAL_CATEGORIES = new Set<PulseCategory>(["all", "science", "technology"]);
const WINDOWS: PulseTimespan[] = ["1h", "6h", "24h", "48h", "7d"];
const PAGE = 24;
const BLOCKED_OUTLETS = LIBRARY.filter((outlet) => outlet.blockedIn.length).length;
const LANG_KEY = "pulso-lang";
const LITE_KEY = "pulso-lite";

function CountUp({ value }: { value: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef({ v: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (value == null) { node.textContent = "—"; return; }
    const tween = gsap.to(shown.current, { v: value, duration: 1.4, ease: "power3.out", onUpdate: () => { node.textContent = String(Math.round(shown.current.v)); } });
    return () => { tween.kill(); };
  }, [value]);
  return <span ref={ref} />;
}

export function PulsoApp() {
  const [lang, setLang] = useState<Lang>("es");
  const [tab, setTab] = useState<Tab>("news");
  const [category, setCategory] = useState<PulseCategory>("all");
  const [timespan, setTimespan] = useState<PulseTimespan>("24h");
  const [country, setCountry] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [outletFilter, setOutletFilter] = useState("");
  const [hoverOutlet, setHoverOutlet] = useState<LibraryOutlet | null>(null);
  const [selected, setSelected] = useState<PulseArticle | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [saved, setSaved] = useState<{ ids: string[]; archive: PulseArticle[] }>({ ids: [], archive: [] });
  const [visible, setVisible] = useState(PAGE);
  const [langOpen, setLangOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [panel, setPanel] = useState<"tv" | "safe" | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lite, setLite] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useDialog<HTMLDivElement>(sourcesOpen);
  const panelRef = useDialog<HTMLDivElement>(panel !== null);
  const t = useMemo(() => translator(lang), [lang]);

  const mode: PulseMode = tab === "library" ? "library" : tab === "signals" ? "early" : "news";
  const filters = useMemo(() => ({ category, timespan, mode, country, query, lang }), [category, timespan, mode, country, query, lang]);
  const { data, loading, error, cached, freshIds, refresh } = usePulse(filters, true);

  // Restore language and saved stories on the client.
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(LANG_KEY); } catch { /* private mode */ }
    const initial = LANGUAGES.some((item) => item.code === stored) ? stored as Lang : detectLanguage();
    setLang(initial);
    try { setLite(localStorage.getItem(LITE_KEY) === "1"); } catch { /* private mode */ }
    setSaved(loadSaved());
    setMounted(true);
  }, []);
  useLayoutEffect(() => {
    const meta = LANGUAGES.find((item) => item.code === lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = meta?.rtl ? "rtl" : "ltr";
  }, [lang]);
  useLayoutEffect(() => { document.documentElement.dataset.lite = lite ? "1" : "0"; }, [lite]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    if (!langOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target as Element).closest?.(".lang")) setLangOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [langOpen]);

  useEffect(() => {
    if (!panel && !sourcesOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setPanel(null); setSourcesOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, sourcesOpen]);

  // Intl country names differ between Node and browsers, so build the list after hydration.
  const countries = useMemo(() => !mounted ? [] : countryData
    .map((item) => ({ code: item.code, name: countryName(item.code, lang, item.name), lat: item.lat, lng: item.lng }))
    .sort((a, b) => a.name.localeCompare(b.name, lang)), [lang, mounted]);

  const articles = useMemo(() => {
    if (tab === "saved") return [...saved.archive].reverse();
    const list = data && data.mode === mode ? data.articles : [];
    const confirmedOnly = verifiedOnly && tab !== "signals";
    return list.filter((article) => (!outletFilter || article.outlet?.id === outletFilter) && (!confirmedOnly || article.confirmedBy?.length));
  }, [tab, saved.archive, data, mode, outletFilter, verifiedOnly]);
  const lead = articles.find((article) => article.media) ?? articles[0];
  const rest = articles.filter((article) => article !== lead).slice(0, visible - 1);
  // Polling refreshes keep the same key, so cards already on screen don't animate again.
  const listKey = `${tab}|${category}|${timespan}|${country}|${query}|${outletFilter}|${verifiedOnly}`;

  const highlight = useMemo(() => {
    if (tab !== "library") return [];
    if (hoverOutlet) return blockingCountries(hoverOutlet);
    const outlet = LIBRARY.find((item) => item.id === outletFilter);
    return [...new Set((outlet ? [outlet] : LIBRARY).flatMap(blockingCountries))];
  }, [tab, hoverOutlet, outletFilter]);
  const libraryFocus = useMemo(() => {
    const outlet = hoverOutlet ?? LIBRARY.find((item) => item.id === outletFilter);
    const code = outlet?.blockedIn[0] === "EU" ? "DE" : outlet?.blockedIn[0];
    const place = code ? countryData.find((item) => item.code === code) : undefined;
    return place ? { lat: place.lat, lng: place.lng } : null;
  }, [hoverOutlet, outletFilter]);
  const points = useMemo(() => (data?.points ?? []).map((point) => ({ code: point.id, lat: point.lat, lng: point.lng, count: point.count })), [data?.points]);
  const outletCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (data?.mode === "library") for (const article of data.articles) if (article.outlet) counts.set(article.outlet.id, (counts.get(article.outlet.id) ?? 0) + 1);
    return counts;
  }, [data]);

  // ——— Animations ———
  useGSAP(() => {
    if (lite) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const split = new SplitText(".hero-title", { type: lang === "ar" ? "words" : "words,chars", mask: "words" });
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from(".hero-kicker", { y: 20, autoAlpha: 0, duration: 0.8 })
        .from(lang === "ar" ? split.words : split.chars, { yPercent: 110, duration: 1.1, stagger: 0.018 }, "-=0.5")
        .from(".hero-sub", { y: 24, autoAlpha: 0, duration: 0.9 }, "-=0.8")
        .from(".hero-cta > *", { y: 16, autoAlpha: 0, stagger: 0.08, duration: 0.7 }, "-=0.6")
        .from(".how-mini li", { y: 14, autoAlpha: 0, stagger: 0.08, duration: 0.6, ease: "back.out(1.8)" }, "-=0.5")
        .from(".stat", { y: 30, autoAlpha: 0, stagger: 0.08, duration: 0.8 }, "-=0.6")
        .from(".globe-stage", { scale: 0.85, autoAlpha: 0, duration: 1.8 }, 0.1);
      gsap.to(".orb-a", { x: 120, y: 60, duration: 14, repeat: -1, yoyo: true, ease: "sine.inOut" });
      gsap.to(".orb-b", { x: -100, y: -80, duration: 18, repeat: -1, yoyo: true, ease: "sine.inOut" });
      gsap.to(".globe-stage", { yPercent: 12, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
      return () => split.revert();
    });
  }, { scope: rootRef, dependencies: [lang, lite], revertOnUpdate: true });

  // Cards fly in as they enter the viewport.
  useGSAP(() => {
    if (lite) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(".card", { autoAlpha: 0, y: 48, rotateX: -12, transformOrigin: "50% 0%" });
      ScrollTrigger.batch(".card", {
        start: "top 92%",
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, rotateX: 0, stagger: 0.06, duration: 0.8, ease: "power3.out", overwrite: true }),
      });
      ScrollTrigger.refresh();
    });
  }, { scope: feedRef, dependencies: [listKey, articles.length > 0, lite], revertOnUpdate: true });

  // Sliding pill under the active tab.
  useGSAP(() => {
    const active = navRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (!active) return;
    const place = (duration: number) => gsap.to(".nav-pill", { x: active.offsetLeft, width: active.offsetWidth, duration, ease: "power3.out" });
    place(0.5);
    const onResize = () => place(0);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, { scope: navRef, dependencies: [tab, lang, mounted] });

  // ——— Actions ———
  const scrollToFeed = () => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
  function selectTab(next: Tab) {
    setTab(next); setVisible(PAGE); setOutletFilter(""); setHoverOutlet(null);
    if (next === "signals" && !SIGNAL_CATEGORIES.has(category)) setCategory("all");
    if (next === "library" && (timespan === "1h" || timespan === "6h" || timespan === "24h")) setTimespan("48h");
  }
  const selectCountry = useCallback((code: string) => {
    setCountry((current) => current === code ? "" : code);
    const item = countryData.find((entry) => entry.code === code);
    if (item) setFocus({ lat: item.lat, lng: item.lng });
    setVisible(PAGE);
    if (tab === "saved") setTab("news");
  }, [tab]);
  function openArticle(article: PulseArticle) {
    setSelected(article);
    const where = article.location ?? article.mentionedCountries[0];
    if (where) setFocus({ lat: where.lat, lng: where.lng });
  }
  function burst(origin?: HTMLElement) {
    if (!origin || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = origin.getBoundingClientRect();
    const icons = ["⭐", "💛", "✨", "📌", "🎉"];
    for (let i = 0; i < 10; i++) {
      const bit = document.createElement("span");
      bit.className = "burst";
      bit.textContent = icons[i % icons.length];
      bit.style.left = `${rect.left + rect.width / 2}px`;
      bit.style.top = `${rect.top + rect.height / 2}px`;
      document.body.appendChild(bit);
      const angle = (Math.PI * 2 * i) / 10;
      gsap.fromTo(bit, { x: 0, y: 0, scale: 0.4, opacity: 1 }, { x: Math.cos(angle) * 70, y: Math.sin(angle) * 70 - 20, scale: 1.2, opacity: 0, rotation: gsap.utils.random(-90, 90), duration: 0.9, ease: "power3.out", onComplete: () => bit.remove() });
    }
  }
  function surprise() {
    const pool = (data?.articles ?? []).filter((article) => article.mentionedCountries.length || article.location);
    const list = pool.length ? pool : data?.articles ?? [];
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    const where = pick.location ?? pick.mentionedCountries[0];
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (where) setFocus({ lat: where.lat, lng: where.lng });
    gsap.fromTo(".globe-stage", { rotate: -8 }, { rotate: 0, duration: 1.4, ease: "elastic.out(1, 0.4)" });
    window.setTimeout(() => setSelected(pick), where ? 1500 : 300);
  }
  const related = useMemo(() => {
    if (!selected || !data) return [];
    const words = (text: string) => new Set(text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 4));
    const mine = words(selected.title);
    const codes = new Set(selected.mentionedCountries.map((country) => country.code));
    return data.articles
      .filter((article) => article.id !== selected.id && article.sourceName !== selected.sourceName)
      .map((article) => {
        const shared = [...words(article.title)].filter((word) => mine.has(word)).length;
        const places = article.mentionedCountries.filter((country) => codes.has(country.code)).length;
        return { article, score: shared * 2 + places * 1.5 + (article.topic && article.topic === selected.topic ? 0.5 : 0) };
      })
      .filter((item) => item.score >= 2.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.article);
  }, [selected, data]);
  function toggleSaved(article: PulseArticle, origin?: HTMLElement) {
    if (!saved.ids.includes(article.id)) burst(origin);
    setSaved((current) => {
      const has = current.ids.includes(article.id);
      const next = has
        ? { ids: current.ids.filter((id) => id !== article.id), archive: current.archive.filter((item) => item.id !== article.id) }
        : { ids: [...current.ids, article.id].slice(-200), archive: [...current.archive.filter((item) => item.id !== article.id), article].slice(-200) };
      persistSaved(next.ids, next.archive);
      return next;
    });
  }
  function toggleLite() {
    setLite((value) => {
      try { localStorage.setItem(LITE_KEY, value ? "0" : "1"); } catch { /* private mode */ }
      return !value;
    });
  }
  function downloadOffline() {
    const list = articles.length ? articles : data?.articles ?? [];
    const meta = LANGUAGES.find((item) => item.code === lang);
    const now = new Date();
    const html = buildOfflineHtml(list, { title: `Pulso Global · ${feedTitle}`, lang, rtl: meta?.rtl, confirmedLabel: t("trust.confirmed"), generatedAt: now });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    link.download = `pulso-global-${now.toISOString().slice(0, 10)}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setQuery(draft.trim().slice(0, 100)); setVisible(PAGE);
    if (tab === "saved") setTab("news");
    scrollToFeed();
  }
  function reset() {
    setCategory("all"); setTimespan(tab === "library" ? "48h" : "24h"); setCountry(""); setQuery(""); setDraft(""); setOutletFilter(""); setVerifiedOnly(false); setVisible(PAGE);
  }
  function toggleSpeech() {
    if (!("speechSynthesis" in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const top = articles.slice(0, 5);
    if (!top.length) return;
    const utterance = new SpeechSynthesisUtterance(top.map((article, index) => `${index + 1}. ${article.title}`).join(". "));
    utterance.lang = LANGUAGES.find((item) => item.code === lang)?.speech ?? "es-ES";
    utterance.onend = utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); setSpeaking(true);
  }

  const okSources = data?.sources.filter((source) => source.status === "ok").length ?? null;
  const status = loading ? t("status.updating") : error ? t("status.offline") : cached ? t("status.cached") : data?.partial ? t("status.partial") : t("status.live");
  const statusTone = error ? "bad" : loading ? "busy" : cached || data?.partial ? "warn" : "ok";
  const feedTitle = t(`feed.${tab}` as DictKey);
  const hasFilters = category !== "all" || !!country || !!query || !!outletFilter || verifiedOnly;
  const blockedHere = tab === "library" ? highlight.length : 0;

  return <div className="app" ref={rootRef}>
    <div className="orb orb-a" aria-hidden="true" /><div className="orb orb-b" aria-hidden="true" /><div className="grain" aria-hidden="true" />

    <header className="topbar">
      <button className="brand" onClick={() => { selectTab("news"); reset(); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Pulso Global">
        <span className="brand-mark"><i /></span>
        <span className="brand-text"><strong>PULSO<em>GLOBAL</em></strong><small>{t("brand.tag")}</small></span>
      </button>

      <nav className="nav" ref={navRef} aria-label="Pulso Global">
        <span className="nav-pill" aria-hidden="true" />
        {TABS.map((item) => <button key={item} data-tab={item} className={tab === item ? "active" : ""} aria-current={tab === item ? "page" : undefined} onClick={() => { selectTab(item); if (item !== "news") scrollToFeed(); }}>
          {t(`nav.${item}` as DictKey)}{item === "saved" && saved.ids.length > 0 && <b>{saved.ids.length}</b>}
        </button>)}
      </nav>

      <form className="search" role="search" onSubmit={submitSearch}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("search.placeholder")} aria-label={t("search.placeholder")} />
        {draft && <button type="button" onClick={() => { setDraft(""); setQuery(""); }} aria-label="✕">✕</button>}
      </form>

      <div className="top-actions">
        <span className={`status status-${statusTone}`} aria-live="polite"><i />{status}</span>
        <button className="lite-btn safe-btn" onClick={() => setPanel("safe")} title={t("safe.title")} aria-label={t("safe.title")}>🛡️</button>
        <button className={`lite-btn${lite ? " on" : ""}`} onClick={toggleLite} aria-pressed={lite} title={t("lite.hint")}>🪶 <span>{t("lite.label")}</span></button>
        <div className="lang">
          <button className="lang-button" onClick={() => setLangOpen((value) => !value)} aria-expanded={langOpen} aria-haspopup="listbox" aria-label={t("lang.label")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>
            <span>{lang.toUpperCase()}</span>
          </button>
          {langOpen && <ul className="lang-menu" role="listbox" aria-label={t("lang.label")}>
            {LANGUAGES.map((item) => <li key={item.code}><button role="option" aria-selected={item.code === lang} className={item.code === lang ? "on" : ""} onClick={() => { setLang(item.code); setLangOpen(false); try { localStorage.setItem(LANG_KEY, item.code); } catch { /* private mode */ } }}>
              <span>{item.native}</span><small>{item.code.toUpperCase()}</small>
            </button></li>)}
          </ul>}
        </div>
      </div>
    </header>

    <Ticker label={t("ticker.label")} articles={(data?.articles ?? []).slice(0, 14)} onOpen={openArticle} />

    <section className="hero">
      <div className="hero-copy">
        <p className="hero-kicker"><span className="live-dot" />{t("hero.kicker")}</p>
        <h1 className="hero-title" key={lang}>{t("hero.title")}</h1>
        <p className="hero-sub">{t("hero.sub")}</p>
        <div className="hero-cta">
          <button className="btn btn-primary" onClick={() => { selectTab("news"); scrollToFeed(); }}>{t("hero.cta")} ↓</button>
          <button className="btn btn-ghost" onClick={() => { selectTab("library"); scrollToFeed(); }}>📚 {t("hero.ctaLibrary")}</button>
          {!lite && <button className="btn btn-ghost" onClick={() => setPanel("tv")}>📺 {t("tv.short")}</button>}
          <button className="btn btn-fun" onClick={surprise} disabled={!data?.articles.length}>🎲 {t("fun.surprise")}</button>
        </div>
        <ol className="how-mini" aria-label={t("how.title")}>
          {(["how.1", "how.2", "how.3"] as const).map((key, index) => <li key={key}><b>{["🌍", "🎬", "🔓"][index]}</b>{t(key)}</li>)}
        </ol>
        <dl className="stats">
          <div className="stat"><dt><CountUp value={data?.stats.total ?? null} /></dt><dd>{t("stats.stories")}</dd></div>
          <div className="stat"><dt><CountUp value={data?.points.length ?? null} /></dt><dd>{t("stats.countries")}</dd></div>
          <button className="stat stat-link" onClick={() => setSourcesOpen(true)}><dt><CountUp value={okSources} /></dt><dd>{t("stats.sources")} ↗</dd></button>
          <div className="stat stat-red"><dt><CountUp value={BLOCKED_OUTLETS} /></dt><dd>{t("stats.blocked")}</dd></div>
        </dl>
      </div>
      <div className="globe-stage">
        <Globe points={points} arcs={tab === "library" ? [] : data?.connections ?? []} highlight={highlight} selected={country} focus={focus} lang={lang} hint={tab === "library" ? t("library.mapHint") : t("globe.hint")} onSelectCountry={selectCountry} />
        {blockedHere > 0 && <div className="globe-badge">⛔ {blockedHere} · {hoverOutlet?.name ?? t("library.title")}</div>}
      </div>
    </section>

    <section className="controls" id="feed">
      <div className="chips" role="group">
        {CATEGORIES.map((item) => {
          const disabled = tab === "signals" && !SIGNAL_CATEGORIES.has(item);
          return <button key={item} disabled={disabled} className={`chip${category === item ? " on" : ""}`} style={{ "--tc": TOPICS[item].color } as React.CSSProperties} onClick={() => { setCategory(item); setVisible(PAGE); }}><span aria-hidden="true">{TOPICS[item].icon}</span> {t(`cat.${item}` as DictKey)}</button>;
        })}
      </div>
      <div className="control-row">
        <label className="select">
          <span>{t("filter.country")}</span>
          <select value={country} onChange={(event) => event.target.value ? selectCountry(event.target.value) : setCountry("")}>
            <option value="">🌐 {t("filter.world")}</option>
            {countries.map((item) => <option key={item.code} value={item.code}>{flag(item.code)} {item.name}</option>)}
          </select>
        </label>
        <div className="segmented" role="group">
          {WINDOWS.map((item) => <button key={item} className={timespan === item ? "on" : ""} onClick={() => setTimespan(item)}>{item}</button>)}
        </div>
        {tab !== "signals" && tab !== "saved" && <button className={`verify-btn${verifiedOnly ? " on" : ""}`} onClick={() => { setVerifiedOnly((value) => !value); setVisible(PAGE); }} aria-pressed={verifiedOnly} title={t("trust.policy")}>✅ {t("trust.verifiedOnly")}</button>}
        <button className="icon-btn" onClick={toggleSpeech} aria-pressed={speaking} title={speaking ? t("reader.stop") : t("reader.listen")} aria-label={speaking ? t("reader.stop") : t("reader.listen")}>{speaking ? "■" : "🔊"}</button>
        <button className="icon-btn" onClick={() => void refresh()} disabled={loading} aria-label="↻" title="↻"><span className={loading ? "spin" : ""}>↻</span></button>
        {hasFilters && <button className="link-btn" onClick={reset}>{t("filter.reset")}</button>}
      </div>
    </section>

    {tab === "library" && <section className="library" aria-label={t("library.title")}>
      <div className="library-head">
        <h2>📚 {t("library.title")}</h2>
        <p>{t("library.intro")}</p>
        <small>{t("library.disclaimer")}</small>
      </div>
      <div className="library-body">
      <div className="shelf">
        {LIBRARY.map((outlet) => <button key={outlet.id} className={`book${outletFilter === outlet.id ? " on" : ""}${outlet.stateFunded ? " state" : ""}`}
          onMouseEnter={() => setHoverOutlet(outlet)} onMouseLeave={() => setHoverOutlet(null)} onFocus={() => setHoverOutlet(outlet)} onBlur={() => setHoverOutlet(null)}
          onClick={() => { setOutletFilter((current) => current === outlet.id ? "" : outlet.id); setVisible(PAGE); }}>
          <span className="book-spine" style={{ "--h": (outlet.id.length * 47) % 360 } as React.CSSProperties} />
          <strong>{outlet.name}</strong>
          <small className="book-about">{lang === "es" || lang === "pt" || lang === "it" ? outlet.about.es : outlet.about.en}</small>
          <span className="book-block">{outlet.blockedIn.length
            ? <>⛔ {outlet.blockedIn.map((code) => `${flag(code)} ${countryName(code, lang)}`).join(" · ")}{outlet.since && ` · ${t("library.since")} ${outlet.since}`}</>
            : <>✦ {t("library.noBlock")}</>}</span>
          <span className="book-count">{outletCounts.get(outlet.id) ?? 0}</span>
        </button>)}
      </div>
      <div className="library-map">
        <div className="library-globe"><Globe points={[]} highlight={highlight} focus={libraryFocus} lang={lang} hint={t("library.mapHint")} /></div>
        <p>⛔ {hoverOutlet ? `${hoverOutlet.name}: ${hoverOutlet.blockedIn.map((code) => countryName(code, lang)).join(", ") || t("library.noBlock")}` : t("library.mapHint")}</p>
      </div>
      </div>
    </section>}

    {tab === "signals" && <p className="mode-hint">〰 {t("signals.hint")}</p>}

    <section className="feed" ref={feedRef} aria-busy={loading}>
      <div className="feed-head">
        <h2>{feedTitle}{country && <span className="feed-where"> · {flag(country)} {countryName(country, lang)}</span>}{query && <span className="feed-where"> · “{query}”</span>}</h2>
        <span className="feed-count">{tab === "saved" ? saved.ids.length : data ? articles.length : "…"}</span>
      </div>
      {loading && <div className="loadbar" aria-hidden="true"><i /></div>}
      {error && <div className="alert" role="alert"><span>{t("error.failed")}</span><button onClick={() => void refresh()}>{t("error.retry")}</button></div>}

      {!data && loading && tab !== "saved" && <div className="grid">{Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton" />)}<p className="loading-text">{t("feed.loading")}</p></div>}

      {(data || tab === "saved") && articles.length === 0 && !loading && <div className="empty">
        <span className="empty-icon">{tab === "saved" ? "🔖" : "🛰"}</span>
        <strong>{tab === "saved" ? t("feed.savedEmpty") : t("feed.empty")}</strong>
        <p>{tab === "saved" ? t("feed.savedHint") : t("feed.emptyHint")}</p>
      </div>}

      {articles.length > 0 && <div className="grid" key={listKey.split("|").slice(0, 6).join("|")}>
        {lead && <StoryCard article={lead} lead lang={lang} t={t} fresh={freshIds.has(lead.id)} saved={saved.ids.includes(lead.id)} onOpen={openArticle} onSave={toggleSaved} lite={lite} />}
        {rest.map((article) => <StoryCard key={article.id} article={article} lang={lang} t={t} fresh={freshIds.has(article.id)} saved={saved.ids.includes(article.id)} onOpen={openArticle} onSave={toggleSaved} lite={lite} />)}
      </div>}
      {articles.length > visible && <button className="btn btn-ghost more" onClick={() => setVisible((value) => value + PAGE)}>{t("feed.more")} <span>+{Math.min(PAGE, articles.length - visible)}</span></button>}
      {data && tab === "news" && <p className="coverage">🛡️ {t("trust.policy")}{data.untrustedDropped ? ` ${t("trust.dropped").replace("{n}", String(data.untrustedDropped))}` : ""}</p>}
    </section>

    <section className="safe-strip" aria-label={t("safe.title")}>
      <p>🛡️ {t("safe.intro")}</p>
      <div>
        <button className="btn btn-ghost" onClick={() => setPanel("safe")}>{t("safe.title")}</button>
        <button className="btn btn-primary" onClick={downloadOffline} disabled={!articles.length}>⬇ {t("safe.download")}</button>
      </div>
    </section>

    <footer className="footer">
      <ul className="mission-pills" aria-label={t("mission.title")}>
        {([["🔓", "mission.1t"], ["🌐", "mission.2t"], ["🔍", "mission.3t"]] as const).map(([icon, key]) => <li key={key}>{icon} {t(key)}</li>)}
      </ul>
      <p>{t("footer.mission")}</p>
      <small>{t("footer.made")} · <a href="https://github.com/Louis-689" target="_blank" rel="noopener noreferrer">@Louis-689</a></small>
    </footer>

    {sourcesOpen && <div className="modal-root" onClick={() => setSourcesOpen(false)}>
      <div className="modal" ref={sourcesRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("sources.title")} onClick={(event) => event.stopPropagation()}>
        <button className="reader-close" onClick={() => setSourcesOpen(false)} aria-label={t("reader.close")}>✕</button>
        <h2>{t("sources.title")}</h2>
        <p className="reader-note">{t("sources.hint")}</p>
        <p className="trust-note">🛡️ {t("trust.policy")}{data?.untrustedDropped ? ` ${t("trust.dropped").replace("{n}", String(data.untrustedDropped))}` : ""}</p>
        <ul className="sources">
          {data?.sources.map((source) => <li key={source.name}>
            <i className={`dot dot-${source.status}`} />
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>
            <b>{source.count}</b>
          </li>)}
        </ul>
      </div>
    </div>}

    {panel && <div className="modal-root" onClick={() => setPanel(null)}>
      <div className="modal modal-wide" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={panel === "tv" ? t("tv.title") : t("safe.title")} onClick={(event) => event.stopPropagation()}>
        <button className="reader-close" onClick={() => setPanel(null)} aria-label={t("reader.close")}>✕</button>
        {panel === "tv" ? <LiveTV lang={lang} t={t} /> : <SafeAccess t={t} onDownload={downloadOffline} canDownload={articles.length > 0} />}
      </div>
    </div>}

    <Reader article={selected} lang={lang} t={t} saved={!!selected && saved.ids.includes(selected.id)} onClose={() => setSelected(null)} onSave={toggleSaved} onCountry={selectCountry} related={related} onOpen={openArticle} lite={lite} />
  </div>;
}
