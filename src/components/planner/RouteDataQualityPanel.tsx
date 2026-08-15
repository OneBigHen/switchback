"use client"

import { Info, Warning, WarningCircle } from "@phosphor-icons/react"
import { useMemo } from "react"
import { computeRouteDataQuality, type RouteDataQuality } from "@/lib/roads/route-data-quality"
import type { PlannedRoute } from "@/lib/routing/types"
import "@/app/styles/route-data-quality-panel.css"

export interface RouteDataQualityPanelSegments {
  miles: number
  hasAccessTag?: boolean
  hasSurfaceTag?: boolean
  hasSmoothnessOrTracktype?: boolean
  seasonalUndated?: boolean
}

export interface RouteDataQualityPanelProps {
  route: PlannedRoute
  segments?: ReadonlyArray<RouteDataQualityPanelSegments>
  sourceMapUpdated?: string | null
}

type CoverageBarKey = "accessCoveragePercent" | "surfaceCoveragePercent" | "conditionCoveragePercent"

const BAR_LABELS: ReadonlyArray<{ key: CoverageBarKey; label: string; caveat: string }> = [
  { key: "accessCoveragePercent", label: "Access", caveat: "Road class & motorcycle access coverage" },
  { key: "surfaceCoveragePercent", label: "Surface", caveat: "Mapped surface type coverage" },
  { key: "conditionCoveragePercent", label: "Condition", caveat: "Smoothness / tracktype coverage" }
]

function tierData(percent: number): "strong" | "warn" | "weak" {
  if (percent >= 90) return "strong"
  if (percent >= 70) return "warn"
  return "weak"
}

function formatDateDescription(iso: string | null): string | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return iso
  return new Date(parsed).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function coveragePercent(result: RouteDataQuality, key: CoverageBarKey): number {
  return result[key]
}

export function RouteDataQualityPanel({ route, segments, sourceMapUpdated }: RouteDataQualityPanelProps) {
  const result = useMemo(
    () => computeRouteDataQuality({ route, segments: segments ?? undefined, sourceMapUpdated }),
    [route, segments, sourceMapUpdated]
  )
  const headlineTier = tierData(result.headlinePercent)
  const updatedLabel = formatDateDescription(result.sourceMapUpdated)
  return (
    <section
      className="route-data-quality-panel"
      aria-label="Route data quality"
      data-headline-tier={headlineTier}
    >
      <header className="route-data-quality-header">
        <div>
          <h3>
            <span data-tier={headlineTier}>{result.headlinePercent}%</span>
            <small>data quality · lowest coverage</small>
          </h3>
        </div>
        {result.seasonalUncertainty ? (
          <span className="route-data-quality-seasonal" data-tier="seasonal">
            <Warning aria-hidden="true" weight="fill" />
            Seasonal uncertainty
          </span>
        ) : null}
      </header>

      <ul className="route-data-quality-bars" aria-label="Coverage bars">
        {BAR_LABELS.map(({ key, label, caveat }) => {
          const percent = coveragePercent(result, key)
          const tier = tierData(percent)
          return (
            <li key={key} className="route-data-quality-bar" data-tier={tier}>
              <div className="route-data-quality-bar-row">
                <span>{label}</span>
                <strong>{percent}%</strong>
              </div>
              <div
                className="route-data-quality-bar-track"
                role="meter"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label} coverage: ${percent} percent`}
                title={caveat}
              >
                <span style={{ width: `${percent}%` }} />
              </div>
            </li>
          )
        })}
      </ul>

      {result.caveats.length > 0 ? (
        <ul className="route-data-quality-caveats" aria-label="Data quality caveats">
          {result.caveats.map((caveat, index) => (
            <li key={index}>
              <WarningCircle aria-hidden="true" />
              <span>{caveat}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="route-data-quality-clean">
          <Info aria-hidden="true" weight="fill" />
          Coverage is solid across access, surface, and condition tags.
        </p>
      )}

      <footer className="route-data-quality-footer">
        <span>
          Source map updated:
          {" "}
          <strong>{updatedLabel ?? "Unknown"}</strong>
        </span>
        {updatedLabel ? <small>{result.sourceMapUpdated}</small> : null}
      </footer>
    </section>
  )
}
