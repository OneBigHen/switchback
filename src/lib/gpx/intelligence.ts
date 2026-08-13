import { analyzeGeometry, haversine, type GeometryAnalysis } from "../routing/scoring"
import type { Coordinate } from "../routing/types"
import type { GpxMapMatchResult } from "./map-matching"
import type { NormalizedGpxRoute } from "./corpus-ingest"

export type GpxEvidenceStatus = "known" | "unknown"

export interface GpxEvidenceDistribution {
  status: GpxEvidenceStatus
  distribution: Record<string, number>
  source: "gpx" | "graphhopper" | "not-available"
}

export interface GpxUnmatchedSpan {
  fromPoint: number
  toPoint: number
  distanceMeters: number
  reason: "map-match-no-path"
  navigation: "track-only"
}

export interface GpxGapSpan {
  fromPoint: number
  toPoint: number
  distanceMeters: number
  reason: "teleport" | "segment-boundary"
}

export interface GpxIntelligenceInput {
  geometry: Coordinate[]
  segments: Coordinate[][]
  segmentStarts: number[]
  distanceMeters: number
  durationMinutes: number
  ascentMeters: number | null
  descentMeters: number | null
  gapCount?: number
  invalidPointCount?: number
  dedupedPointCount?: number
  creatorNotes?: string | null
}

export interface GpxIntelligenceReport {
  version: 1
  distanceMeters: number
  durationMinutes: number | null
  durationSource: "timestamps" | "unavailable"
  elevation: {
    ascentMeters: number | null
    descentMeters: number | null
  }
  curvature: GeometryAnalysis
  ingest: {
    pointCount: number
    segmentCount: number
    invalidPointCount: number | null
    dedupedPointCount: number | null
    gapCount: number
  }
  match: {
    status: GpxMapMatchResult["status"]
    provider: GpxMapMatchResult["provider"]
    profile: string | null
    matchedDistanceMeters: number | null
    matchPercent: number | null
    unmatchedPercent: number | null
    basis: "provider-path" | "snapped-waypoints" | "no-path" | "not-evaluated" | "provider-failure"
  }
  unmatchedSpans: GpxUnmatchedSpan[]
  gapSpans: GpxGapSpan[]
  surface: GpxEvidenceDistribution
  roadClasses: GpxEvidenceDistribution
  mappedMvumOverlapPercent: number | null
  communityCorridorOverlapPercent: number | null
  likelyFuelGaps: {
    status: "unknown"
    reason: string
  }
  dataConfidence: {
    level: "high" | "medium" | "low"
    basis: string[]
  }
  creatorNotes?: string
  groundedDescription: string
}

const MAX_UNMATCHED_SPANS = 256
const MAX_GAP_SPANS = 256
const MAX_CREATOR_NOTES = 2_000
const MAX_DESCRIPTION = 4_000
const MAX_GAP_METERS = 250

function boundedText(value: string | null | undefined, max: number): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim().slice(0, max)
  return normalized || undefined
}

function gapSpans(input: GpxIntelligenceInput): GpxGapSpan[] {
  const spans: GpxGapSpan[] = []
  for (const [segmentIndex, segment] of input.segments.entries()) {
    const start = input.segmentStarts[segmentIndex] ?? 0
    for (let index = 1; index < segment.length; index += 1) {
      const distance = haversine(segment[index - 1]!, segment[index]!)
      if (distance > MAX_GAP_METERS && spans.length < MAX_GAP_SPANS) {
        spans.push({
          fromPoint: start + index - 1,
          toPoint: start + index,
          distanceMeters: Number(distance.toFixed(1)),
          reason: "teleport"
        })
      }
    }
    if (segmentIndex > 0 && spans.length < MAX_GAP_SPANS) {
      const previousStart = input.segmentStarts[segmentIndex - 1] ?? 0
      const previousSegment = input.segments[segmentIndex - 1] ?? []
      const previousEnd = previousStart + previousSegment.length - 1
      const currentStart = start
      const distance = input.geometry[previousEnd] && input.geometry[currentStart]
        ? haversine(input.geometry[previousEnd]!, input.geometry[currentStart]!)
        : 0
      if (distance > MAX_GAP_METERS) {
        spans.push({
          fromPoint: previousEnd,
          toPoint: currentStart,
          distanceMeters: Number(distance.toFixed(1)),
          reason: "segment-boundary"
        })
      }
    }
  }
  return spans
}

