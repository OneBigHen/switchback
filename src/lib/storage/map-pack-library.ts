import Dexie, { type EntityTable } from "dexie"
import {
  type RiderLayerSettingInput,
  type RiderMapPack
} from "@/lib/client/map-layers"
import { normalizePersistedRiderLayerSettings } from "@/lib/client/persisted-rider-layers"
import {
  legacyMapExperienceFor,
  legacyMapStyleFor,
  type MapLightPreference
} from "@/lib/client/map-experience"
import type { MapPresetId } from "@/lib/client/map-preset-registry"

export interface MapPackInput {
  preset: MapPresetId
  name: string
  lightPreference: MapLightPreference
  routeVisibility: RiderMapPack["routeVisibility"]
  layers: RiderLayerSettingInput[]
}

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
    const preset = input.preset
    const pack: RiderMapPack = {
      id,
      name,
      preset,
      // Rollback-only serialisation. A pack this build writes stays readable
      // by the premium-wave and pre-premium builds; nothing here reads them
      // back while `preset` is present. Removable once no installed build
      // predates the canonical field.
      experience: legacyMapExperienceFor(preset),
      mapStyle: legacyMapStyleFor(preset, input.lightPreference),
      lightPreference: input.lightPreference,
      routeVisibility: input.routeVisibility,
      layers: normalizePersistedRiderLayerSettings(input.layers),
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
