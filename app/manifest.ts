import type { MetadataRoute } from "next";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "La Nueva Guardia";
const primaryColor = process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? "#012f77";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName,
    short_name: appName.length > 16 ? "Club Cuotas" : appName,
    description:
      "Sistema web para administrar cuotas, jugadores, cobranzas y cash flow de un club deportivo.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: primaryColor,
    orientation: "portrait-primary",
    categories: ["business", "finance", "sports"],
    icons: [
      {
        src: "/brand/escudo-la-nueva-guardia.png",
        sizes: "1024x918",
        type: "image/png",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
