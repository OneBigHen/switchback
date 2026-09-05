"use client"

import { useEffect, useMemo } from "react"
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

  if (routes.length === 0) return null

  return (
    <section className={styles.surface} role="region" aria-label="Route choices">
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
