import Dexie, { type EntityTable } from "dexie"
import {
  normalizeRiderLayerSettings,
  type MapStyleId,
  type RiderLayerSettingInput,
  type RiderMapPack
} from "@/lib/client/map-layers"

export interface MapPackInput {
  name: string
  mapStyle: MapStyleId
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
    const pack: RiderMapPack = {
      id,
      name,
      mapStyle: input.mapStyle,
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
