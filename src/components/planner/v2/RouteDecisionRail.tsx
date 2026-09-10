"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import type { PlannedRoute } from "@/lib/routing/types"
import {
  clearRoutePreviewIfInvalid,
  setRoutePreviewId
} from "../route-comparison-preview"
import { RouteDecisionCard } from "./RouteDecisionCard"
import styles from "./RouteDecisionRail.module.css"

export interface RouteDecisionRailProps {
  routes: PlannedRoute[]
  selectedId: string
  onSelect(id: string): void
  onOpenDetails?(id: string): void
}

export function RouteDecisionRail({ routes, selectedId, onSelect, onOpenDetails }: RouteDecisionRailProps) {
  const routeIds = useMemo(() => routes.map((route) => route.id), [routes])
  const routeKey = routeIds.join("|")

  useEffect(() => {
    clearRoutePreviewIfInvalid(routeIds)
    return () => setRoutePreviewId(null)
    // `routeKey` is the semantic identity. Do not clear a live preview merely
    // because a parent produced a new array containing the same candidates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // Results are inserted into a scroll owner the rider has already scrolled to
  // the bottom of while filling in the editor. A new candidate set can leave
  // the first card clipped even when the rail's top edge is technically still
  // inside the viewport, so always anchor the new rail to the scroll owner's
  // top rather than trusting that partial visibility.
  const surfaceRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const surface = surfaceRef.current
      const scroll = surface?.closest<HTMLElement>(".planner-scroll")
      if (!surface || !scroll) return
      const surfaceBox = surface.getBoundingClientRect()
      const scrollBox = scroll.getBoundingClientRect()
      scroll.scrollTo({
        top: Math.max(0, scroll.scrollTop + surfaceBox.top - scrollBox.top - 8),
        behavior: "auto"
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [routeKey])

  if (routes.length === 0) return null

  return (
    <section ref={surfaceRef} className={styles.surface} role="region" aria-label="Route choices">
      <header className={styles.header}>
        <div>
          <span>Route options</span>
          <h2>Choose your ride</h2>
        </div>
        <small>{routes.length} {routes.length === 1 ? "route" : "routes"}</small>
      </header>
      <div className={styles.rail}>
        {routes.map((route) => (
          <RouteDecisionCard
            key={route.id}
            route={route}
            routes={routes}
            selected={route.id === selectedId}
            selectedRouteId={selectedId}
            onSelect={onSelect}
            onOpenDetails={onOpenDetails}
            onPreview={setRoutePreviewId}
          />
        ))}
      </div>
    </section>
  )
}
