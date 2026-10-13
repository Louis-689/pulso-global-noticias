"use client";

import gsap from "gsap";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { countryName, flag, relativeTime, sourceLabel } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import { accessRoutes } from "@/lib/library";
import { isTrustedHost } from "@/lib/trusted";
import type { PulseArticle } from "@/lib/pulse-types";
import { translateMany } from "@/lib/translate-client";
import { fitBytes, QrCode } from "./qr-code";
import { Bookmark, Cover } from "./story-card";
import { useTranslatedTitles } from "./use-translations";
import { useDialog } from "./use-dialog";

type Props = {
  article: PulseArticle | null;
  lang: Lang;
  t: (key: DictKey) => string;
  saved: boolean;
  onClose: () => void;
  onSave: (article: PulseArticle) => void;
  onCountry: (code: string) => void;
  related: PulseArticle[];
  onOpen: (article: PulseArticle) => void;
  lite?: boolean;
};

type FullText = { state: "idle" | "loading" | "failed" } | { state: "ok"; paragraphs: string[] };
type Translation = { title?: string; summary?: string; paragraphs?: Array<string | null>; state: "idle" | "loading" | "ok" | "failed" };

const CRITICAL = ["critical.1", "critical.2", "critical.3", "critical.4"] as const;

const ROUTE_ICON = { original: "↗", archive: "🏛", "archive-today": "🗄", translate: "🌐" } as const;

