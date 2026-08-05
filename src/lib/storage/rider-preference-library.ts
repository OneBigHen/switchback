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
    // motorcycleId holds the STABLE bike record id (SB-011), never the
    // mutable display name: renaming a bike must not reset or cross-wire
    // its learned preferences.
    this.version(1).stores({ preferences: "&id, bikeId, profile, updatedAt" })
    this.version(2).stores({ preferences: "&id, bikeId, profile, updatedAt" })
  }
}

function preferenceId(bikeId: string, profile: RouteProfileId): string {
  return `${bikeId.trim().toLocaleLowerCase()}::${profile}`
}

export class RiderPreferenceLibrary {
  private readonly database: RiderPreferenceDatabase

  constructor(readonly name = "switchback-rider-preferences") {
    this.database = new RiderPreferenceDatabase(name)
  }

  async get(bikeId: string, profile: RouteProfileId): Promise<RiderPreference | undefined> {
    return this.database.preferences.get(preferenceId(bikeId, profile))
  }

  async list(): Promise<RiderPreference[]> {
    return this.database.preferences.toArray()
  }

  async record(signal: RiderPreferenceSignal): Promise<RiderPreference> {
    const bikeId = signal.bikeId.trim().slice(0, 80) || "default"
    const id = preferenceId(bikeId, signal.route.profile)
    const current = await this.database.preferences.get(id)
    const preference = updateRiderPreference(current ?? null, { ...signal, bikeId })
    await this.database.preferences.put({ ...preference, id })
    return preference
  }

  async clear(): Promise<void> {
    await this.database.preferences.clear()
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}
