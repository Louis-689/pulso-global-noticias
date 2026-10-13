"use client";

import { useState } from "react";
import { flag, preferredMediaUrl, relativeTime, sourceLabel } from "@/lib/format";
import type { DictKey, Lang } from "@/lib/i18n";
import type { PulseArticle } from "@/lib/pulse-types";
import { topicOf } from "@/lib/topics";

type Props = {
  article: PulseArticle;
  lang: Lang;
  t: (key: DictKey) => string;
  lead?: boolean;
  fresh?: boolean;
  saved?: boolean;
  onOpen: (article: PulseArticle) => void;
  onSave: (article: PulseArticle, origin?: HTMLElement) => void;
  lite?: boolean;
};

export function Bookmark({ filled }: { filled?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" /></svg>;
}

/** Cover: the publisher's own image, or a colorful illustrated poster when it sent none. */
/** Images go through the mirror first: in closed countries the outlet's CDN is often blocked too. */
const relayed = (url: string) => `/api/img?url=${encodeURIComponent(preferredMediaUrl(url))}`;

export function Cover({ article, lead, lite }: { article: PulseArticle; lead?: boolean; lite?: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [mediaUrl, setMediaUrl] = useState(article.media?.url);
  // The reader reuses one Cover for many stories: retry from the mirror for each new image.
  if (mediaUrl !== article.media?.url) { setMediaUrl(article.media?.url); setAttempt(0); }
  const failed = attempt > 1 || lite;
  const topic = topicOf(article.topic);
  const country = article.mentionedCountries[0]?.code ?? "";
  const image = article.media?.type === "image" && !failed;
  return <div className={`cover${image ? "" : " cover-art"}`} style={{ "--tc": topic.color } as React.CSSProperties}>
    {image
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={attempt === 0 ? relayed(article.media!.url) : preferredMediaUrl(article.media!.url)} alt="" loading={lead ? "eager" : "lazy"} referrerPolicy="no-referrer" onError={() => setAttempt((value) => value + 1)} />
      : <>
        <span className="cover-icon" aria-hidden="true">{topic.icon}</span>
        {country && <span className="cover-flag" aria-hidden="true">{flag(country)}</span>}
        <span className="cover-word" aria-hidden="true">{sourceLabel(article)}</span>
      </>}
    {article.video && <span className="play" aria-hidden="true"><i /></span>}
  </div>;
}

export function StoryCard({ article, lang, t, lead, fresh, saved, onOpen, onSave, lite }: Props) {
  const blocked = article.outlet?.blockedIn ?? [];
  const topic = topicOf(article.topic);
  return <article className={`card${lead ? " card-lead" : ""}${fresh ? " is-fresh" : ""}`} style={{ "--tc": topic.color } as React.CSSProperties} data-id={article.id}>
    <button className="card-hit" onClick={() => onOpen(article)} aria-label={`${t("card.read")}: ${article.title}`}>
      <Cover article={article} lead={lead} lite={lite} />
      <div className="card-body">
        <div className="card-meta">
          {article.topic && <span className="topic-tag">{topic.icon} {t(`cat.${article.topic}` as DictKey)}</span>}
          {article.confirmedBy?.length ? <span className="badge badge-ok" title={t("trust.confirmed").replace("{n}", String(article.confirmedBy.length))}>✅ {article.confirmedBy.length + 1}</span> : null}
          {article.video && <span className="badge badge-video">▶ {t("card.video")}</span>}
          {fresh && <span className="badge badge-new">{t("feed.new")}</span>}
        </div>
        <h3 className="card-title" dir="auto">{article.title}</h3>
        <div className="card-foot">
          <span className="card-source">{sourceLabel(article)}</span>
          <time dateTime={article.seenDate}>{relativeTime(article.publishedAt || article.seenDate, lang)}</time>
        </div>
        {(blocked.length > 0 || article.outlet?.stateFunded || article.mentionedCountries.length > 0) && <div className="card-tags">
          {blocked.length > 0 && <span className="badge badge-blocked" title={t("reader.blockedIn")}>🔒 {blocked.map(flag).join(" ")}</span>}
          {article.outlet?.stateFunded && <span className="badge badge-state">⚑</span>}
          {article.mentionedCountries.slice(0, 3).map((country) => <span key={country.code} className="badge">{flag(country.code)} {country.code}</span>)}
        </div>}
      </div>
    </button>
    <button className={`card-save${saved ? " on" : ""}`} onClick={(event) => onSave(article, event.currentTarget)} aria-pressed={saved} aria-label={saved ? t("card.saved") : t("card.save")}>
      <Bookmark filled={saved} />
    </button>
  </article>;
}
