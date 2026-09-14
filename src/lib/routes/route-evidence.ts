/**
 * One evidence vocabulary for every inferred route property OpenGravel shows.
 *
 * The rule the design contract cares about is that confidence is *per metric*:
 * a strong curvature score says nothing about whether the surface mix was ever
 * measured, and nothing here may promote an unevaluated property into a
 * confident rider-facing claim to fill a layout.
 */

import type { GpxIntelligenceReport } from "@/lib/gpx/intelligence"

export type EvidenceLevel = "verified" | "estimated" | "unknown"

export interface MetricEvidence {
  readonly level: EvidenceLevel
  /** Rider-facing word: `Verified`, `Estimated` or `Unknown`. */
  readonly label: string
  /** Short plain-language reason, for tooltips and screen readers. */
  readonly basis: string
}

const LABELS: Readonly<Record<EvidenceLevel, string>> = {
  verified: "Verified",
  estimated: "Estimated",
  unknown: "Unknown"
}

function evidence(level: EvidenceLevel, basis: string): MetricEvidence {
  return { level, label: LABELS[level], basis }
}

export interface SurfaceEvidenceInput {
  /** Measured evidence from the imported track, when the importer produced it. */
  readonly intelligence?: Pick<GpxIntelligenceReport, "surface"> | null
  /** Coarse mix stored on the route record by older imports. */
  readonly storedMix?: Record<string, number> | null
}

export interface SurfaceEvidence extends MetricEvidence {
  /** Percentage shares by surface name, or null when nothing is known. */
  readonly distribution: ReadonlyArray<readonly [string, number]> | null
  /** Unpaved share 0..1, only when the evidence actually supports a number. */
  readonly unpavedShare: number | null
}

const UNPAVED_KEYS = new Set([
  "gravel",
  "unpaved",
  "dirt",
  "ground",
  "compacted",
  "sand",
  "grass",
  "fine gravel",
  "fine_gravel",
  "earth",
  "mud"
])

function normalizeDistribution(source: Record<string, number>): Array<readonly [string, number]> {
  const total = Object.values(source).reduce((sum, value) => sum + Math.max(0, value), 0)
  if (!(total > 0)) return []
  return Object.entries(source)
    .map(([name, value]): readonly [string, number] => [name.replaceAll("_", " "), (Math.max(0, value) / total) * 100])
    .filter(([, share]) => share >= 0.5)
    .sort((left, right) => right[1] - left[1])
}

function unpavedShareOf(distribution: ReadonlyArray<readonly [string, number]>): number {
  return distribution
    .filter(([name]) => UNPAVED_KEYS.has(name.toLowerCase()))
    .reduce((sum, [, share]) => sum + share, 0) / 100
}

/**
 * Surface is `Verified` only when the import actually carried surface evidence
 * — either tagged in the GPX itself or matched against road data. A coarse
 * stored mix from an older import is `Estimated`; nothing at all is `Unknown`,
 * and an unknown surface never gets a percentage.
 */
export function surfaceEvidence(input: SurfaceEvidenceInput): SurfaceEvidence {
  const measured = input.intelligence?.surface
  if (measured && measured.status === "known" && Object.keys(measured.distribution).length > 0) {
    const distribution = normalizeDistribution(measured.distribution)
    if (distribution.length > 0) {
      return {
        ...evidence(
          "verified",
          measured.source === "gpx"
            ? "Surface tags came with the imported track."
            : "Surface was matched against road data."
        ),
        distribution,
        unpavedShare: unpavedShareOf(distribution)
      }
    }
  }

  if (input.storedMix && Object.keys(input.storedMix).length > 0) {
    const distribution = normalizeDistribution(input.storedMix)
    if (distribution.length > 0) {
      return {
        ...evidence("estimated", "Derived from the import's coarse surface summary."),
        distribution,
        unpavedShare: unpavedShareOf(distribution)
      }
    }
  }

  return {
    ...evidence("unknown", "Surface was never evaluated for this track."),
    distribution: null,
    unpavedShare: null
  }
}

/** Short rider-facing surface phrase that never invents a percentage. */
export function surfaceSummaryLabel(surface: SurfaceEvidence): string {
  if (surface.level === "unknown" || surface.unpavedShare === null) return "Surface unknown"
  const percent = Math.round(surface.unpavedShare * 100)
  if (percent >= 60) return `${percent}% unpaved`
  if (percent >= 5) return `${percent}% unpaved`
  return "Mostly paved"
}

export interface DurationEvidence extends MetricEvidence {
  readonly minutes: number | null
}

/**
 * A recorded moving time is `Verified`. With no recorded time the ride still
 * needs a plannable number, so one is derived from distance — and labelled
 * `Estimated`, never shown as if it were measured.
 */
export function durationEvidence(input: {
  readonly recordedMinutes: number | null | undefined
  readonly distanceMiles: number
  readonly durationSource?: GpxIntelligenceReport["durationSource"] | null
}): DurationEvidence {
  const recorded = input.recordedMinutes
  if (typeof recorded === "number" && Number.isFinite(recorded) && recorded > 0) {
    return {
      ...evidence("verified", "Moving time came from the recorded track."),
      minutes: recorded
    }
  }
  if (!Number.isFinite(input.distanceMiles) || input.distanceMiles <= 0) {
    return { ...evidence("unknown", "No recorded time and no usable distance."), minutes: null }
  }
  // 34 mph average: a backroad/gravel pace, deliberately not a highway pace.
  return {
    ...evidence("estimated", "Estimated from distance at a backroad pace; this track carried no time."),
    minutes: Math.round((input.distanceMiles / 34) * 60)
  }
}

/**
 * Curvature is computed from the mapped line itself, so it is verified whenever
 * there is enough line to measure. It says nothing about surface.
 */
export function twistinessEvidence(input: {
  readonly twistiness: number
  readonly turnCount: number
}): MetricEvidence {
  if (!Number.isFinite(input.twistiness) || input.turnCount <= 0) {
    return evidence("unknown", "Not enough mapped line to measure corners.")
  }
  return evidence("verified", "Measured from the route's own mapped geometry.")
}

export interface TrackConfidence {
  readonly level: "high" | "medium" | "low" | "unknown"
  readonly headline: string
  readonly detail: string
  readonly basis: readonly string[]
}

/**
 * Track integrity, phrased for a rider deciding whether to commit to a ride
 * rather than for someone auditing an importer. Diagnostics stay available
 * underneath; this is the one line that belongs on the decision surface.
 */
export function trackConfidence(report: GpxIntelligenceReport | null | undefined): TrackConfidence {
  if (!report) {
    return {
      level: "unknown",
      headline: "Track not analysed",
      detail: "This track has not been checked for gaps or unmapped roads.",
      basis: []
    }
  }
  const gaps = report.gapSpans.length
  const unmatched = report.unmatchedSpans.length
  const level = report.dataConfidence.level
  if (level === "high") {
    return {
      level,
      headline: "Good confidence",
      detail: "This track matches mapped roads closely with no recorded gaps.",
      basis: report.dataConfidence.basis
    }
  }
  if (level === "medium") {
    return {
      level,
      headline: "Usable confidence",
      detail: gaps > 0 || unmatched > 0
        ? "Most of this track matches mapped roads; a few spans are gaps or unmapped."
        : "This track is usable, though the road match is not complete.",
      basis: report.dataConfidence.basis
    }
  }
  return {
    level: "low",
    headline: "Lower confidence",
    detail: "This track has some GPS gaps or may follow unmapped roads.",
    basis: report.dataConfidence.basis
  }
}
