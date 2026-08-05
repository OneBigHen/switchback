import type { Coordinate, RouteInstruction, RouteProfileId, Waypoint } from "@/lib/routing/types"

export const OFFLINE_GRAPH_FORMAT_VERSION = 1 as const

export type OfflinePackStatusKind =
  | "available"
  | "downloading"
  | "ready"
  | "stale"
  | "expired"
  | "failed"
  | "deleted"

export interface OfflinePackEstimate {
  readonly packId: string
  readonly estimatedBytes: number
  readonly corridorWidthMeters: number
  readonly graphBudgetBytes: number
  readonly routeCount: number
  readonly sourcesCount: number
  readonly warnings: readonly string[]
}

export interface OfflineGraphSourceManifest {
  readonly id: string
  readonly sourceName: string
  readonly sourceUrl: string
  readonly licenseName: string
  readonly licenseUrl: string
  readonly fetchedAt: string
  readonly version: string
  readonly byteSize: number
  readonly isApproximate: boolean
}

export interface OfflineGraphSegment {
  readonly id: string
  readonly source: OfflineGraphSourceManifest
  readonly nodes: readonly Coordinate[]
  readonly edges: readonly OfflineGraphEdge[]
  readonly nodeCount: number
  readonly edgeCount: number
  readonly restrictionCount: number
}

export interface OfflineGraphEdge {
  readonly fromNodeIndex: number
  readonly toNodeIndex: number
  readonly lengthMeters: number
  readonly bearingDegrees: number
  readonly roadClass: string
  readonly accessTags: Readonly<Record<string, string>>
  readonly unpaved: boolean
  readonly shapingPoint: boolean
}

export interface OfflineRoutingRequest {
  readonly requestId: string
  readonly packId: string
  readonly origin: Coordinate
  readonly destination: Coordinate
  readonly waypoints: readonly Coordinate[]
  readonly profile: RouteProfileId
  readonly corridorWidthMeters: number
  readonly restrictions: readonly OfflineRoutingRestriction[]
  readonly shapingPoints: readonly Coordinate[]
  readonly preserveOriginalGeometry: boolean
  readonly createdAt: number
}

export interface OfflineRoutingRestriction {
  readonly kind: "avoid" | "must-use" | "closure"
  readonly coordinate: Coordinate
  readonly radiusMeters: number
  readonly reason: string
}

export type OfflineRoutingResultKind =
  | "ok"
  | "cancelled"
  | "outside-corridor"
  | "no-route"
  | "restriction-violation"
  | "pack-missing"
  | "pack-stale"
  | "pack-expired"
  | "graph-error"
  | "timeout"

export interface OfflineRoutingResult {
  readonly requestId: string
  readonly kind: OfflineRoutingResultKind
  readonly geometry: readonly Coordinate[] | null
  readonly instructions: readonly RouteInstruction[] | null
  readonly distanceMeters: number | null
  readonly durationSeconds: number | null
  readonly waypoints: readonly Waypoint[] | null
  readonly reason: string
  readonly outsideCorridorCoordinate: Coordinate | null
  readonly packId: string
}

export interface OfflinePackManifest {
  readonly manifestVersion: typeof OFFLINE_GRAPH_FORMAT_VERSION
  readonly id: string
  readonly routeId: string
  readonly routeName: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly corridorWidthMeters: number
  readonly maxGraphBudgetBytes: number
  readonly sources: readonly OfflineGraphSourceManifest[]
  readonly graphManifestVersion: string
  readonly legalAccessProvenance: readonly {
    readonly source: string
    readonly confidence: "authoritative" | "approximate"
    readonly notes: string
  }[]
  readonly expiresAt: string
  readonly status: OfflinePackStatusKind
  readonly estimatedBytes: number
  readonly segments: readonly OfflineGraphSegment[]
  readonly routingCapability: "follow-saved-route" | "in-corridor-routing"
}

export function packStatusFromFreshness(
  now: number,
  updatedAt: string,
  ttlMillis: number,
  expiryMillis: number
): OfflinePackStatusKind {
  const updated = Date.parse(updatedAt)
  if (!Number.isFinite(updated)) return "expired"
  const ageMs = now - updated
  if (ageMs < ttlMillis) return "ready"
  if (ageMs < expiryMillis) return "stale"
  return "expired"
}

export function isPackUsableForRouting(status: OfflinePackStatusKind): boolean {
  return status === "ready"
}
