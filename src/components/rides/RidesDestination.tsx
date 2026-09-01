"use client"

import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import type { RoadLock, RoadLockMode } from "@/lib/roads/road-locks"
import type { RecordedRide } from "@/lib/storage/ride-journal"
import type { SavedRoute } from "@/lib/storage/route-library"
import type { TripPlan } from "@/lib/trip/trip-plan"
import { RidesSurface, type RideLibraryItem } from "./RidesSurface"
import { normalizeRideLibrary } from "./rides-view-model"
import styles from "./RidesDestination.module.css"

export interface ImportAsLockOptions {
  mode: RoadLockMode
  displayName?: string
  sourceRegionId?: string
  sourceGraphVersion?: string
}

export interface RidesDestinationProps {
  routes: SavedRoute[]
  recordedRides?: RecordedRide[]
  trips?: TripPlan[]
  projectRoutes?: ProjectGpxRouteSummary[]
  onClose(): void
  onLoad(route: SavedRoute): void
  onLoadTrip?(route: TripPlan): void
  onDeleteTrip?(trip: TripPlan): void
  onMatchImported?(route: SavedRoute): void
  onLoadRecorded?(ride: RecordedRide): void
  onDeleteRecorded?(ride: RecordedRide): void
  onLoadProject?(route: ProjectGpxRouteSummary): void
  onDelete(route: SavedRoute): void
  onOrganize?(route: SavedRoute, organization: {
    folder?: string
    tags?: string[]
    visible?: boolean
  }): void
  onImport(file: File): void
  onImportAsLock?(file: File, options: ImportAsLockOptions): Promise<RoadLock | null>
}

function importDisplayName(file: File): string {
  return file.name.replace(/\.(?:gpx|kml|kmz)$/i, "") || "Imported roads"
}

export function RidesDestination(props: RidesDestinationProps) {
  const recordedRides = props.recordedRides ?? []
  const trips = props.trips ?? []
  const projectRoutes = props.projectRoutes ?? []
  const items = normalizeRideLibrary({
    savedRoutes: props.routes,
    recordedRides,
    trips,
    projectRoutes
  })

  const savedRouteFor = (item: RideLibraryItem) => {
    const sourceId = item.sourceId ?? item.id
    return props.routes.find((candidate) => candidate.id === sourceId)
  }

  const tripFor = (item: RideLibraryItem) => {
    const sourceId = item.sourceId ?? item.id
    return trips.find((candidate) => candidate.id === sourceId)
  }

  const recordedRideFor = (item: RideLibraryItem) => {
    const sourceId = item.sourceId ?? item.id
    return recordedRides.find((candidate) => candidate.id === sourceId)
  }

  const openItem = (item: RideLibraryItem) => {
    const sourceId = item.sourceId ?? item.id

    if (item.kind === "saved-route") {
      const route = savedRouteFor(item)
      if (route) props.onLoad(route)
      return
    }

    if (item.kind === "recorded-ride") {
      const ride = recordedRides.find((candidate) => candidate.id === sourceId)
      if (ride) props.onLoadRecorded?.(ride)
      return
    }

    if (item.kind === "trip-plan") {
      const trip = tripFor(item)
      if (trip) props.onLoadTrip?.(trip)
      return
    }

    const projectRoute = projectRoutes.find((candidate) => candidate.id === sourceId)
    if (projectRoute) props.onLoadProject?.(projectRoute)
  }

  const importRoads = props.onImportAsLock
    ? async (file: File, mode: RoadLockMode) => {
        await props.onImportAsLock?.(file, {
          mode,
          displayName: importDisplayName(file)
        })
      }
    : undefined

  return (
    <main className={styles.destination} aria-label="Rides destination">
      <div className={styles.content}>
        <RidesSurface
          items={items}
          onOpen={openItem}
          onImport={props.onImport}
          onImportRoads={importRoads}
          onMatchRoads={(item) => {
            const route = savedRouteFor(item)
            if (route) props.onMatchImported?.(route)
          }}
          onOrganize={(item, organization) => {
            const route = savedRouteFor(item)
            if (route) props.onOrganize?.(route, organization)
          }}
          onDelete={(item) => {
            if (item.kind === "saved-route") {
              const route = savedRouteFor(item)
              if (route) props.onDelete(route)
              return
            }
            if (item.kind === "trip-plan") {
              const trip = tripFor(item)
              if (trip) props.onDeleteTrip?.(trip)
              return
            }
            if (item.kind === "recorded-ride") {
              const ride = recordedRideFor(item)
              if (ride) props.onDeleteRecorded?.(ride)
            }
          }}
        />
      </div>
    </main>
  )
}
