import { NextRequest, NextResponse } from "next/server";
import { loadPulse, savePulse, warmTexts } from "@/lib/archive";
import { getPulse, parsePulseRequest, PulseBusyError } from "@/lib/pulse-service";
import { readArticle } from "@/lib/read-article";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const pulse = parsePulseRequest(request.nextUrl.searchParams);
  const key = JSON.stringify(pulse);
  const lang = pulse.lang ?? "es";
  // With no Internet every source fails: serve the last news saved on this computer.
  const fromArchive = async () => {
    const saved = await loadPulse(key, pulse.mode, lang);
    return saved ? NextResponse.json(saved, { headers: { "Cache-Control": "no-store", "x-pulso-offline": "1" } }) : null;
  };
  try {
    const result = await getPulse(pulse);
    if (!result.articles.length && result.errors.length) {
      const saved = await fromArchive();
      if (saved) return saved;
    }
    void savePulse(key, pulse.mode, lang, result).then(() => {
      if (pulse.mode === "news") void warmTexts(result.articles.filter((article) => article.kind === "news").map((article) => article.url), readArticle);
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const busy = error instanceof PulseBusyError;
    if (!busy) { const saved = await fromArchive(); if (saved) return saved; }
    return NextResponse.json({ error: busy ? error.message : "No se pudieron consultar las fuentes. Intenta de nuevo." }, {
      status: busy ? 429 : 503,
      headers: { "Cache-Control": "no-store", ...(busy ? { "Retry-After": "30" } : {}) },
    });
  }
}