function matchFacts(match: GpxMapMatchResult, inputPointCount: number): GpxIntelligenceReport["match"] {
  if (match.status === "matched") {
    const hasSnappedCount = Number.isFinite(match.snappedWaypointCount)
    const matchPercent = hasSnappedCount
      ? Math.round(Math.max(0, Math.min(100, (match.snappedWaypointCount! / Math.max(1, inputPointCount)) * 100)))
      : null
    return {
      status: match.status,
      provider: match.provider,
      profile: match.profile,
      matchedDistanceMeters: match.matchedDistanceMeters ?? null,
      matchPercent,
      unmatchedPercent: matchPercent === null ? null : 100 - matchPercent,
      basis: hasSnappedCount ? "snapped-waypoints" : "provider-path"
    }
  }
  if (match.status === "unmatched") {
    return {
      status: match.status,
      provider: match.provider,
      profile: match.profile,
      matchedDistanceMeters: null,
      matchPercent: 0,
      unmatchedPercent: 100,
      basis: "no-path"
    }
  }
  return {
    status: match.status,
    provider: match.provider,
    profile: match.profile,
    matchedDistanceMeters: match.matchedDistanceMeters ?? null,
    matchPercent: null,
    unmatchedPercent: null,
    basis: match.status === "not-configured" ? "not-evaluated" : "provider-failure"
  }
}

function confidence(
  input: GpxIntelligenceInput,
  match: GpxIntelligenceReport["match"],
  gapCount: number
): GpxIntelligenceReport["dataConfidence"] {
  const basis = [
    `${input.geometry.length} valid track points`,
    `${input.segments.length} preserved segment${input.segments.length === 1 ? "" : "s"}`
  ]
  if (input.invalidPointCount !== undefined) basis.push(`${input.invalidPointCount} invalid point${input.invalidPointCount === 1 ? "" : "s"} observed`)
  if (input.dedupedPointCount !== undefined) basis.push(`${input.dedupedPointCount} consecutive duplicate point${input.dedupedPointCount === 1 ? "" : "s"} removed`)
  if (gapCount > 0) basis.push(`${gapCount} GPS gap${gapCount === 1 ? "" : "s"} retained`)
  if (input.durationMinutes > 0) basis.push("timestamps present")
  if (input.ascentMeters !== null || input.descentMeters !== null) basis.push("elevation present")
  if (match.status === "matched" && match.matchPercent !== null) basis.push(`${match.matchPercent}% provider match coverage`)
  else if (match.status === "not-configured") basis.push("road matching not configured")
  else if (match.status === "unmatched") basis.push("provider returned no matching path")
  else basis.push("provider match did not produce usable coverage")

  const high = match.status === "matched" && match.matchPercent !== null && match.matchPercent >= 95 && gapCount === 0 && (input.invalidPointCount ?? 0) === 0
  const medium = match.status === "matched" || (match.status === "unmatched" && input.geometry.length >= 2)
  return { level: high ? "high" : medium ? "medium" : "low", basis }
}

