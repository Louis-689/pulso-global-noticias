import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulso Global — Ojo Global",
    short_name: "Pulso Global",
    description: "Atlas geoespacial de noticias públicas recientes, fuentes trazables y señales verificables.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#e8e2cf",
    theme_color: "#167f7b",
    orientation: "any",
    categories: ["news", "utilities", "education"],
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
