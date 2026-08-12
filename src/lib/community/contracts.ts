import type { Coordinate } from "@/lib/routing/types"

export const COMMUNITY_PROVENANCE = [
  "rider-recorded",
  "built-and-verified",
  "curated-planned",
  "unknown"
] as const

export type CommunityProvenance = (typeof COMMUNITY_PROVENANCE)[number]
export type CommunityVisibility = "public" | "unlisted"

export interface CommunityPreviewArtifact {
  geometry: Coordinate[][]
  distanceMiles: number
  durationMinutes: number
  exactPreviewRequired: true
}

export interface CommunityRouteDraft {
  title: string
  description: string | null
  routeFingerprint: string
  stats: Record<string, number | string | null>
  provenanceClass: CommunityProvenance
  visibility: CommunityVisibility
  preview: CommunityPreviewArtifact
}

export interface CommunityArtifactDraft {
  kind: "preview"
  sha256: string
  bytes: number
}

export interface RigContributionDraft {
  segmentIds: string[]
  evidenceKind: "ride-confirmation" | "route-curation" | "surface-report" | "access-report"
  routeRole: "primary" | "alternative" | "approach" | "egress"
  positiveWeight: number
  negativeWeight: number
  observedAt: string | null
}

const MAX_STATS_KEYS = 32
const MAX_TEXT = 4_000
const HASH = /^[a-f0-9]{64}$/i
const MAX_PREVIEW_SEGMENTS = 64
const MAX_PREVIEW_POINTS = 5_000

export function sanitizePlainText(value: string, maxLength = MAX_TEXT): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, maxLength)
}

function plainText(value: unknown, field: string, maxLength = MAX_TEXT): string {
  if (typeof value !== "string") throw new Error(`${field} must be text`)
  const sanitized = sanitizePlainText(value, maxLength)
  if (!sanitized) throw new Error(`${field} must not be empty`)
  return sanitized
}

function safeStats(value: unknown): Record<string, number | string | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("stats must be an object")
  }
  const entries = Object.entries(value)
  if (entries.length > MAX_STATS_KEYS) throw new Error("stats has too many fields")
  const result: Record<string, number | string | null> = {}
  for (const [key, item] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) throw new Error("stats has an invalid field")
    if (item !== null && typeof item !== "number" && typeof item !== "string") {
      throw new Error("stats values must be scalar")
    }
    if (typeof item === "number" && !Number.isFinite(item)) throw new Error("stats contains a non-finite number")
    if (typeof item === "string") result[key] = sanitizePlainText(item, 160)
    else result[key] = item
  }
  return result
}

function safeCoordinate(value: unknown): Coordinate {
  if (!Array.isArray(value) || value.length !== 2) throw new Error("preview geometry has an invalid coordinate")
  const [longitude, latitude] = value
  if (typeof longitude !== "number" || typeof latitude !== "number" || !Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error("preview geometry has an invalid coordinate")
  }
  return [longitude, latitude]
}

function parseCommunityPreviewArtifact(input: unknown): CommunityPreviewArtifact {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("preview must be an object")
  const value = input as Record<string, unknown>
  if (value.exactPreviewRequired !== true) throw new Error("preview must be explicitly confirmed")
  if (!Array.isArray(value.geometry) || value.geometry.length === 0 || value.geometry.length > MAX_PREVIEW_SEGMENTS) throw new Error("preview geometry has too many segments")
  let pointCount = 0
  const geometry = value.geometry.map((segment) => {
    if (!Array.isArray(segment) || segment.length < 2) throw new Error("preview geometry has an invalid segment")
    pointCount += segment.length
    if (pointCount > MAX_PREVIEW_POINTS) throw new Error("preview geometry is too large")
    return segment.map(safeCoordinate)
  })
  const distanceMiles = value.distanceMiles
  const durationMinutes = value.durationMinutes
  if (typeof distanceMiles !== "number" || !Number.isFinite(distanceMiles) || distanceMiles < 0 || distanceMiles > 100_000) throw new Error("preview distance is invalid")
  if (typeof durationMinutes !== "number" || !Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 10_000_000) throw new Error("preview duration is invalid")
  return { geometry, distanceMiles, durationMinutes, exactPreviewRequired: true }
}

export function parseCommunityRouteDraft(input: unknown): CommunityRouteDraft {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("route must be an object")
  const value = input as Record<string, unknown>
  const description = value.description === undefined || value.description === null
    ? null
    : sanitizePlainText(plainText(value.description, "description"))
  const visibility = value.visibility === "unlisted" ? "unlisted" : value.visibility === "public" ? "public" : null
  if (!visibility) throw new Error("visibility must be public or unlisted")
  const provenanceClass = value.provenanceClass
  if (typeof provenanceClass !== "string" || !COMMUNITY_PROVENANCE.includes(provenanceClass as CommunityProvenance)) {
    throw new Error("provenanceClass is invalid")
  }
  return {
    title: plainText(value.title, "title", 180),
    description,
    routeFingerprint: plainText(value.routeFingerprint, "routeFingerprint", 180),
    stats: safeStats(value.stats),
    provenanceClass: provenanceClass as CommunityProvenance,
    visibility,
    preview: parseCommunityPreviewArtifact(value.preview)
  }
}

export { parseCommunityPreviewArtifact }

export function parseCommunityArtifactDraft(input: unknown): CommunityArtifactDraft {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("artifact must be an object")
  const value = input as Record<string, unknown>
  if (value.kind !== "preview") throw new Error("Only sanitized preview artifacts may be published")
  if (typeof value.sha256 !== "string" || !HASH.test(value.sha256)) throw new Error("artifact hash is invalid")
  if (typeof value.bytes !== "number" || !Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > 50 * 1024 * 1024) {
    throw new Error("artifact size is invalid")
  }
  return { kind: value.kind, sha256: value.sha256.toLowerCase(), bytes: value.bytes }
}

export function parseRigContributionDraft(input: unknown): RigContributionDraft {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("RIG contribution must be an object")
  const value = input as Record<string, unknown>
  const segmentIds = Array.isArray(value.segmentIds)
    ? value.segmentIds.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(id))
    : []
  if (segmentIds.length === 0 || segmentIds.length > 5_000) throw new Error("RIG contribution has invalid segments")
  if (!["ride-confirmation", "route-curation", "surface-report", "access-report"].includes(String(value.evidenceKind))) {
    throw new Error("RIG evidence kind is invalid")
  }
  if (!["primary", "alternative", "approach", "egress"].includes(String(value.routeRole))) throw new Error("RIG route role is invalid")
  const weight = (key: string): number => {
    const item = value[key]
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 100) throw new Error(`${key} is invalid`)
    return item
  }
  const observedAt = value.observedAt === null || value.observedAt === undefined ? null : plainText(value.observedAt, "observedAt", 80)
  return {
    segmentIds: [...new Set(segmentIds)],
    evidenceKind: value.evidenceKind as RigContributionDraft["evidenceKind"],
    routeRole: value.routeRole as RigContributionDraft["routeRole"],
    positiveWeight: weight("positiveWeight"),
    negativeWeight: weight("negativeWeight"),
    observedAt
  }
}
