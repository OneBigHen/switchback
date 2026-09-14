"use client"

import { useEffect, useMemo, useState } from "react"
import { fetchCatalogRoute } from "@/lib/gpx/catalog-client"
import { RideJournalLibrary } from "@/lib/storage/ride-journal"
import type { Coordinate } from "@/lib/routing/types"
import type { ReconTrack } from "@/features/recon/types"
import { makeLineProximity } from "@/features/recon/intel/xray"
import { adaptRecordedRide } from "./recorded-ride-adapter"
import { adaptCatalogRoute, CATALOG_PREFIX } from "./catalog-route-adapter"

/**
 * Recon's read-only view of data OpenGravel already owns: the rider's ride
 * journal (IndexedDB, never leaves the browser), the shared route
 * catalog, and Gravel Atlas corridors near a selected track. Every loader
 * degrades to an explicit unavailable state, never to a false "nothing here".
 */

export type LoadState = "loading" | "ready" | "unavailable"

export interface CatalogEntry {
  /** Track id: `catalog:<route id>`. */
  id: string
  routeId: string
  name: string
}

export { CATALOG_PREFIX }

export interface ReconLibrary {
  rides: ReconTrack[]
  ridesState: LoadState
  rejectedRideCount: number
  catalog: CatalogEntry[]
  catalogState: LoadState
}