function groundedDescription(
  input: GpxIntelligenceInput,
  reportMatch: GpxIntelligenceReport["match"],
  reportGaps: GpxGapSpan[],
  curvature: GeometryAnalysis,
  creatorNotes: string | undefined
): string {
  const miles = (input.distanceMeters / 1_609.344).toFixed(1)
  const parts = [`Measured GPX track: ${miles} mi across ${input.segments.length} segment${input.segments.length === 1 ? "" : "s"}.`]
  if (input.durationMinutes > 0) parts.push(`Recorded duration: ${Math.round(input.durationMinutes)} min.`)
  if (input.ascentMeters !== null || input.descentMeters !== null) {
    parts.push(`Elevation: ${Math.round(input.ascentMeters ?? 0)} m ascent and ${Math.round(input.descentMeters ?? 0)} m descent.`)
  }
  parts.push(`Curvature signal: ${curvature.twistiness}/100 from ${curvature.turnCount} measured turns.`)
  if (reportMatch.status === "unmatched") parts.push("Track guidance — road data unavailable.")
  else if (reportMatch.status === "not-configured") parts.push("Road matching was not evaluated; the original GPX remains track-only.")
  else if (reportMatch.status === "failed" || reportMatch.status === "cancelled") parts.push("Road matching did not produce usable coverage; the original GPX remains unchanged.")
  else if (reportMatch.matchPercent !== null) parts.push(`${reportMatch.matchPercent}% of the GPX points are covered by the provider match evidence.`)
  if (reportGaps.length > 0) parts.push(`${reportGaps.length} long GPS gap${reportGaps.length === 1 ? "" : "s"} remain visible; segment boundaries were not connected.`)
  if (creatorNotes) parts.push(`Creator note: ${creatorNotes}`)
  return parts.join(" ").slice(0, MAX_DESCRIPTION)
}

export function analyzeGpxIntelligence(
  input: GpxIntelligenceInput | NormalizedGpxRoute,
  mapMatch: GpxMapMatchResult
): GpxIntelligenceReport {
  const creatorNotes = boundedText(input.creatorNotes, MAX_CREATOR_NOTES)
  const gaps = gapSpans(input)
  const gapCount = Math.max(input.gapCount ?? 0, gaps.length)
  const reportMatch = matchFacts(mapMatch, input.geometry.length)
  const curvature = analyzeGeometry(input.geometry)
  const unmatchedSpans: GpxUnmatchedSpan[] = reportMatch.status === "unmatched" && input.geometry.length > 1
    ? [{
        fromPoint: 0,
        toPoint: input.geometry.length - 1,
        distanceMeters: Number(input.distanceMeters.toFixed(1)),
        reason: "map-match-no-path",
        navigation: "track-only"
      }]
    : []
  const report: GpxIntelligenceReport = {
    version: 1,
    distanceMeters: Number(Math.max(0, input.distanceMeters).toFixed(1)),
    durationMinutes: input.durationMinutes > 0 ? Number(input.durationMinutes.toFixed(2)) : null,
    durationSource: input.durationMinutes > 0 ? "timestamps" : "unavailable",
    elevation: { ascentMeters: input.ascentMeters, descentMeters: input.descentMeters },
    curvature,
    ingest: {
      pointCount: input.geometry.length,
      segmentCount: input.segments.length,
      invalidPointCount: input.invalidPointCount ?? null,
      dedupedPointCount: input.dedupedPointCount ?? null,
      gapCount
    },
    match: reportMatch,
    unmatchedSpans: unmatchedSpans.slice(0, MAX_UNMATCHED_SPANS),
    gapSpans: gaps,
    surface: { status: "unknown", distribution: {}, source: "not-available" },
    roadClasses: { status: "unknown", distribution: {}, source: "not-available" },
    mappedMvumOverlapPercent: null,
    communityCorridorOverlapPercent: null,
    likelyFuelGaps: { status: "unknown", reason: "Fuel availability requires a separate mapped-amenity dataset." },
    dataConfidence: confidence(input, reportMatch, gapCount),
    ...(creatorNotes ? { creatorNotes } : {}),
    groundedDescription: groundedDescription(input, reportMatch, gaps, curvature, creatorNotes)
  }
  return report
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value))
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value)
}

function isDistribution(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.keys(value).length <= 64 && Object.entries(value).every(([key, entry]) =>
    key.length <= 80 && typeof entry === "number" && Number.isFinite(entry) && entry >= 0 && entry <= 100
  )
}

