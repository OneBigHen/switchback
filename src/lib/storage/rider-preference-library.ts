import Dexie, { type EntityTable } from "dexie"
import {
  updateRiderPreference,
  type RiderPreference,
  type RiderPreferenceSignal
} from "@/lib/intelligence/rider-preferences"
import type { RouteProfileId } from "@/lib/routing/types"

interface StoredRiderPreference extends RiderPreference {
  id: string
}

class RiderPreferenceDatabase extends Dexie {
  preferences!: EntityTable<StoredRiderPreference, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({ preferences: "&id, motorcycleId, profile, updatedAt" })
  }
}

function preferenceId(motorcycleId: string, profile: RouteProfileId): string {
  return `${motorcycleId.trim().toLocaleLowerCase()}::${profile}`
}

export class RiderPreferenceLibrary {
  private readonly database: RiderPreferenceDatabase

  constructor(readonly name = "switchback-rider-preferences") {
    this.database = new RiderPreferenceDatabase(name)
  }

  async get(motorcycleId: string, profile: RouteProfileId): Promise<RiderPreference | undefined> {
    return this.database.preferences.get(preferenceId(motorcycleId, profile))
  }

  async record(signal: RiderPreferenceSignal): Promise<RiderPreference> {
    const motorcycleId = signal.motorcycleId.trim().slice(0, 80) || "default"
    const id = preferenceId(motorcycleId, signal.route.profile)
    const current = await this.database.preferences.get(id)
    const preference = updateRiderPreference(current ?? null, { ...signal, motorcycleId })
    await this.database.preferences.put({ ...preference, id })
    return preference
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}
