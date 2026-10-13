import { networkInterfaces } from "node:os";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Addresses where phones on the same Wi‑Fi can open this computer's Pulso Global, with no Internet. */
export async function GET(request: NextRequest) {
  // Only for the computer itself or its own network: a public mirror never reveals its internal addresses.
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (!/^(localhost|127\.\d+\.\d+\.\d+|::1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host)) return NextResponse.json({ urls: [] });
  const port = request.nextUrl.port || "3000";
  const urls = Object.values(networkInterfaces()).flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal && !item.address.startsWith("169.254."))
    .map((item) => `http://${item!.address}:${port}`);
  return NextResponse.json({ urls }, { headers: { "Cache-Control": "no-store" } });
}