/** Side drawer with the story, its evidence and every route to reach it. */
export function Reader({ article, lang, t, saved, onClose, onSave, onCountry, related, onOpen, lite }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<PulseArticle | null>(article);
  const panelRef = useDialog<HTMLDivElement>(!!article && !!shown);
  const [copied, setCopied] = useState(false);
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const [full, setFull] = useState<FullText>({ state: "idle" });
  const [qr, setQr] = useState(false);
  const relatedTitles = useTranslatedTitles(related, lang);
  const foreign = !!shown?.lang && shown.lang !== lang;
  // Stories in another language open translated; "Ver original" switches back.
  const [translating, setTranslating] = useState(foreign);
  const [tx, setTx] = useState<Translation>({ state: "idle" });
  useEffect(() => { setChecks([false, false, false, false]); setFull({ state: "idle" }); setQr(false); setTx({ state: "idle" }); setTranslating(!!shown?.lang && shown.lang !== lang); }, [shown?.id, shown?.lang, lang]);
  useEffect(() => {
    if (!shown || !translating || !foreign) return;
    const paragraphs = full.state === "ok" ? full.paragraphs : [];
    if (tx.state === "loading" || (tx.state !== "idle" && (tx.paragraphs?.length ?? 0) >= paragraphs.length)) return;
    const id = shown.id;
    const texts = [shown.title, shown.summary ?? "", ...paragraphs];
    setTx((current) => ({ ...current, state: "loading" }));
    void translateMany(texts, shown.lang, lang).then((out) => {
      if (shownRef.current !== id) return;
      const [title, summary, ...rest] = out;
      setTx({ title: title ?? undefined, summary: summary ?? undefined, paragraphs: rest, state: title || rest.some(Boolean) ? "ok" : "failed" });
    });
  }, [shown, translating, foreign, full, lang, tx.state, tx.paragraphs?.length]);
  const allChecked = checks.every(Boolean);
  useEffect(() => {
    if (allChecked && doneRef.current) gsap.fromTo(doneRef.current, { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.6, ease: "elastic.out(1, 0.5)" });
  }, [allChecked]);
  const rtl = lang === "ar";
  const shownRef = useRef<string | undefined>(undefined);
  shownRef.current = shown?.id;

  // Keep the last story mounted while the exit animation plays.
  useEffect(() => { if (article) setShown(article); }, [article]);

  useLayoutEffect(() => {
    const panel = panelRef.current, backdrop = backdropRef.current;
    if (!panel || !backdrop || !shown) return;
    // A quick close-then-reopen must not let the old exit tween unmount the reader.
    gsap.killTweensOf([panel, backdrop]);
    const from = rtl ? -110 : 110;
    if (article) {
      gsap.fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 });
      gsap.fromTo(panel, { xPercent: from }, { xPercent: 0, duration: 0.55, ease: "expo.out" });
      gsap.fromTo(panel.querySelectorAll(".reader-reveal"), { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.05, delay: 0.12, duration: 0.5, ease: "power3.out" });
    } else {
      gsap.to(backdrop, { autoAlpha: 0, duration: 0.25 });
      gsap.to(panel, { xPercent: from, duration: 0.35, ease: "power2.in", onComplete: () => setShown(null) });
    }
  }, [article, shown, rtl]);

  useEffect(() => {
    if (!article) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [article, onClose]);

  if (!shown) return null;
  const showTx = translating && foreign && tx.state === "ok";
  const title = showTx && tx.title ? tx.title : shown.title;
  const summary = showTx && tx.summary ? tx.summary : shown.summary;
  const qrText = [title, `${sourceLabel(shown)} · ${new Date(shown.publishedAt || shown.seenDate).toISOString().slice(0, 10)}`, summary ? fitBytes(summary, 380) : "", shown.url].filter(Boolean).join("\n");
  const routes = accessRoutes(shown.url, lang === "zh" ? "zh-CN" : lang);
  const blocked = shown.outlet?.blockedIn ?? [];

  const readable = isTrustedHost(shown.destinationHost);
  async function readHere() {
    if (!shown) return;
    const id = shown.id;
    setFull({ state: "loading" });
    try {
      const response = await fetch(`/api/read?url=${encodeURIComponent(shown.url)}`);
      const body = await response.json() as { paragraphs?: string[] };
      if (!response.ok || !body.paragraphs?.length) throw new Error();
      if (shownRef.current === id) setFull({ state: "ok", paragraphs: body.paragraphs });
    } catch {
      if (shownRef.current === id) setFull({ state: "failed" });
    }
  }

  async function share() {
    if (!shown) return;
    try {
      if (navigator.share) await navigator.share({ title: shown.title, url: shown.url });
      else { await navigator.clipboard.writeText(shown.url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* cancelled */ }
  }

  return <div className="reader-root" aria-hidden={!article}>
    <div className="reader-backdrop" ref={backdropRef} onClick={onClose} />
    <div className="reader" ref={panelRef} role="dialog" aria-modal="true" aria-label={shown.title} tabIndex={-1}>
      <button className="reader-close" onClick={onClose} aria-label={t("reader.close")}>✕</button>
      <div className="reader-reveal reader-media">
        {shown.video && !lite
          ? (shown.video.includes("youtube")
            ? <iframe src={shown.video} title={t("reader.video")} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
            : <video src={shown.video} controls playsInline preload="metadata" />)
          : <Cover article={shown} lead lite={lite} />}
      </div>
      <div className="reader-meta reader-reveal">
        <strong>{sourceLabel(shown)}</strong>
        <span>{relativeTime(shown.publishedAt || shown.seenDate, lang)}</span>
        <span>{new Date(shown.seenDate).toLocaleString(lang === "zh" ? "zh-CN" : lang)}</span>
      </div>
      <h2 className="reader-title reader-reveal" dir="auto">{title}</h2>
      {summary && <p className="reader-summary reader-reveal" dir="auto">{summary}</p>}
      {foreign && <div className="reader-translate reader-reveal">
        <button onClick={() => setTranslating((value) => !value)} disabled={tx.state === "loading"}>🌐 {tx.state === "loading" ? t("tr.working") : showTx ? `${t("tr.original")} (${shown.lang!.toUpperCase()})` : t("tr.button")}</button>
        {showTx && <small>{t("tr.auto")}</small>}
        {translating && tx.state === "failed" && <small className="warn">{t("tr.failed")}</small>}
      </div>}

      {shown.kind === "news" && <div className={`reader-trust reader-reveal${shown.confirmedBy?.length ? " ok" : ""}`}>
        {shown.confirmedBy?.length
          ? <><strong>✅ {t("trust.confirmed").replace("{n}", String(shown.confirmedBy.length))}</strong><span>{t("trust.confirmedBy")} {shown.confirmedBy.join(" · ")}</span></>
          : <><strong>⏳</strong><span>{t("trust.unconfirmed")}</span></>}
      </div>}

      <div className="reader-actions reader-reveal">
        <button onClick={() => onSave(shown)} className={saved ? "on" : ""}><Bookmark filled={saved} /> {saved ? t("card.saved") : t("card.save")}</button>
        <button onClick={() => void share()}>🔗 {copied ? t("reader.copied") : t("reader.share")}</button>
        <button onClick={() => setQr((value) => !value)} aria-pressed={qr}>▦ {t("qr.button")}</button>
        {!lite && <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(shown.title)}`} target="_blank" rel="noopener noreferrer">🎬 {t("card.video")}</a>}
      </div>

      {qr && <div className="reader-qr">
        <QrCode text={qrText} label={t("qr.button")} />
        <p>📱 {t("qr.hint")}</p>
      </div>}

      {readable && <section className="reader-reveal reader-full">
        {full.state === "ok"
          ? <><p className="reader-note">📖 {t("reader.readHereHint")}</p><div className="full-text" dir="auto">{full.paragraphs.map((text, index) => <p key={index}>{(showTx && tx.paragraphs?.[index]) || text}</p>)}</div></>
          : <button className="btn btn-primary" onClick={() => void readHere()} disabled={full.state === "loading"}>📖 {full.state === "loading" ? t("reader.reading") : t("reader.readHere")}</button>}
        {full.state === "failed" && <p className="reader-note warn">{t("reader.readFailed")}</p>}
      </section>}

      {blocked.length > 0 && <div className="reader-alert reader-reveal">
        <span>⛔ {t("reader.blockedIn")}</span>
        <strong>{blocked.map((code) => `${flag(code)} ${countryName(code, lang)}`).join(" · ")}</strong>
      </div>}
      {shown.outlet?.stateFunded && <p className="reader-note warn reader-reveal">⚑ {t("reader.stateFunded")}</p>}

      {lite && shown.video && <p className="reader-note reader-reveal">▶ {t("lite.videoHidden")} · <a href={shown.video} target="_blank" rel="noopener noreferrer">↗</a></p>}

      <section className="reader-reveal">
        <h3>{t("reader.routes")}</h3>
        <p className="reader-note">{t("reader.routesHint")}</p>
        <div className="routes">
          {routes.map((route) => <a key={route.id} href={route.href} target="_blank" rel="noopener noreferrer" className={`route route-${route.id}`}>
            <span className="route-icon">{ROUTE_ICON[route.id]}</span>
            <span>{t(`route.${route.id}` as DictKey)}</span>
          </a>)}
        </div>
      </section>

      {shown.mentionedCountries.length > 0 && <section className="reader-reveal">
        <h3>{t("reader.countries")}</h3>
        <div className="reader-countries">
          {shown.mentionedCountries.map((country) => <button key={country.code} onClick={() => { onCountry(country.code); onClose(); }}>
            {flag(country.code)} {countryName(country.code, lang, country.name)}
          </button>)}
        </div>
      </section>}

      <details className="reader-reveal critical">
        <summary>🧠 {t("reader.critical")}</summary>
        {CRITICAL.map((key, index) => <label key={key} className={checks[index] ? "on" : ""}>
          <input type="checkbox" checked={checks[index]} onChange={() => setChecks((current) => current.map((value, i) => i === index ? !value : value))} />
          <span>{t(key)}</span>
        </label>)}
        {allChecked && <p className="critical-done" ref={doneRef}>🎉 {t("critical.done")}</p>}
      </details>

      {related.length > 0 && <section className="reader-reveal">
        <h3>👀 {t("reader.related")}</h3>
        <div className="related">
          {related.map((item) => <button key={item.id} onClick={() => onOpen(item)}>
            <strong dir="auto">{relatedTitles.get(item.id) ?? item.title}</strong>
            <small>{sourceLabel(item)} · {relativeTime(item.publishedAt || item.seenDate, lang)}</small>
          </button>)}
        </div>
      </section>}

    </div>
  </div>;
}
