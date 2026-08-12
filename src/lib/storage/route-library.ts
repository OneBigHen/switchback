import type { PlannedRoute } from "../routing/types"
import Dexie, { type EntityTable } from "dexie"

export interface SavedRoute extends PlannedRoute {
  notes: string
  folder: string
  tags: string[]
  visible: boolean
  createdAt: string
  updatedAt: string
}

export interface RouteOrganization {
  folder?: string
  tags?: string[]
  visible?: boolean
}

export interface RouteListFilter {
  folder?: string
  visible?: boolean
}

class SwitchbackDatabase extends Dexie {
  routes!: EntityTable<SavedRoute, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      routes: "&id, name, profile, createdAt, updatedAt"
    })
    this.version(2).stores({
      routes: "&id, name, profile, folder, *tags, visible, createdAt, updatedAt"
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
      folder: existing?.folder ?? "Unfiled",
      tags: existing?.tags ?? [],
      visible: existing?.visible ?? true,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    }
    await this.database.routes.put(saved)
    return saved
  }

  async get(id: string): Promise<SavedRoute | undefined> {
    return this.database.routes.get(id)
  }

  async upsertSynced(route: SavedRoute): Promise<void> {
    if (route.previewOnly) throw new Error("Preview-only geometry cannot enter the saved route library")
    await this.database.routes.put(structuredClone(route))
  }

  async list(filter: RouteListFilter = {}): Promise<SavedRoute[]> {
    const routes = await this.database.routes.orderBy("updatedAt").reverse().toArray()
    return routes.filter((route) => {
      if (filter.folder !== undefined && route.folder !== filter.folder) return false
      if (filter.visible !== undefined && route.visible !== filter.visible) return false
      return true
    })
  }

  async organize(id: string, organization: RouteOrganization): Promise<SavedRoute> {
    const route = await this.database.routes.get(id)
    if (!route) throw new Error("This route no longer exists in the local library.")
    const folder = organization.folder === undefined
      ? route.folder
      : organization.folder.trim().slice(0, 80) || "Unfiled"
    const tags = organization.tags === undefined
      ? route.tags
      : [...new Set(organization.tags
        .map((tag) => tag.trim().toLocaleLowerCase())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 32)))]
        .slice(0, 12)
    const updated: SavedRoute = {
      ...route,
      folder,
      tags,
      visible: organization.visible ?? route.visible,
      updatedAt: this.now()
    }
    await this.database.routes.put(updated)
    return updated
  }

  async remove(id: string): Promise<void> {
    await this.database.routes.delete(id)
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}
