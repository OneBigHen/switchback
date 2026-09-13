"use client"

import { useEffect, useState } from "react"
import { saveCatalogRouteToMyRides, type CatalogCopyLibrary } from "@/lib/gpx/catalog-client"
import { RouteLibrary } from "@/lib/storage/route-library"

type ActionState =
  | { kind: "checking" }
  | { kind: "unsaved"; error?: string }
  | { kind: "saving" }
  | { kind: "saved"; copyId: string; created: boolean }
  | { kind: "storage-unavailable" }

export interface RouteLibraryActionsProps {
  catalogRouteId: string
  routeName: string
  /** False when the catalog kept no drawable/real geometry for this entry. */
  canUseGeometry: boolean
  /** Injected in tests; defaults to this browser's My Rides library. */
  library?: CatalogCopyLibrary
  fetcher?: typeof fetch
  className?: string
}

/**
 * Explicit Route Library actions for one shared catalog route.
 *
 * - Open in Planner is a navigation only; it never writes to My Rides.
 * - Save to My Rides fetches and validates the full route, then writes one
 *   duplicate-safe `catalog-copy`. An existing copy is recognised on mount.
 * - Open saved copy loads the rider-owned row, not the shared entry.
 */
export function RouteLibraryActions({
  catalogRouteId,
  routeName,
  canUseGeometry,
  library: injectedLibrary,
  fetcher,
  className
}: RouteLibraryActionsProps) {
  const [state, setState] = useState<ActionState>({ kind: "checking" })
  // Resolved lazily so server rendering never constructs a browser database.
  const resolveLibrary = (): CatalogCopyLibrary => injectedLibrary ?? defaultLibrary()

  useEffect(() => {
    let cancelled = false
    resolveLibrary().findCatalogCopy(catalogRouteId)
      .then((existing) => {
        if (cancelled) return
        setState(existing
          ? { kind: "saved", copyId: existing.id, created: false }
          : { kind: "unsaved" })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "storage-unavailable" })
      })
    return () => {
      cancelled = true
    }
    // The library is fixed for the component's lifetime; re-check per route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogRouteId])

  const save = async () => {
    setState({ kind: "saving" })
    try {
      const result = await saveCatalogRouteToMyRides(resolveLibrary(), catalogRouteId, fetcher)
      setState({ kind: "saved", copyId: result.route.id, created: result.created })
    } catch (caught) {
      setState({
        kind: "unsaved",
        error: caught instanceof Error ? caught.message : `${routeName} could not be saved to My Rides.`
      })
    }
  }

  const saveDisabled = !canUseGeometry || state.kind !== "unsaved"

  return (
    <div className={className ?? "atlas-launch"}>
      {canUseGeometry ? (
        <a href={`/?ride=${encodeURIComponent(catalogRouteId)}`} className="atlas-launch-primary">
          Open in Planner
        </a>
      ) : (
        <span className="atlas-launch-primary is-disabled" aria-disabled="true">Geometry not retained</span>
      )}

      {state.kind === "saved" ? (
        <>
          <p className="atlas-launch-status" role="status">
            {state.created ? "Saved to My Rides" : "Already in My Rides"}
          </p>
          <a href={`/?savedRoute=${encodeURIComponent(state.copyId)}`} className="atlas-launch-secondary">
            Open saved copy
          </a>
        </>
      ) : (
        <button
          type="button"
          className="atlas-launch-save"
          onClick={() => void save()}
          disabled={saveDisabled}
          aria-busy={state.kind === "saving" || state.kind === "checking"}
        >
          {state.kind === "saving" ? "Saving…" : "Save to My Rides"}
        </button>
      )}

      {state.kind === "unsaved" && state.error ? (
        <p className="atlas-launch-error" role="alert">{state.error}</p>
      ) : null}
      {state.kind === "storage-unavailable" ? (
        <p className="atlas-launch-error" role="alert">
          My Rides is not available in this browser, so this route cannot be saved here.
        </p>
      ) : null}
    </div>
  )
}

let sharedLibrary: RouteLibrary | null = null

/** One lazily-opened handle on this browser's My Rides database. */
function defaultLibrary(): RouteLibrary {
  sharedLibrary ??= new RouteLibrary()
  return sharedLibrary
}
