import Dexie, { type EntityTable } from "dexie"
import type { MapStyleId, RiderLayerId } from "@/lib/client/map-layers"
import type { PlannedRoute, RouteInstruction } from "@/lib/routing/types"

/**
 * Schema version of the persisted {@link OfflineRoutePack} payload.
 *
 * New saves always write the current version. Legacy packs persisted before
 * this field existed are stamped `1` by the Dexie v2 upgrade so that callers
 * can distinguish migrated records from freshly authored packs and interpret
 * the payload accordingly.
 */
export const OFFLINE_ROUTE_PACK_SCHEMA_VERSION = 2

/**
 * Default window after `updatedAt` during which a pack is still "fresh".
 */
export const DEFAULT_OFFLINE_ROUTE_PACK_TTL_MILLIS =
  1000 * 60 * 60 * 24 * 7 // 7 days

/**
 * Default window after `updatedAt` during which a pack may still be used for
 * offline guidance before it is treated as expired.
 */
export const DEFAULT_OFFLINE_ROUTE_PACK_EXPIRY_MILLIS =
  1000 * 60 * 60 * 24 * 30 // 30 days

export type OfflineRoutePackExpiryState = "fresh" | "stale" | "expired"

export interface OfflineRoutePackFreshness {
  /** Milliseconds after `updatedAt` during which the pack is considered fresh. */
  readonly ttlMillis: number
  /** ISO timestamp past which the pack should be treated as expired. */
  readonly expiresAt: string
}

export interface OfflineRoutePack {
  id: string
  routeId: string
  routeName: string
  createdAt: string
  updatedAt: string
  mapStyle: MapStyleId
  routeVisibility: "standard" | "high-contrast"
  activeLayerIds: RiderLayerId[]
  route: PlannedRoute
  cues: RouteInstruction[]
  navigationMode: "follow-saved-route"
  /** Schema version of the persisted payload, used to interpret migrations. */
  schemaVersion: number
  /** Best-effort, non-authoritative estimate of the payload byte size. */
  estimatedBytes: number
  /** Freshness and expiry window used to derive user-visible expiry state. */
  freshness: OfflineRoutePackFreshness
}

export interface OfflineRoutePackInput {
  route: PlannedRoute
  mapStyle: MapStyleId
  routeVisibility: OfflineRoutePack["routeVisibility"]
  activeLayerIds: RiderLayerId[]
  /** Overrides the default window during which the pack is considered fresh. */
  freshnessTtlMillis?: number
  /** Overrides the default window after which the pack is considered expired. */
  freshnessExpiryMillis?: number
}

/**
 * Compute a best-effort, non-authoritative estimate of the byte size of a
 * persisted pack payload, excluding the
 * {@link OfflineRoutePack.estimatedBytes `estimatedBytes`} field itself.
 *
 * Used for storage estimates only — never as a sizing contract. The estimate
 * reflects the persisted payload shape at save time so callers can surface
 * "roughly how much local storage this offline pack occupies."
 */
export function estimateOfflineRoutePackBytes(
  pack: Readonly<Omit<OfflineRoutePack, "estimatedBytes">>
): number {
  return new TextEncoder().encode(JSON.stringify(pack)).byteLength
}

/**
 * Derive the user-visible expiry state for a pack, given a reference `now`.
 *
 * - `"fresh"`: within the configured freshness window (`ttlMillis`).
 * - `"stale"`: past the freshness window but before the hard expiry.
 * - `"expired"`: past the hard expiry, or when the persisted timestamps cannot
 *   be parsed (defensive — expired is the safest fallback for offline use).
 */
export function getOfflineRoutePackExpiryState(
  pack: Pick<OfflineRoutePack, "updatedAt" | "freshness">,
  now: Date = new Date()
): OfflineRoutePackExpiryState {
  const updatedAtMs = Date.parse(pack.updatedAt)
  const expiresAtMs = Date.parse(pack.freshness.expiresAt)
  if (Number.isNaN(updatedAtMs) || Number.isNaN(expiresAtMs)) return "expired"
  const nowMs = now.getTime()
  if (nowMs >= expiresAtMs) return "expired"
  const staleAtMs = updatedAtMs + pack.freshness.ttlMillis
  if (nowMs >= staleAtMs) return "stale"
  return "fresh"
}

