import type { GpxIntelligenceReport } from "@/lib/gpx/intelligence"

function percentage(value: number | null): string {
  return value === null ? "Not quantified" : `${value}%`
}

function evidenceLabel(
  evidence: GpxIntelligenceReport["surface"],
  emptyLabel: string
): string {
  if (evidence.status === "unknown" || Object.keys(evidence.distribution).length === 0) return emptyLabel
  return Object.entries(evidence.distribution)
    .sort((left, right) => right[1] - left[1])
    .map(([name, share]) => `${Math.round(share)}% ${name.replaceAll("_", " ")}`)
    .join(" · ")
}

function matchLabel(report: GpxIntelligenceReport): string {
  if (report.match.status === "unmatched") return "No provider path"
  if (report.match.status === "not-configured") return "Not evaluated"
  if (report.match.status === "failed" || report.match.status === "cancelled") return "Provider unavailable"
  return report.match.matchPercent === null ? "Provider path; point coverage not quantified" : percentage(report.match.matchPercent)
}

export function GpxIntelligencePanel({ report }: { report: GpxIntelligenceReport }) {
  const duration = report.durationMinutes === null ? "Unavailable" : `${Math.round(report.durationMinutes)} min`
  const elevation = report.elevation.ascentMeters === null && report.elevation.descentMeters === null
    ? "Unavailable"
    : `↑ ${Math.round(report.elevation.ascentMeters ?? 0)} m · ↓ ${Math.round(report.elevation.descentMeters ?? 0)} m`

  return (
    <section className="gpx-intelligence-panel" aria-label="GPX intelligence">
      <header>
        <div>
          <h3>Measured track report</h3>
        </div>
        <span className="gpx-confidence" data-level={report.dataConfidence.level}>
          {report.dataConfidence.level} confidence
        </span>
      </header>

      <div className="gpx-intelligence-metrics" aria-label="GPX measured metrics">
        <span><strong>{(report.distanceMeters / 1_609.344).toFixed(1)}</strong><small>miles</small></span>
        <span><strong>{duration}</strong><small>recorded duration</small></span>
        <span><strong>{matchLabel(report)}</strong><small>match evidence</small></span>
        <span><strong>{percentage(report.match.unmatchedPercent)}</strong><small>unmatched</small></span>
      </div>

      <p className="gpx-intelligence-description">{report.groundedDescription}</p>

      <ul className="gpx-intelligence-facts">
        <li><strong>Surface evidence</strong><span>{evidenceLabel(report.surface, "Unavailable from this GPX")}</span></li>
        <li><strong>Road classes</strong><span>{evidenceLabel(report.roadClasses, "Unavailable from this GPX")}</span></li>
        <li><strong>Elevation</strong><span>{elevation}</span></li>
        <li><strong>Other overlap</strong><span>{report.mappedMvumOverlapPercent === null && report.communityCorridorOverlapPercent === null ? "MVUM and community overlap not evaluated" : `${percentage(report.mappedMvumOverlapPercent)} MVUM · ${percentage(report.communityCorridorOverlapPercent)} community`}</span></li>
        {report.unmatchedSpans.length > 0 ? <li><strong>Track-only spans</strong><span>{report.unmatchedSpans.length} · no invented turns or reroute</span></li> : null}
        {report.gapSpans.length > 0 ? <li><strong>GPS gaps</strong><span>{report.gapSpans.length} retained; segment boundaries stay separate</span></li> : null}
      </ul>

      {report.creatorNotes ? <p className="gpx-intelligence-notes"><strong>Creator notes</strong>{report.creatorNotes}</p> : null}
    </section>
  )
}
