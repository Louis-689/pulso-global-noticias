import { NextRequest } from "next/server";
import { isAllowedMediaHost } from "@/lib/media-hosts";
import { allowRequest, clientAddress } from "@/lib/rate-limit";
import { safeFetch } from "@/lib/safe-fetch";

export const dynamic = "force-dynamic";

/**
 * Image relay: in countries that block the outlet, its image CDN is often
 * blocked too. Raster images only (no SVG, which can carry scripts), 4 MB cap.
 */
export async function GET(request: NextRequest) {
  if (!allowRequest("img", clientAddress(request.headers), 240)) return new Response(null, { status: 429, headers: { "Retry-After": "30" } });
  const url = request.nextUrl.searchParams.get("url") ?? "";
  const image = await safeFetch(url, { accept: /^image\/(jpeg|png|webp|gif|avif)$/, maxBytes: 4_000_000, timeoutMs: 6_000, allow: (host) => isAllowedMediaHost(host) });
  if (!image) return new Response(null, { status: 404 });
  return new Response(image.bytes as BodyInit, {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
