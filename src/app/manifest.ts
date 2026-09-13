import type { MetadataRoute } from "next"
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PRODUCT_BRAND.name} Motorcycle Routes`,
    short_name: PRODUCT_BRAND.shortName,
    description: PRODUCT_BRAND.functionalTagline,
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
