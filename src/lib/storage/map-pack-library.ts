import Dexie, { type EntityTable } from "dexie"
import {
  normalizeRiderLayerSettings,
  type RiderLayerSettingInput,
  type RiderMapPack
} from "@/lib/client/map-layers"
import {
  legacyMapExperienceFor,
  legacyMapStyleFor,
  migrateLegacyMapExperience,
  type MapExperienceId,
  type MapLightPreference
} from "@/lib/client/map-experience"
import type { MapPresetId } from "@/lib/client/map-preset-registry"

interface MapPackInputBase {
  name: string
  lightPreference: MapLightPreference
  routeVisibility: RiderMapPack["routeVisibility"]
  layers: RiderLayerSettingInput[]
}

export type MapPackInput = MapPackInputBase & (
  | {
      /** Canonical input. Planner switches to this after Task 5 propagation. */
      preset: MapPresetId
      experience?: never
    }
  | {
      /** @deprecated Temporary compatibility for the current planner caller. */
      experience: MapExperienceId
      preset?: never
    }
)

class MapPackDatabase extends Dexie {
  packs!: EntityTable<RiderMapPack, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      packs: "&id, name, updatedAt, createdAt"
    })
  }
}

export class MapPackLibrary {
  private readonly database: MapPackDatabase
  private lastTimestamp = 0

  constructor(readonly name = "switchback-map-packs") {
    this.database = new MapPackDatabase(name)
  }

  private now(): string {
    const timestamp = Math.max(Date.now(), this.lastTimestamp + 1)
    this.lastTimestamp = timestamp
    return new Date(timestamp).toISOString()
  }

  async save(input: MapPackInput, id = crypto.randomUUID()): Promise<RiderMapPack> {
    const name = input.name.trim().replace(/\s+/g, " ")
    if (!name) throw new Error("Map pack needs a name.")
    if (name.length > 80) throw new Error("Map pack names must be 80 characters or fewer.")
    const existing = await this.database.packs.get(id)
    const timestamp = this.now()
    const preset = input.preset ?? migrateLegacyMapExperience(input.experience)
    const pack: RiderMapPack = {
      id,
      name,
      preset,
      // Bounded rollback fields keep packs readable by the premium-wave and
      // pre-premium builds without creating a second persistence model.
      experience: legacyMapExperienceFor(preset),
      mapStyle: legacyMapStyleFor(preset, input.lightPreference),
      lightPreference: input.lightPreference,
      routeVisibility: input.routeVisibility,
      layers: normalizeRiderLayerSettings(input.layers),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    }
    await this.database.packs.put(pack)
    return pack
  }

  async get(id: string): Promise<RiderMapPack | undefined> {
    return this.database.packs.get(id)
  }

  async list(): Promise<RiderMapPack[]> {
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
