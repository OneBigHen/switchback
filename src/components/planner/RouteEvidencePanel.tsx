import { CheckCircle, Info, WarningCircle } from "@phosphor-icons/react"
import type { PlannedRoute } from "@/lib/routing/types"

const UNPAVED = new Set(["compacted", "dirt", "earth", "fine_gravel", "grass", "gravel", "ground", "mud", "sand", "unpaved"])

function unpavedPercent(route: PlannedRoute): number {
  return Math.round(Object.entries(route.surfaceMix).reduce(
    (sum, [surface, percent]) => sum + (UNPAVED.has(surface.toLowerCase()) ? percent : 0), 0
  ))
}

export function RouteEvidencePanel({ route }: { route: PlannedRoute }) {
  const official = route.officialUnpavedEvidence
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
        <li><CheckCircle aria-hidden="true" /><span><strong>Surface mix</strong>{unpavedPercent(route)}% non-paved mix from routing tags; verify conditions before committing.</span></li>
        <li>{official ? <CheckCircle aria-hidden="true" /> : <Info aria-hidden="true" />}<span><strong>Access evidence</strong>{official
          ? `${official.sharePercent.toFixed(1)}% aligns with official PA unpaved-road data.`
          : "No official access overlay matched this route in the current region."}</span></li>
        <li><Info aria-hidden="true" /><span><strong>Weather</strong>Forecast and alerts are shown separately with their source and update time.</span></li>
        <li><WarningCircle aria-hidden="true" /><span><strong>Traffic and closures</strong>Never inferred when a live licensed/agency feed is unavailable; check the Map Studio source status.</span></li>
      </ul>
    </section>
  )
}
