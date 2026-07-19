import Dexie, { type EntityTable } from "dexie"
import { DEFAULT_TRIP_STAGE_CONSTRAINTS, TRIP_PLAN_VERSION, type TripPlan } from "@/lib/trip/trip-plan"

class TripPlanDatabase extends Dexie {
  trips!: EntityTable<TripPlan, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({ trips: "&id, routeId, updatedAt, createdAt" })
    this.version(2).stores({ trips: "&id, routeId, updatedAt, createdAt" }).upgrade((transaction) => (
      transaction.table("trips").toCollection().modify((trip: Partial<TripPlan>) => {
        trip.constraints ??= structuredClone(DEFAULT_TRIP_STAGE_CONSTRAINTS)
        trip.version = TRIP_PLAN_VERSION
      })
    ))
  }
}

export class TripPlanLibrary {
  private readonly database: TripPlanDatabase

  constructor(readonly name = "switchback-trip-plans") {
    this.database = new TripPlanDatabase(name)
  }

  async save(trip: TripPlan): Promise<TripPlan> {
    const next = structuredClone(trip)
    await this.database.trips.put(next)
    return next
  }

  async get(id: string): Promise<TripPlan | undefined> {
    return this.database.trips.get(id)
  }

  async list(): Promise<TripPlan[]> {
    return this.database.trips.orderBy("updatedAt").reverse().toArray()
  }

  async remove(id: string): Promise<void> {
    await this.database.trips.delete(id)
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}