/** Runtime gate for route artifacts read from the project GPX catalog. */
export function isGpxIntelligenceReport(value: unknown): value is GpxIntelligenceReport {
  if (!isRecord(value) || value.version !== 1 || typeof value.groundedDescription !== "string" || value.groundedDescription.length > MAX_DESCRIPTION) return false
  if (!isFiniteNumber(value.distanceMeters) || !isNullableNumber(value.durationMinutes)) return false
  if (value.durationSource !== "timestamps" && value.durationSource !== "unavailable") return false
  if (!isRecord(value.elevation) || !isNullableNumber(value.elevation.ascentMeters) || !isNullableNumber(value.elevation.descentMeters)) return false
  if (!isRecord(value.curvature) || !isFiniteNumber(value.curvature.twistiness) || !isFiniteNumber(value.curvature.turnCount) ||
    !isFiniteNumber(value.curvature.turnDensity) || !isFiniteNumber(value.curvature.straightRatio)) return false
  const ingest = isRecord(value.ingest) ? value.ingest : null
  if (!ingest || !isNonNegativeInteger(ingest.pointCount) || ingest.pointCount < 2 ||
    !isNonNegativeInteger(ingest.segmentCount) || ingest.segmentCount < 1 ||
    !isNullableNonNegativeInteger(ingest.invalidPointCount) || !isNullableNonNegativeInteger(ingest.dedupedPointCount) ||
    !isNonNegativeInteger(ingest.gapCount)) return false
  if (!isRecord(value.match) || !["not-configured", "matched", "unmatched", "failed", "cancelled"].includes(value.match.status as string) ||
    !(value.match.provider === null || value.match.provider === "graphhopper") ||
    !(value.match.profile === null || (typeof value.match.profile === "string" && value.match.profile.length <= 80)) ||
    !isNullableNumber(value.match.matchedDistanceMeters) || !isNullableNumber(value.match.matchPercent) || !isNullableNumber(value.match.unmatchedPercent) ||
    !["provider-path", "snapped-waypoints", "no-path", "not-evaluated", "provider-failure"].includes(value.match.basis as string)) return false
  if (!isRecord(value.surface) || !["known", "unknown"].includes(value.surface.status as string) || !isDistribution(value.surface.distribution) ||
    !["gpx", "graphhopper", "not-available"].includes(value.surface.source as string) ||
    !isRecord(value.roadClasses) || !["known", "unknown"].includes(value.roadClasses.status as string) || !isDistribution(value.roadClasses.distribution) ||
    !["gpx", "graphhopper", "not-available"].includes(value.roadClasses.source as string)) return false
  if (!isNullableNumber(value.mappedMvumOverlapPercent) || !isNullableNumber(value.communityCorridorOverlapPercent) ||
    !isRecord(value.likelyFuelGaps) || value.likelyFuelGaps.status !== "unknown" || typeof value.likelyFuelGaps.reason !== "string" ||
    !isRecord(value.dataConfidence) || !["high", "medium", "low"].includes(value.dataConfidence.level as string) ||
    !Array.isArray(value.dataConfidence.basis) || value.dataConfidence.basis.length > 32 || !value.dataConfidence.basis.every((entry) => typeof entry === "string" && entry.length <= 240)) return false
  if (value.creatorNotes !== undefined && (typeof value.creatorNotes !== "string" || value.creatorNotes.length > MAX_CREATOR_NOTES)) return false
  if (!Array.isArray(value.unmatchedSpans) || value.unmatchedSpans.length > MAX_UNMATCHED_SPANS || !Array.isArray(value.gapSpans) || value.gapSpans.length > MAX_GAP_SPANS) return false
  return value.unmatchedSpans.every((span) => {
    if (!isRecord(span) || !isNonNegativeInteger(span.fromPoint) || !isNonNegativeInteger(span.toPoint)) return false
    return span.toPoint >= span.fromPoint && isFiniteNumber(span.distanceMeters) && span.reason === "map-match-no-path" && span.navigation === "track-only"
  }) && value.gapSpans.every((span) => {
    if (!isRecord(span) || !isNonNegativeInteger(span.fromPoint) || !isNonNegativeInteger(span.toPoint)) return false
    return span.toPoint >= span.fromPoint && isFiniteNumber(span.distanceMeters) && (span.reason === "teleport" || span.reason === "segment-boundary")
  })
}
