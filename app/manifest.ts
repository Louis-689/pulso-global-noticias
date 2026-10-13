import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulso Global",
    short_name: "Pulso",
    description: "El mundo, sin censura. Noticias de todo el planeta en tiempo real.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff8ee",
    theme_color: "#fff8ee",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
