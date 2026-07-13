import type { PlannedRoute } from "../routing/types"
import Dexie, { type EntityTable } from "dexie"

export interface SavedRoute extends PlannedRoute {
  notes: string
  createdAt: string
  updatedAt: string
}

class SwitchbackDatabase extends Dexie {
  routes!: EntityTable<SavedRoute, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      routes: "&id, name, profile, createdAt, updatedAt"
    })
  }
}

export class RouteLibrary {
  private readonly database: SwitchbackDatabase
  private lastTimestamp = 0

  constructor(readonly name = "switchback") {
    this.database = new SwitchbackDatabase(name)
  }

  private now(): string {
    const timestamp = Math.max(Date.now(), this.lastTimestamp + 1)
    this.lastTimestamp = timestamp
    return new Date(timestamp).toISOString()
  }

  async save(route: PlannedRoute, notes = ""): Promise<SavedRoute> {
    if (route.previewOnly) {
      throw new Error("Preview-only geometry cannot be saved as a routed trip")
    }
    const existing = await this.database.routes.get(route.id)
    const timestamp = this.now()
    const saved: SavedRoute = {
      ...route,
      notes,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    }
    await this.database.routes.put(saved)
    return saved
  }

  async get(id: string): Promise<SavedRoute | undefined> {
    return this.database.routes.get(id)
  }

  async list(): Promise<SavedRoute[]> {
    return this.database.routes.orderBy("updatedAt").reverse().toArray()
  }

  async remove(id: string): Promise<void> {
    await this.database.routes.delete(id)
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}
