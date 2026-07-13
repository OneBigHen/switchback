import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Switchback Motorcycle Routes",
    short_name: "Switchback",
    description: "Find the road worth riding.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0E0D",
    theme_color: "#0B0E0D",
    orientation: "any",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
    ]
  }
}
