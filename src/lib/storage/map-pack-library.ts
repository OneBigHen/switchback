import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type {
  LegacyMapStyleId,
  RiderLayerSetting,
  RiderMapPack } from "@/lib/client/map-layers"
import { normalizePersistedRiderLayerSettings } from "@/lib/client/persisted-rider-layers"
import {
  isMapLightPreference,
  legacyExperienceForPreset,
  legacyMapStyleForPreset,
  type LegacyMapExperienceId,
  type MapLightPreference
} from "@/lib/client/map-experience"
import { isMapPresetId, type MapPresetId } from "@/lib/client/map-preset-registry"

interface MapPackDb extends DBSchema {
  packs: {
    key: string
    value: RiderMapPack
    indexes: { "by-updated": string }
  }
}

type CanonicalMapPackInput = {
  name: string
  preset: MapPresetId
  experience?: never
  lightPreference?: MapLightPreference
  routeVisibility: RiderMapPack["routeVisibility"]
  layers: RiderLayerSetting[]
}

type LegacyMapPackInput = {
  name: string
  preset?: never
  experience: LegacyMapExperienceId
  lightPreference?: MapLightPreference
  routeVisibility: RiderMapPack["routeVisibility"]
  layers: RiderLayerSetting[]
}

export type MapPackInput = CanonicalMapPackInput | LegacyMapPackInput

function presetForInput(input: MapPackInput): MapPresetId {
  if (isMapPresetId(input.preset)) return input.preset
  if (input.experience === "terrain") return "terrain"
  if (input.experience === "satellite") return "satellite"
  return "road"
}

function boundedName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ").slice(0, 80)
  if (!normalized) throw new Error("Map pack name is required")
  return normalized
}

/**
 * Offline-first local library for reusable rider map setups. It stores only
 * bounded preference state; tile data and source datasets remain outside the
 * pack so a saved setup cannot turn into an opaque offline cache.
 */
export class MapPackLibrary {
  private database: Promise<IDBPDatabase<MapPackDb>>

  constructor(private readonly databaseName = "switchback-map-packs") {
    this.database = openDB<MapPackDb>(databaseName, 1, {
      upgrade(database) {
        const store = database.createObjectStore("packs", { keyPath: "id" })
        store.createIndex("by-updated", "updatedAt")
      }
    })
  }

  async list(): Promise<RiderMapPack[]> {
    const db = await this.database
    const packs = await db.getAllFromIndex("packs", "by-updated")
    return packs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async get(id: string): Promise<RiderMapPack | null> {
    const db = await this.database
    return (await db.get("packs", id)) ?? null
  }

  async save(input: MapPackInput): Promise<RiderMapPack> {
    const db = await this.database
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const preset = presetForInput(input)
    const lightPreference = isMapLightPreference(input.lightPreference)
      ? input.lightPreference
      : "auto"
    const pack: RiderMapPack = {
      id,
      name: boundedName(input.name),
      createdAt: now,
      updatedAt: now,
      preset,
      // Rollback fields stay bounded and deterministic. Older premium builds
      // can recover the closest experience, and pre-premium builds still have
      // one of their three original style ids.
      experience: legacyExperienceForPreset(preset),
      mapStyle: legacyMapStyleForPreset(preset, lightPreference) as LegacyMapStyleId,
      lightPreference,
      routeVisibility: input.routeVisibility,
      layers: normalizePersistedRiderLayerSettings(input.layers)
    }
    await db.put("packs", pack)
    return pack
  }

  async remove(id: string): Promise<void> {
    const db = await this.database
    await db.delete("packs", id)
  }

  async destroy(): Promise<void> {
    const db = await this.database
    db.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.databaseName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
  }
}
