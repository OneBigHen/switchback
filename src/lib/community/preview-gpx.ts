import type { CommunityRouteView } from "./repository"

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

/** Export only the stored, server-validated public preview segments. */
export function communityPreviewToGpx(route: CommunityRouteView): string {
  const segments = route.preview.geometry.map((segment) => `    <trkseg>\n${segment
    .map(([longitude, latitude]) => `      <trkpt lat="${latitude}" lon="${longitude}"/>`)
    .join("\n")}\n    </trkseg>`).join("\n")
  const description = `${route.preview.distanceMiles.toFixed(1)} mi · ${Math.round(route.preview.durationMinutes)} min · sanitized public preview`
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Switchback" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.title)}</name>
    <desc>${escapeXml(description)}</desc>
  </metadata>
  <trk>
    <name>${escapeXml(route.title)}</name>
${segments}
  </trk>
</gpx>`
}
