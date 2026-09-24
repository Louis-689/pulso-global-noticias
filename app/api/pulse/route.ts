import { NextRequest, NextResponse } from "next/server";
import { getPulse, parsePulseRequest, PulseBusyError } from "@/lib/pulse-service";

export async function GET(request: NextRequest) {
  try {
    const result = await getPulse(parsePulseRequest(request.nextUrl.searchParams));
    return NextResponse.json(result, { headers: {
      // Refilter internal provider caches against current time on every request.
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const busy = error instanceof PulseBusyError;
    return NextResponse.json({ error: busy ? error.message : "No se pudieron consultar las fuentes. Intenta de nuevo." }, {
      status: busy ? 429 : 503,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(busy ? { "Retry-After": "30" } : {}) },
    });
  }
}
