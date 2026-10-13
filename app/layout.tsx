import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
// Fonts ship with the app: no request to Google, which is blocked or watched in some countries.
import "@fontsource/bricolage-grotesque/600.css";
import "@fontsource/bricolage-grotesque/800.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulso Global · El mundo, sin censura",
  description: "Centro global de noticias en tiempo real: titulares de todo el planeta, medios bloqueados en algunos países y rutas alternativas para leerlos. En 11 idiomas.",
  applicationName: "Pulso Global",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg" },
  openGraph: { title: "Pulso Global", description: "El mundo, sin censura. Noticias de todo el planeta en tiempo real.", type: "website" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fff8ee",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}<ServiceWorker /></body>
    </html>
  );
}
