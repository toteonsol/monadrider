import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Monad Rider",
    short_name: "Monad Rider",
    description: "Surf the live price wave. Every carve is a real Perpl trade on Monad.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e091c",
    theme_color: "#0e091c",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
