import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ojo Global — Noticias del mundo en tiempo real",
  description: "Observa todas las noticias del mundo en tiempo real sobre un globo interactivo: limpio, ordenado y con fuentes trazables.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
