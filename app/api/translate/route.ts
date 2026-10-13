import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientAddress } from "@/lib/rate-limit";
import { parseTranslateBody, translateText } from "@/lib/translate";

export const dynamic = "force-dynamic";

/** Translates headlines and article text into the reader's language. */
export async function POST(request: NextRequest) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 20_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { /* invalid */ }
  const input = parseTranslateBody(body);
  if (!input) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!allowRequest("translate", clientAddress(request.headers), 40)) return NextResponse.json({ error: "busy" }, { status: 429, headers: { "Retry-After": "30" } });
  const texts: Array<string | null> = new Array(input.texts.length).fill(null);
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < input.texts.length) {
      const index = cursor++;
      texts[index] = input.texts[index].trim() ? await translateText(input.texts[index], input.from, input.to) : input.texts[index];
    }
  }));
  return NextResponse.json({ texts });
}
