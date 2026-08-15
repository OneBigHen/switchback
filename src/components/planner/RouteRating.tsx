"use client"

import { Star } from "@phosphor-icons/react"
import { useState } from "react"
import type { PlannedRoute } from "@/lib/routing/types"
import { explainRouteFit, type RiderPreference } from "@/lib/intelligence/rider-preferences"
import { getActiveBike, loadRiderSettings } from "@/lib/settings/rider-settings"

interface RouteRatingProps {
  route: PlannedRoute
  onRate?(route: PlannedRoute, bikeId: string, rating: 1 | 2 | 3 | 4 | 5): Promise<RiderPreference> | void
}

export function RouteRating({ route, onRate }: RouteRatingProps) {
  // The bike identity comes from the one settings source (SB-011): the
  // display name is never the learning key, so renaming a bike cannot
  // reset or cross-wire its preferences.
  const [bike] = useState(() => {
    const settings = loadRiderSettings()
    return getActiveBike(settings)
  })
  const [rating, setRating] = useState<number | null>(null)
  const [fit, setFit] = useState<ReturnType<typeof explainRouteFit> | null>(null)
  if (!onRate) return null
  return (
    <section className="route-rating" aria-label="Teach Switchback your road taste">
      <div>
        <strong>Rate this route for this bike</strong>
      </div>
      <p className="route-rating-bike">
        Bike: <strong>{bike.name}</strong>
      </p>
      <div className="route-rating-buttons" role="group" aria-label="Route rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            type="button"
            key={value}
            aria-label={`Rate route ${value} out of 5`}
            aria-pressed={rating === value}
            onClick={() => {
              setRating(value)
              void Promise.resolve(onRate(route, bike.id, value as 1 | 2 | 3 | 4 | 5)).then((preference) => {
                if (preference) setFit(explainRouteFit(preference, route))
              }).catch(() => undefined)
            }}
          >
            <Star weight={rating !== null && value <= rating ? "fill" : "regular"} aria-hidden="true" />
          </button>
        ))}
      </div>
      <small>Only explicit ratings and edits shape this bike’s local preference profile.</small>
      {fit ? <div className="route-fit-explanation" role="status">
        <strong>{fit.score}% fit · {fit.confidence} confidence</strong>
        <span>{fit.reasons[0]}</span>
      </div> : null}
    </section>
  )
}