function deriveLegacyExpiry(updatedAt: string | undefined): string {
  const parsed = updatedAt ? Date.parse(updatedAt) : Number.NaN
  const base = Number.isNaN(parsed) ? Date.now() : parsed
  return new Date(base + DEFAULT_OFFLINE_ROUTE_PACK_EXPIRY_MILLIS).toISOString()
}

class OfflineRoutePackDatabase extends Dexie {
  packs!: EntityTable<OfflineRoutePack, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({ packs: "&id, routeId, updatedAt, createdAt" })
    // v2 adds versioned metadata (schema version, storage estimate, and
    // expiry/freshness) without changing the v1 indexes. Existing saves remain
    // readable via the upgrade hook, which backfills the new fields in place.
    this.version(2)
      .stores({ packs: "&id, routeId, updatedAt, createdAt" })
      .upgrade((transaction) => (
        transaction.table("packs").toCollection().modify((pack: Partial<OfflineRoutePack>) => {
          pack.schemaVersion ??= 1
          pack.freshness ??= {
            ttlMillis: DEFAULT_OFFLINE_ROUTE_PACK_TTL_MILLIS,
            expiresAt: deriveLegacyExpiry(pack.updatedAt)
          }
          if (pack.estimatedBytes === undefined) {
            pack.estimatedBytes =
              new TextEncoder().encode(JSON.stringify(pack)).byteLength
          }
        })
      ))
  }
}

export class OfflineRoutePackLibrary {
  private readonly database: OfflineRoutePackDatabase
  private lastTimestamp = 0

  constructor(readonly name = "switchback-offline-packs") {
    this.database = new OfflineRoutePackDatabase(name)
  }

  private now(): string {
    const timestamp = Math.max(Date.now(), this.lastTimestamp + 1)
    this.lastTimestamp = timestamp
    return new Date(timestamp).toISOString()
  }

  async save(input: OfflineRoutePackInput, id = `${input.route.id}-offline`): Promise<OfflineRoutePack> {
    if (input.route.previewOnly || input.route.geometry.length < 2) {
      throw new Error("Preview-only geometry cannot be packaged for offline guidance.")
    }
    const existing = await this.database.packs.get(id)
    const timestamp = this.now()
    const ttlMillis = input.freshnessTtlMillis ?? DEFAULT_OFFLINE_ROUTE_PACK_TTL_MILLIS
    const expiryMillis = input.freshnessExpiryMillis ?? DEFAULT_OFFLINE_ROUTE_PACK_EXPIRY_MILLIS
    const expiresAt = new Date(Date.parse(timestamp) + expiryMillis).toISOString()
    const basePack: Omit<OfflineRoutePack, "estimatedBytes"> = {
      id,
      routeId: input.route.id,
      routeName: input.route.name,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      mapStyle: input.mapStyle,
      routeVisibility: input.routeVisibility,
      activeLayerIds: [...new Set(input.activeLayerIds)],
      route: structuredClone(input.route),
      cues: structuredClone(input.route.instructions),
      // Offline packs are intentionally limited to the verified route/cues.
      // They never claim to provide a stale or unverified rerouting engine.
      navigationMode: "follow-saved-route",
      schemaVersion: OFFLINE_ROUTE_PACK_SCHEMA_VERSION,
      freshness: { ttlMillis, expiresAt }
    }
    const pack: OfflineRoutePack = {
      ...basePack,
      estimatedBytes: estimateOfflineRoutePackBytes(basePack)
    }
    await this.database.packs.put(pack)
    return pack
  }

  async get(id: string): Promise<OfflineRoutePack | undefined> {
    return this.database.packs.get(id)
  }

  async list(): Promise<OfflineRoutePack[]> {
    return this.database.packs.orderBy("updatedAt").reverse().toArray()
  }

  async remove(id: string): Promise<void> {
    await this.database.packs.delete(id)
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}
