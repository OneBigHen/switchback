"use client"

import type { PlannedRoute } from "@/lib/routing/types"
import { RouteDecisionCard } from "./RouteDecisionCard"
import styles from "./RouteDecisionRail.module.css"

export interface RouteDecisionRailProps {
  routes: PlannedRoute[]
  selectedId: string
  onSelect(id: string): void
  onOpenDetails?(id: string): void
}

export function RouteDecisionRail({ routes, selectedId, onSelect, onOpenDetails }: RouteDecisionRailProps) {
  if (routes.length === 0) return null

  return (
    <section className={styles.surface} role="region" aria-label="Route choices">
      <header className={styles.header}>
        <div>
          <span>Choose</span>
          <h2>Pick the ride, not the algorithm.</h2>
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
            onSelect={onSelect}
            onOpenDetails={onOpenDetails}
          />
        ))}
      </div>
    </section>
  )
}
