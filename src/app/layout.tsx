import type { Metadata, Viewport } from "next"
import "maplibre-gl/dist/maplibre-gl.css"
import "./globals.css"
import "./styles/planner-shell.css"
import "./styles/waypoint-field.css"
import "./styles/planner-controls.css"
import "./styles/route-comparison.css"
import "./styles/library-drawer.css"
import "./styles/profile-panel.css"
import "./styles/ride-hud.css"
import "./styles/storage-quota-meter.css"
import "./styles/download-mode-picker.css"
import "./styles/region-suite-picker.css"
import "./styles/region-downloads.css"
import "./styles/planner-deck.css"
import "./styles/planner-action-dock.css"
import "./styles/ride-omnibox.css"
import "./styles/map-layer-control.css"
import "./styles/trip-stage-panel.css"
import "./styles/route-share-panel.css"
import "./styles/route-evidence-panel.css"
import "./styles/route-weather.css"
import "./styles/route-rating.css"
import "./styles/breakpoints.css"
import "./styles/switchback-v1.css"
import "./styles/design-system.css"
import "./styles/community.css"

export const metadata: Metadata = {
  title: "Switchback — Ride the better road",
  description: "A local-first motorcycle route planner built for twisty, scenic, and mixed-surface roads.",
  applicationName: "Switchback",
  manifest: "/manifest.webmanifest",
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }]
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F8FB"
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
