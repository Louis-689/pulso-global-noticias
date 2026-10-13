"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

/** UTF-8 bytes as a binary string: the library writes each char code as one byte. */
const utf8 = (text: string) => String.fromCharCode(...new TextEncoder().encode(text));

/** Trims text to a byte budget so the code stays easy to scan with any phone. */
export function fitBytes(text: string, max: number): string {
  if (new TextEncoder().encode(text).length <= max) return text;
  let out = text;
  while (out && new TextEncoder().encode(`${out}…`).length > max) out = out.slice(0, Math.floor(out.length * 0.9));
  return `${out}…`;
}

/** QR code drawn as SVG cells. Phones read the text straight from the camera, with no Internet. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, "L");
    qr.addData(utf8(text), "Byte");
    qr.make();
    const size = qr.getModuleCount();
    const dark: string[] = [];
    for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) if (qr.isDark(row, col)) dark.push(`M${col + 2} ${row + 2}h1v1h-1z`);
    return { size: size + 4, path: dark.join("") };
  }, [text]);
  return <svg className="qr" viewBox={`0 0 ${cells.size} ${cells.size}`} role="img" aria-label={label} shapeRendering="crispEdges">
    <rect width={cells.size} height={cells.size} fill="#fff" />
    <path d={cells.path} fill="#1d1747" />
  </svg>;
}
