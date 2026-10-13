import { NextRequest, NextResponse } from "next/server";
import { loadText, saveText } from "@/lib/archive";
import { allowRequest, clientAddress } from "@/lib/rate-limit";
import { readArticle } from "@/lib/read-article";

export const dynamic = "force-dynamic";

const cache = new Map<string, { value: object; expires: number }>();

/** "Leer aquí": the mirror fetches a trusted article and returns only its text. Saved texts are served with no Internet. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") ?? "";
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.expires > now) return NextResponse.json(hit.value, { headers: { "Cache-Control": "public, max-age=900" } });
  if (!allowRequest("read", clientAddress(request.headers), 30)) return NextResponse.json({ error: "busy" }, { status: 429, headers: { "Retry-After": "30" } });
  const result = await readArticle(url, now);
  if (!result.ok) {
    if (result.error === "untrusted") return NextResponse.json({ error: "untrusted" }, { status: 400 });
    const saved = await loadText(url);
    if (saved) return NextResponse.json({ ...saved, archived: true }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: result.error }, { status: result.error === "empty" ? 422 : 502 });
  }
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(url, { value: result.value, expires: now + 60 * 60 * 1000 });
  void saveText(url, result.value);
  return NextResponse.json(result.value, { headers: { "Cache-Control": "public, max-age=900" } });
}
