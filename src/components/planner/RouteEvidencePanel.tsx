import { CheckCircle, Info, WarningCircle } from "@phosphor-icons/react"
import type { PlannedRoute } from "@/lib/routing/types"
import { PA_UNPAVED_ROADS_PROVENANCE } from "@/lib/client/map-layers"

const UNPAVED = new Set(["compacted", "dirt", "earth", "fine_gravel", "grass", "gravel", "ground", "mud", "sand", "unpaved"])

function unpavedPercent(route: PlannedRoute): number {
  return Math.round(Object.entries(route.surfaceMix).reduce(
    (sum, [surface, percent]) => sum + (UNPAVED.has(surface.toLowerCase()) ? percent : 0), 0
  ))
}

function hasKnownSurfaceData(route: PlannedRoute): boolean {
  return Object.entries(route.surfaceMix).some(
    ([surface, share]) => surface.toLowerCase() !== "unknown" && Number.isFinite(share) && share > 0
  )
}

export function RouteEvidencePanel({ route }: { route: PlannedRoute }) {
  const survey = route.officialUnpavedEvidence
  const hasSurfaceData = hasKnownSurfaceData(route)
  const hasSurveyOverlap = Boolean(survey && survey.sharePercent > 0)
  return (
    <section className="route-evidence" aria-label="Why this route was chosen">
      <div className="section-heading compact">
        <div>
          <h3>Why this line</h3>
        </div>
        <Info aria-hidden="true" />
      </div>
      <ul>
        <li><CheckCircle aria-hidden="true" /><span><strong>Road character</strong>{Math.round(route.twistiness)}/100 curve signal · {route.turnCount} mapped turns</span></li>
        <li>{hasSurfaceData ? <CheckCircle aria-hidden="true" /> : <Info aria-hidden="true" />}<span><strong>Surface mix</strong>{hasSurfaceData
          ? `${unpavedPercent(route)}% non-paved mix from routing tags; verify conditions before committing.`
          : "Surface data unavailable."}</span></li>
        <li>{hasSurveyOverlap ? <CheckCircle aria-hidden="true" /> : <Info aria-hidden="true" />}<span><strong>Unpaved-road survey</strong>{survey
          ? hasSurveyOverlap
            ? `${survey.sharePercent.toFixed(1)}% overlaps ${PA_UNPAVED_ROADS_PROVENANCE}; historic surveyed/mapped unpaved-surface overlap only — not legal/public access, passability, maintenance, or current openness.`
            : `0% overlap with ${PA_UNPAVED_ROADS_PROVENANCE}; an informational zero-overlap result—access, passability, maintenance, and current openness remain unknown; routing/OSM surface evidence remains separate.`
          : `${PA_UNPAVED_ROADS_PROVENANCE} survey overlap unavailable; absence is not a confirmed zero and does not replace routing/OSM surface evidence.`}</span></li>
        <li><Info aria-hidden="true" /><span><strong>Weather</strong>Forecast and alerts are shown separately with their source and update time.</span></li>
        <li><WarningCircle aria-hidden="true" /><span><strong>Traffic and closures</strong>Never inferred when a live licensed/agency feed is unavailable; check the Map Studio source status.</span></li>
      </ul>
    </section>
  )
}
