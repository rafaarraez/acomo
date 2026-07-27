import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "¿A Cómo?",
    short_name: "¿A Cómo?",
    description:
      "¿A cómo está hoy? Calcula tu cambio y comparte, en un toque.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0b12",
    theme_color: "#0a0b12",
    lang: "es-VE",
    categories: ["finance", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
