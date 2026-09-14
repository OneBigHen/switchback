"use client"

import { useCallback, useEffect, useState } from "react"
import { RouteLibrary } from "@/lib/storage/route-library"

export interface SavedCatalogRoutes {
  /** Catalog ids the rider already keeps a copy of. */
  readonly ids: ReadonlySet<string>
  readonly ready: boolean
  refresh(): void
}

const EMPTY: ReadonlySet<string> = new Set()

/**
 * Which catalog routes the rider has saved, read **once** for a whole listing.
 *
 * Asking each card to look its own saved state up meant one IndexedDB scan per
 * card — a hundred-plus scans of the same table to render one screen. The
 * library is small and the answer is shared, so it is loaded once here.
 */
export function useSavedCatalogRoutes(): SavedCatalogRoutes {
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY)
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Constructing the database can throw (private mode, blocked storage), so
    // it happens inside the promise chain: an unknown saved state renders as
    // "not saved", it never fails the listing.
    Promise.resolve()
      .then(() => new RouteLibrary().list())
      .then((routes) => {
        if (cancelled) return
        setIds(new Set(
          routes
            .map((route) => route.libraryProvenance.kind === "catalog-copy"
              ? route.libraryProvenance.sourceCatalogRouteId
              : null)
            .filter((id): id is string => typeof id === "string")
        ))
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const refresh = useCallback(() => setToken((value) => value + 1), [])
  return { ids, ready, refresh }
}
