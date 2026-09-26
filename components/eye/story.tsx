"use client";

import { useState } from "react";
import { Activity, FlaskConical, Globe2, ImageIcon, Landmark, PlayCircle } from "lucide-react";
import type { PulseArticle } from "@/lib/pulse-types";
import { kindLabel, preferredMediaUrl, relativeTime, sourceLabel } from "./format";

export function StoryMedia({ article, featured = false, expanded = false }: { article: PulseArticle; featured?: boolean; expanded?: boolean }) {
  const [failedUrl, setFailedUrl] = useState("");
  const media = article.media;
  const preferredUrl = media ? preferredMediaUrl(media.url) : "";
  const [activeUrl, setActiveUrl] = useState(preferredUrl);
  if (!media || failedUrl === media.url) {
    return <div className={`story-media media-fallback ${featured ? "featured" : ""}`} aria-label="La fuente no entregó multimedia para esta noticia">
      {article.kind === "earthquake" ? <Activity /> : article.kind === "preprint" ? <FlaskConical /> : article.kind === "official" ? <Landmark /> : <Globe2 />}
    </div>;
  }
  return <div className={`story-media ${featured ? "featured" : ""} ${media.type}`}>
    {media.type === "video"
      ? <video src={activeUrl} controls={expanded} muted playsInline preload="metadata" onError={() => activeUrl !== media.url ? setActiveUrl(media.url) : setFailedUrl(media.url)} aria-label={`Video publicado por ${media.credit}`} />
      : <>
        {/* Images are remote, source-provided URLs with unknown hosts, so Next Image cannot predeclare them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activeUrl} alt={`Imagen publicada junto a: ${article.title}`} loading={featured || expanded ? "eager" : "lazy"} referrerPolicy="no-referrer" onError={() => activeUrl !== media.url ? setActiveUrl(media.url) : setFailedUrl(media.url)} />
      </>}
    <span className="media-vignette" />
    {featured && <span className="media-provenance">{media.type === "video" ? <PlayCircle /> : <ImageIcon />} Multimedia de la fuente</span>}
  </div>;
}

export function LeadStory({ article, fresh, saved, onOpen, onFocus, onSave }: {
  article: PulseArticle; fresh: boolean; saved: boolean;
  onOpen: (article: PulseArticle) => void; onFocus: (article: PulseArticle) => void; onSave: (article: PulseArticle) => void;
}) {
  return <article className={`lead-story${fresh ? " fresh" : ""}`}>
    <button className="lead-open" onClick={() => onOpen(article)}>
      <StoryMedia key={article.id} article={article} featured />
      <div className="lead-copy">
        <div className="story-meta">
          <span className="kind-chip">{kindLabel(article)}</span>
          {fresh && <span className="fresh-chip">NUEVO</span>}
          <time dateTime={article.publishedAt || article.seenDate}>{relativeTime(article.publishedAt || article.seenDate)}</time>
        </div>
        <h3>{article.title}</h3>
        <div className="story-bottom">
          <span>{sourceLabel(article)}</span>
          {article.mentionedCountries.length > 0 && <span className="country-chips">{article.mentionedCountries.slice(0, 3).map((item) => item.name).join(" · ")}</span>}
        </div>
      </div>
    </button>
    <div className="story-actions">
      <button onClick={() => onFocus(article)} disabled={!article.location && !article.mentionedCountries.length}>Ver en el mapa</button>
      <button onClick={() => onSave(article)} className={saved ? "active" : ""}>{saved ? "Guardada" : "Guardar"}</button>
    </div>
  </article>;
}

export function StoryRow({ article, index, fresh, saved, onOpen, onFocus, onSave }: {
  article: PulseArticle; index: number; fresh: boolean; saved: boolean;
  onOpen: (article: PulseArticle) => void; onFocus: (article: PulseArticle) => void; onSave: (article: PulseArticle) => void;
}) {
  return <article className={`story${fresh ? " fresh" : ""}`}>
    <button className="story-open" onClick={() => onOpen(article)}>
      <StoryMedia article={article} />
      <div className="story-copy">
        <div className="story-meta">
          <span className="story-index">{String(index).padStart(2, "0")}</span>
          {fresh && <span className="fresh-chip">NUEVO</span>}
          <time dateTime={article.publishedAt || article.seenDate}>{relativeTime(article.publishedAt || article.seenDate)}</time>
        </div>
        <h3>{article.title}</h3>
        <div className="story-bottom">
          <span>{sourceLabel(article)}</span>
          {article.mentionedCountries.length > 0 && <span className="country-chips">{article.mentionedCountries.slice(0, 2).map((item) => item.name).join(" · ")}</span>}
        </div>
      </div>
    </button>
    <div className="story-side">
      <button className="icon-action" onClick={() => onFocus(article)} disabled={!article.location && !article.mentionedCountries.length} aria-label="Ver en el mapa" title="Ver en el mapa">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>
      </button>
      <button className={`icon-action${saved ? " active" : ""}`} onClick={() => onSave(article)} aria-label={saved ? "Quitar de guardadas" : "Guardar noticia"} title={saved ? "Quitar de guardadas" : "Guardar"}>
        {saved
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" /></svg>
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" /></svg>}
      </button>
    </div>
  </article>;
}
