"use client"

import { ArrowRight, MagnifyingGlass, RoadHorizon, SpinnerGap, WarningCircle } from "@phosphor-icons/react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { DestinationHeader } from "@/components/v2/DestinationHeader"
import styles from "./DiscoverDestination.module.css"

interface CommunityRouteSummary {
  id: string
  revisionId: string
  title: string
  description: string | null
  routeFingerprint: string
  stats: Record<string, number | string | null>
  provenanceClass: string
  visibility: "public" | "unlisted"
  updatedAt: string
}

const shortDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

function metric(stats: CommunityRouteSummary["stats"], key: string): number | null {
  const value = stats[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function provenanceLabel(value: string): string {
  if (value === "rider-recorded") return "Rider recorded"
  if (value === "built-and-verified") return "Built & verified"
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function updatedLabel(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return shortDateFormatter.format(date)
}

export function DiscoverDestination() {
  const [routes, setRoutes] = useState<CommunityRouteSummary[]>([])
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/community/routes?limit=24", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Community routes returned ${response.status}`)
        return response.json() as Promise<{ routes?: CommunityRouteSummary[] }>
      })
      .then((payload) => {
        if (controller.signal.aborted) return
        setRoutes(Array.isArray(payload.routes) ? payload.routes : [])
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return
        setStatus("error")
      })
    return () => controller.abort()
  }, [retryToken])

  const retry = () => {
    setStatus("loading")
    setRetryToken((token) => token + 1)
  }

  const filteredRoutes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return routes
    return routes.filter((route) => (
      route.title.toLowerCase().includes(needle)
      || route.description?.toLowerCase().includes(needle)
      || route.provenanceClass.toLowerCase().includes(needle)
    ))
  }, [query, routes])

  return (
    <section className={styles.destination} aria-label="Discover">
      <div className={styles.surface}>
        <DestinationHeader
          eyebrow="Community Atlas"
          title="Find a better road."
          description="Browse rider-published and verified routes without leaving the map experience. Search first, then open the full route only when something looks worth riding."
          actions={(
            <Link className={styles.atlasLink} href="/routes">
              <span>Open full Atlas</span>
              <ArrowRight weight="bold" aria-hidden="true" />
            </Link>
          )}
        />

        <form className={styles.toolbar} role="search" onSubmit={(event) => event.preventDefault()}>
          <MagnifyingGlass aria-hidden="true" />
          <label className="sr-only" htmlFor="discover-route-search">Search community routes</label>
          <input
            id="discover-route-search"
            type="search"
            aria-label="Search community routes"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search roads, rides, or route character"
            autoComplete="off"
          />
          <span className={styles.count} aria-live="polite">
            {status === "ready" ? `${filteredRoutes.length} ${filteredRoutes.length === 1 ? "route" : "routes"}` : ""}
          </span>
        </form>

        {status === "loading" ? (
          <div className={styles.state} role="status" aria-live="polite">
            <SpinnerGap className="spin" aria-hidden="true" />
            <div><strong>Reading the Atlas</strong><span>Loading community routes…</span></div>
          </div>
        ) : status === "error" ? (
          <div className={styles.state} role="alert">
            <WarningCircle weight="fill" aria-hidden="true" />
            <div><strong>Atlas unavailable</strong><span>Your planner and saved rides are unaffected.</span></div>
            <button type="button" onClick={retry}>Try again</button>
          </div>
        ) : filteredRoutes.length === 0 ? (
          <div className={styles.empty}>
            <RoadHorizon aria-hidden="true" />
            <strong>{routes.length === 0 ? "No public routes yet" : "No routes match that search"}</strong>
            <span>{routes.length === 0 ? "Published rides will appear here as the Atlas grows." : "Try a road name, route title, or riding style."}</span>
          </div>
        ) : (
          <section className={styles.grid} aria-label="Community routes">
            {filteredRoutes.map((route) => {
              const distance = metric(route.stats, "distanceMiles")
              const duration = metric(route.stats, "durationMinutes")
              const updated = updatedLabel(route.updatedAt)
              return (
                <article className={styles.route} key={route.id}>
                  <div className={styles.routeTopline}>
                    <span>{provenanceLabel(route.provenanceClass)}</span>
                    {updated ? <small>Updated {updated}</small> : null}
                  </div>
                  <Link className={styles.routeLink} href={`/routes/${encodeURIComponent(route.id)}`}>
                    <span>{route.title}</span>
                    <ArrowRight weight="bold" aria-hidden="true" />
                  </Link>
                  {route.description ? <p>{route.description}</p> : <p className={styles.noDescription}>Open the route for the rider-published line and details.</p>}
                  <div className={styles.facts} aria-label="Route summary">
                    {distance !== null ? <span><b>{distance.toFixed(1)}</b> mi</span> : null}
                    {duration !== null ? <span><b>{Math.round(duration)}</b> min</span> : null}
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </div>
    </section>
  )
}
