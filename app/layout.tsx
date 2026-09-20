import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulso Global — Noticias sobre el planeta",
  description: "Observatorio geográfico de noticias mundiales con datos en vivo de GDELT.",
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
