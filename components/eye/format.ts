import type { PulseArticle } from "@/lib/pulse-types";

export function relativeTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "hora no publicada";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} d`;
}

export function sourceLabel(article: PulseArticle) {
  return article.sourceName || article.destinationHost || article.domain;
}

export function kindLabel(article: PulseArticle) {
  return article.kind === "earthquake" ? "Sismo" : article.kind === "preprint" ? "Prepublicación" : article.kind === "official" ? "Fuente oficial" : "Noticia";
}

export function evidenceSummary(article: PulseArticle) {
  if (article.kind === "earthquake") return article.reviewStatus === "reviewed"
    ? ["Registro oficial revisado", "USGS revisó el registro del evento; la magnitud y ubicación aún deben leerse en su ficha original."]
    : ["Registro oficial preliminar", "El evento fue publicado por USGS, pero sus parámetros todavía pueden cambiar."];
  if (article.kind === "official") return ["Publicación institucional", "El enlace conduce al organismo que publicó el documento. Su carácter oficial no elimina la necesidad de contexto."];
  if (article.kind === "preprint") return ["Prepublicación científica", "El trabajo es público, pero aquí no consta una revisión por pares. No debe tratarse como consenso científico."];
  return ["Titular indexado", "La presencia en un índice confirma que el titular fue observado, no que todas sus afirmaciones sean verdaderas. Contrasta en la fuente original."];
}

export function preferredMediaUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("bbci.co.uk")) parsed.pathname = parsed.pathname.replace("/standard/240/", "/standard/1024/");
    return parsed.toString();
  } catch {
    return url;
  }
}
