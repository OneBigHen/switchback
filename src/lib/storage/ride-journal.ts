import Dexie, { type EntityTable } from "dexie"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"

export interface RecordedRidePoint {
  coordinate: Coordinate
  recordedAt: string
  speedMph: number | null
  /** Meters above sea level from the GPS fix, when the device reports it. */
  altitudeMeters?: number | null
  /** Degrees from true north, when the device reports it. */
  headingDegrees?: number | null
  /** Horizontal GPS accuracy in meters, when reported. */
  accuracyMeters?: number | null
}

export interface RidePhotoNote {
  id: string
  caption: string
  takenAt: string
  // Binary image payloads are intentionally not captured automatically. A
  // future attachment picker can save an object URL/blob under this same id.
  blobId?: string
}

export interface RecordedRide {
  id: string
  routeId: string
  routeName: string
  route: PlannedRoute
  points: RecordedRidePoint[]
  notes: string
  photos: RidePhotoNote[]
  startedAt: string
  endedAt: string
  createdAt: string
  updatedAt: string
}

export interface RecordedRideInput {
  route: PlannedRoute
  points: RecordedRidePoint[]
  notes?: string
  photos?: RidePhotoNote[]
}

class RideJournalDatabase extends Dexie {
  rides!: EntityTable<RecordedRide, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({ rides: "&id, routeId, startedAt, endedAt, updatedAt" })
  }
}

export function summarizeRecordedRide(ride: RecordedRide): {
  durationMinutes: number
  pointCount: number
  photoCount: number
} {
  const started = Date.parse(ride.startedAt)
  const ended = Date.parse(ride.endedAt)
  return {
    durationMinutes: Number.isFinite(started) && Number.isFinite(ended)
      ? Math.max(0, Math.round((ended - started) / 60_000))
      : 0,
    pointCount: ride.points.length,
    photoCount: ride.photos.length
  }
}

export class RideJournalLibrary {
  private readonly database: RideJournalDatabase

  constructor(readonly name = "switchback-ride-journal") {
    this.database = new RideJournalDatabase(name)
  }

  async save(input: RecordedRideInput): Promise<RecordedRide> {
    if (input.points.length < 2) throw new Error("Record at least two GPS points before saving a ride replay.")
    const points = structuredClone(input.points)
    const startedAt = points[0]!.recordedAt
    const endedAt = points.at(-1)!.recordedAt
    const timestamp = new Date().toISOString()
    const ride: RecordedRide = {
      id: `ride-${crypto.randomUUID()}`,
      routeId: input.route.id,
      routeName: input.route.name,
      route: structuredClone(input.route),
      points,
      notes: input.notes?.trim().slice(0, 2_000) ?? "",
      photos: structuredClone(input.photos ?? []).slice(0, 50),
      startedAt,
      endedAt,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    await this.database.rides.put(ride)
    return ride
  }

  async list(routeId?: string): Promise<RecordedRide[]> {
    const rides = await this.database.rides.orderBy("endedAt").reverse().toArray()
    return routeId ? rides.filter((ride) => ride.routeId === routeId) : rides
  }

  async remove(id: string): Promise<void> {
    await this.database.rides.delete(id)
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}