export function useReconLibrary(): ReconLibrary {
  const [journal, setJournal] = useState<{ state: LoadState; rides: ReconTrack[]; rejected: number }>({
    state: "loading",
    rides: [],
    rejected: 0
  })
  const [catalog, setCatalog] = useState<{ state: LoadState; entries: CatalogEntry[] }>({ state: "loading", entries: [] })

  useEffect(() => {
    let cancelled = false
    new RideJournalLibrary()
      .list()
      .then((source) => {
        if (cancelled) return
        const rides: ReconTrack[] = []
        let rejected = 0
        for (const ride of source) {
          const track = adaptRecordedRide(ride)
          if (track) rides.push(track)
          else rejected += 1
        }
        setJournal({ state: "ready", rides, rejected })
      })
      .catch(() => {
        if (!cancelled) setJournal({ state: "unavailable", rides: [], rejected: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    // The browse catalog, not the raw manifest: the same curated rows and
    // titles Explore routes shows, so previews here are the rides a rider
    // already knows by name (the manifest also lists every split sliver).
    fetch("/api/route-catalog", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`catalog ${response.status}`)
        setCatalog({ state: "ready", entries: parseCatalog(await response.json()) })
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalog({ state: "unavailable", entries: [] })
      })
    return () => controller.abort()
  }, [])

  return {
    rides: journal.rides,
    ridesState: journal.state,
    rejectedRideCount: journal.rejected,
    catalog: catalog.entries,
    catalogState: catalog.state
  }
}

function parseCatalog(body: unknown): CatalogEntry[] {
  const routes = body && typeof body === "object" ? (body as { routes?: unknown }).routes : null
  if (!Array.isArray(routes)) return []
  const entries: CatalogEntry[] = []
  for (const item of routes) {
    const record = item as { id?: unknown; name?: unknown; title?: unknown; canUseGeometry?: unknown } | null
    if (typeof record?.id !== "string" || !record.id || record.canUseGeometry === false) continue
    const name = typeof record.title === "string" && record.title ? record.title : record.name
    if (typeof name === "string") entries.push({ id: `${CATALOG_PREFIX}${record.id}`, routeId: record.id, name })
  }
  return entries
}

export type TrackLoad = { state: "idle" } | { state: "loading" } | { state: "ready"; track: ReconTrack } | { state: "unavailable"; message: string }

/**
 * Resolves a track id to a track: journal rides directly, catalog routes by
 * fetching their geometry (aborted when the id changes or on unmount).
 */
export function useResolvedTrack(library: ReconLibrary, trackId: string | null): TrackLoad {
  const ride = useMemo(() => library.rides.find((candidate) => candidate.id === trackId) ?? null, [library.rides, trackId])
  const [fetched, setFetched] = useState<{ id: string; load: TrackLoad } | null>(null)
  const isCatalog = trackId?.startsWith(CATALOG_PREFIX) ?? false

  useEffect(() => {
    if (!trackId || !isCatalog) return
    const controller = new AbortController()
    const routeId = trackId.slice(CATALOG_PREFIX.length)
    fetchCatalogRoute(routeId, (input, init) => fetch(input, { ...init, signal: controller.signal }))
      .then((route) => {
        const track = adaptCatalogRoute(route)
        setFetched({
          id: trackId,
          load: track ? { state: "ready", track } : { state: "unavailable", message: "That route preview could not be read." }
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setFetched({ id: trackId, load: { state: "unavailable", message: "That route preview is unavailable right now." } })
      })
    return () => controller.abort()
  }, [trackId, isCatalog])

  // Settled once, when both the route and the catalog it is titled from are
  // in: a track whose identity changed after the replay engine started would
  // tear the engine down mid-film.
  const catalogSettled = library.catalogState !== "loading"
  const catalogTitle = isCatalog ? library.catalog.find((entry) => entry.id === trackId)?.name ?? null : null
  const titled = useMemo(
    () => (fetched && catalogSettled ? withCatalogTitle(fetched.load, catalogTitle) : null),
    [fetched, catalogSettled, catalogTitle]
  )

  if (!trackId) return { state: "idle" }
  if (isCatalog) {
    if (fetched?.id === trackId) return titled ?? { state: "loading" }
    return library.catalogState === "unavailable" ? { state: "unavailable", message: "Shared routes are unavailable right now." } : { state: "loading" }
  }
  if (ride) return { state: "ready", track: ride }
  if (library.ridesState === "loading") return { state: "loading" }
  return { state: "unavailable", message: "That ride isn't in this browser's ride journal." }
}

/** A shared route keeps the title its card and route page show, not its import filename. */
function withCatalogTitle(load: TrackLoad, title: string | null): TrackLoad {
  if (load.state !== "ready" || !title || title === load.track.name) return load
  return { state: "ready", track: { ...load.track, name: title } }
}

/** The map-features API rejects boxes wider than 3° × 2°; longer rides show no evidence. */
const MAX_BBOX = { lng: 3, lat: 2 }
const EVIDENCE_TOLERANCE_METERS = 30

/**
 * Gravel Atlas corridors that actually run along the track. Absence of
 * evidence is `[]`, a failed request is `null` (unknown) — neither is ever a
 * claim about the surface.
 */
export function useGravelEvidence(track: ReconTrack | null): Coordinate[][] | null {
  const [result, setResult] = useState<{ id: string; lines: Coordinate[][] | null } | null>(null)

  useEffect(() => {
    if (!track) return
    const controller = new AbortController()
    fetchGravelEvidence(track, controller.signal)
      .then((lines) => setResult({ id: track.id, lines }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ id: track.id, lines: null })
      })
    return () => controller.abort()
  }, [track])

  return track && result?.id === track.id ? result.lines : null
}

export async function fetchGravelEvidence(track: ReconTrack, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Coordinate[][] | null> {
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const [lng, lat] of track.geometry.coordinates) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  if (east - west > MAX_BBOX.lng || north - south > MAX_BBOX.lat) return null
  const query = new URLSearchParams({ bbox: `${west},${south},${east},${north}`, layers: "gravel-atlas" })
  const response = await fetcher(`/api/map-features?${query}`, { signal, cache: "no-store" })
  if (!response.ok) return null
  const body = (await response.json()) as { features?: unknown; unavailable?: unknown }
  // An unavailable Atlas is unknown surface, not a confirmed empty view.
  if (!Array.isArray(body.features) || (Array.isArray(body.unavailable) && body.unavailable.includes("gravel-atlas"))) return null
  const nearTrack = makeLineProximity([track.geometry.coordinates], EVIDENCE_TOLERANCE_METERS)
  const lines: Coordinate[][] = []
  for (const feature of body.features) {
    const geometry = (feature as { geometry?: { type?: unknown; coordinates?: unknown } })?.geometry
    const properties = (feature as { properties?: { layerId?: unknown } })?.properties
    if (properties?.layerId !== undefined && properties.layerId !== "gravel-atlas") continue
    const parts = geometry?.type === "LineString" ? [geometry.coordinates] : geometry?.type === "MultiLineString" ? (geometry.coordinates as unknown[]) : []
    for (const part of parts) {
      if (!Array.isArray(part)) continue
      const coordinates = part.filter((coordinate): coordinate is Coordinate => Array.isArray(coordinate) && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]))
      if (coordinates.length >= 2 && coordinates.some(nearTrack)) lines.push(coordinates)
    }
  }
  return lines
}
