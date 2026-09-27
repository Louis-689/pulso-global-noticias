import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ojo Global — Noticias del mundo en tiempo real",
  description: "Observa todas las noticias del mundo en tiempo real sobre un globo interactivo: limpio, ordenado y con fuentes trazables.",
  applicationName: "Pulso Global",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Pulso Global" },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e8e2cf",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
