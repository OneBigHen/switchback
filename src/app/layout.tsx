import type { Metadata, Viewport } from "next";
// Both renderer stylesheets ship while the premium migration runs (ADR 0015).
// Their class prefixes differ, so neither can override the other.
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import "./styles/planner-shell.css";
import "./styles/waypoint-field.css";
import "./styles/planner-controls.css";
import "./styles/route-comparison.css";
import "./styles/ride-hud.css";
import "./styles/storage-quota-meter.css";
import "./styles/download-mode-picker.css";
import "./styles/region-suite-picker.css";
import "./styles/region-downloads.css";
import "./styles/planner-deck.css";
import "./styles/planner-action-dock.css";
import "./styles/ride-omnibox.css";
import "./styles/map-layer-control.css";
import "./styles/trip-stage-panel.css";
import "./styles/route-share-panel.css";
import "./styles/route-evidence-panel.css";
import "./styles/route-weather.css";
import "./styles/route-rating.css";
import "./styles/breakpoints.css";
// Record preflight + shared destination-panel surface, recovered from the
// retired switchback-v1.css. Loads before design-system.css so the V2
// design layer keeps the last word.
import "./styles/record-panel.css";
// Recovered from library-drawer.css / profile-panel.css, which were deleted
// as retired authorities while these surfaces were still live.
import "./styles/ride-recording-hud.css";
import "./styles/diagnostics-panel.css";
import "./styles/design-system.css";
// V2 shell chrome (primary navigation and destination framing; discover
// placeholder). Consumes tokens.css only; replaces the retired nav blocks
// that previously lived in switchback-v1.css and design-system.css.
import "./styles/shell-v2.css";
import "./styles/plan-v2.css";
import "./styles/community.css";
import "./styles/route-atlas.css";
// Loads last: the Free Ride panel neutralises the older per-breakpoint
// absolute offsets that its own earlier rules still declare.
import "./styles/free-ride.css";
// Placement target geometry depends on V2 sheet detents and intentionally
// overrides the stale fixed-deck crosshair offsets from planner-shell.css.
import "./styles/map-placement.css";

export const metadata: Metadata = {
	title: "Switchback — Ride the better road",
	description:
		"A local-first motorcycle route planner built for twisty, scenic, and mixed-surface roads.",
	applicationName: "Switchback",
	manifest: "/manifest.webmanifest",
	icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }],
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	themeColor: "#F4F0E7", // V2 Canvas (design/DESIGN-CONTRACT.md §3)
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
