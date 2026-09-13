"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { adaptRecordedRide } from "@/features/recon/data/recorded-ride-adapter"
import { adaptCatalogRoute } from "@/features/recon/data/catalog-route-adapter"
import { fetchCatalogRoute } from "@/lib/gpx/catalog-client"
import { RideJournalLibrary } from "@/lib/storage/ride-journal"
import type { ReconTrack } from "@/features/recon/types"
import { ReconTrackPicker, type CatalogEntry } from "./recon-track-picker"
import { formatTrackHudLine } from "./recon-format"
import styles from "./recon-explorer.module.css"

// MapLibre needs the browser: the map loads client-side only, after this
// route is already interactive. Recon never imports map code from a module
// that participates in ordinary app startup.
const ReconTrackMap = dynamic(() => import("./recon-track-map"), {
  ssr: false,
  loading: () => <div className={styles.mapLoading} aria-hidden="true" />,
})

interface ReconExplorerProps {
  /** Test seam only: injects pre-adapted recorded tracks. */
  initialRecordedTracks?: ReconTrack[]
}

export default function ReconExplorer({ initialRecordedTracks }: ReconExplorerProps = {}) {
  const [recordedTracks, setRecordedTracks] = useState<ReconTrack[] | null>(
    initialRecordedTracks ?? null
  )
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[] | null>(null)
  const [catalogUnavailable, setCatalogUnavailable] = useState(false)
  const [catalogTracks, setCatalogTracks] = useState<Map<string, ReconTrack>>(() => new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const inflightPreviews = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    const journal = new RideJournalLibrary()
    journal
      .list()
      .then((rides) => {
        if (cancelled) return
        setRecordedTracks(
          rides
            .map((ride) => adaptRecordedRide(ride))
            .filter((track): track is ReconTrack => track !== null)
        )
      })
      .catch(() => {
        // An unavailable journal degrades to an empty explorer, never a crash.
        if (!cancelled) setRecordedTracks([])
      })

    fetch("/api/gpx-library", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`catalog ${response.status}`)
        return (await response.json()) as unknown
      })
      .then((body) => {
        if (!cancelled) setCatalogEntries(parseCatalogEntries(body))
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return
        setCatalogUnavailable(true)
        setCatalogEntries([])
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  // The effective selection is derived during render: the rider's explicit
  // choice when one exists, otherwise the first available track.
  const resolvedSelectedId =
    selectedId ??
    (recordedTracks !== null && recordedTracks.length > 0 ? recordedTracks[0]!.id : null) ??
    (catalogEntries !== null && catalogEntries.length > 0 ? catalogEntries[0]!.id : null)

  const selectedTrack = useMemo(() => {
    if (resolvedSelectedId === null) return null
    return (
      recordedTracks?.find((track) => track.id === resolvedSelectedId) ??
      catalogTracks.get(resolvedSelectedId) ??
      null
    )
  }, [resolvedSelectedId, recordedTracks, catalogTracks])

  // Catalog geometry loads lazily, one route at a time, when selected.
  // State updates happen in the promise callbacks, never in the effect body.
  useEffect(() => {
    if (
      resolvedSelectedId === null ||
      selectedTrack !== null ||
      catalogEntries === null ||
      !catalogEntries.some((entry) => entry.id === resolvedSelectedId)
    ) {
      return
    }
    if (inflightPreviews.current.has(resolvedSelectedId)) return

    const controller = new AbortController()
    inflightPreviews.current.set(resolvedSelectedId, controller)
    const fetcher: typeof fetch = (input, init) =>
      fetch(input, { ...init, signal: controller.signal })

    fetchCatalogRoute(resolvedSelectedId, fetcher)
      .then((route) => {
        const track = adaptCatalogRoute(route)
        if (!track) {
          setPreviewError("That route preview could not be read.")
          return
        }
        setPreviewError(null)
        setCatalogTracks((previous) => new Map(previous).set(resolvedSelectedId, track))
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPreviewError("Route preview is unavailable right now.")
        }
      })
      .finally(() => {
        inflightPreviews.current.delete(resolvedSelectedId)
      })
  }, [resolvedSelectedId, selectedTrack, catalogEntries])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setPreviewError(null)
  }, [])

  const loading = recordedTracks === null || (catalogEntries === null && !catalogUnavailable)
  const hasAnyTrack = (recordedTracks?.length ?? 0) > 0 || (catalogEntries?.length ?? 0) > 0

  return (
    <div className={styles.explorer}>
      <ReconTrackMap track={selectedTrack} />

      {!loading && !hasAnyTrack ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyCard}>
            <span className={styles.emptyMark} aria-hidden="true" />
            <p className={styles.labsTag}>OpenGravel Labs</p>
            <h1 className={styles.emptyTitle}>Recon</h1>
            <p className={styles.emptyCopy}>
              Record a ride and Recon will bring it back to life.
            </p>
            <p className={styles.emptyNote}>
              Recon is an experimental way to explore the rides and routes OpenGravel
              already owns. Nothing here edits your routes or your ride journal.
            </p>
            <Link className={styles.backLink} href="/">
              ← OpenGravel planner
            </Link>
          </div>
        </div>
      ) : (
        <>
          <aside className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <p className={styles.labsTag}>OpenGravel Labs</p>
                <h1 className={styles.wordmark}>Recon</h1>
              </div>
              <Link className={styles.backLink} href="/">
                ← Planner
              </Link>
            </header>
            <ReconTrackPicker
              recordedTracks={recordedTracks ?? []}
              catalogEntries={catalogEntries ?? []}
              catalogUnavailable={catalogUnavailable}
              loading={loading}
              selectedId={resolvedSelectedId}
              onSelect={handleSelect}
            />
          </aside>

          {selectedTrack ? (
            <section className={styles.hud} aria-live="polite">
              <p className={styles.labsTag}>
                {selectedTrack.playbackKind === "recorded" ? "Recorded ride" : "Route preview"}
              </p>
              <h2 className={styles.wordmark}>{selectedTrack.name}</h2>
              <p className={styles.hudMeta}>
                {formatTrackHudLine(selectedTrack)}
                {selectedTrack.facts.ascentMeters !== null &&
                selectedTrack.facts.descentMeters !== null
                  ? ` · ↑${Math.round(selectedTrack.facts.ascentMeters)} m ↓${Math.round(
                      selectedTrack.facts.descentMeters
                    )} m`
                  : ""}
              </p>
              {previewError ? <p className={styles.hudMeta}>{previewError}</p> : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function parseCatalogEntries(body: unknown): CatalogEntry[] {
  if (!body || typeof body !== "object") return []
  const routes = (body as { routes?: unknown }).routes
  if (!Array.isArray(routes)) return []
  const entries: CatalogEntry[] = []
  for (const item of routes) {
    if (!item || typeof item !== "object") continue
    const record = item as { id?: unknown; name?: unknown }
    if (typeof record.id === "string" && record.id.length > 0 && typeof record.name === "string") {
      entries.push({ id: record.id, name: record.name })
    }
    if (entries.length >= 50) break
  }
  return entries
}
