"use client"

import { CaretDown, CaretUp, GasPump, MoonStars, Timer } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import { buildTripStages, withOvernightLabel } from "@/lib/trip/stage-planner"
import type { TripStageConstraints, TripStagePlan } from "@/lib/trip/stage-planner"
import type { PlannedRoute } from "@/lib/routing/types"
import type { TripPlan } from "@/lib/trip/trip-plan"
import { DEFAULT_TRIP_STAGE_CONSTRAINTS } from "@/lib/trip/trip-plan"

interface TripStagePanelProps {
  route: PlannedRoute
  savedTrip?: TripPlan
  onSave?(plan: TripStagePlan, constraints: TripStageConstraints): void
}

export function TripStagePanel({ route, savedTrip, onSave }: TripStagePanelProps) {
  const initialTrip = savedTrip?.routeId === route.id ? savedTrip : undefined
  const [open, setOpen] = useState(false)
  const [targetDayMinutes, setTargetDayMinutes] = useState(() => initialTrip?.constraints.targetDayMinutes ?? DEFAULT_TRIP_STAGE_CONSTRAINTS.targetDayMinutes)
  const [fuelRangeMiles, setFuelRangeMiles] = useState(() => initialTrip?.constraints.fuelRangeMiles ?? DEFAULT_TRIP_STAGE_CONSTRAINTS.fuelRangeMiles)
  const [fuelReserveMiles, setFuelReserveMiles] = useState(() => initialTrip?.constraints.fuelReserveMiles ?? DEFAULT_TRIP_STAGE_CONSTRAINTS.fuelReserveMiles)
  const [breakEveryMinutes, setBreakEveryMinutes] = useState(() => initialTrip?.constraints.breakEveryMinutes ?? DEFAULT_TRIP_STAGE_CONSTRAINTS.breakEveryMinutes)
  const [daylightMinutes, setDaylightMinutes] = useState(() => initialTrip?.constraints.daylightMinutes ?? DEFAULT_TRIP_STAGE_CONSTRAINTS.daylightMinutes)
  const [overnights, setOvernights] = useState<Record<string, string>>(() => Object.fromEntries(initialTrip?.stages.flatMap((stage) => stage.overnightLabel ? [[stage.id, stage.overnightLabel]] : []) ?? []))
  const [restoredPlan, setRestoredPlan] = useState<TripStagePlan | null>(() => initialTrip
    ? { routeId: initialTrip.routeId, stages: initialTrip.stages, warnings: initialTrip.warnings }
    : null)
  const constraints = useMemo(() => ({ targetDayMinutes, fuelRangeMiles, fuelReserveMiles, breakEveryMinutes, daylightMinutes }), [breakEveryMinutes, daylightMinutes, fuelRangeMiles, fuelReserveMiles, targetDayMinutes])
  const calculatedPlan = useMemo(() => {
    try {
      return buildTripStages(route, constraints)
    } catch (caught) {
      return caught instanceof Error ? caught : new Error("Trip stages could not be calculated.")
    }
  }, [constraints, route])
  const plan = restoredPlan ?? calculatedPlan

  const resetRestoredPlan = () => setRestoredPlan(null)

  return (
    <section className="trip-stage-panel" aria-label="Multi-day trip plan">
      <button
        type="button"
        className="directions-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span><MoonStars aria-hidden="true" /> Stage this trip</span>
        <span>{open ? "Hide" : "Plan days"} {open ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" />}</span>
      </button>
      {open ? (
        <div className="trip-stage-content">
          <p>Build editable day boundaries first, then choose real fuel, food, lodging, or camping stops. Suggestions are conservative windows, not reservations.</p>
          <div className="trip-stage-controls">
            <label>Daily ride
              <input aria-label="Daily ride minutes" type="number" min="60" max="900" step="30" value={targetDayMinutes} onChange={(event) => { resetRestoredPlan(); setTargetDayMinutes(Number(event.target.value)) }} />
              <small>minutes</small>
            </label>
            <label>Fuel range
              <input aria-label="Fuel range miles" type="number" min="20" max="600" step="5" value={fuelRangeMiles} onChange={(event) => { resetRestoredPlan(); setFuelRangeMiles(Number(event.target.value)) }} />
              <small>miles</small>
            </label>
            <label>Reserve
              <input aria-label="Fuel reserve miles" type="number" min="5" max="200" step="5" value={fuelReserveMiles} onChange={(event) => { resetRestoredPlan(); setFuelReserveMiles(Number(event.target.value)) }} />
              <small>miles</small>
            </label>
            <label>Break cadence
              <input aria-label="Break cadence minutes" type="number" min="30" max="360" step="15" value={breakEveryMinutes} onChange={(event) => { resetRestoredPlan(); setBreakEveryMinutes(Number(event.target.value)) }} />
              <small>minutes</small>
            </label>
            <label>Daylight window
              <input aria-label="Daylight window minutes" type="number" min="60" max="900" step="15" value={daylightMinutes} onChange={(event) => { resetRestoredPlan(); setDaylightMinutes(Number(event.target.value)) }} />
              <small>minutes</small>
            </label>
          </div>
          {plan instanceof Error ? <p className="trip-stage-error" role="alert">{plan.message}</p> : (
            <>
              {plan.warnings.map((warning) => <p className="trip-stage-warning" key={warning}>{warning}</p>)}
              {onSave ? <button type="button" onClick={() => onSave(Object.entries(overnights).reduce((current, [stageId, label]) => withOvernightLabel(current, stageId, label), plan), constraints)}>Save this trip locally</button> : null}
              <ol className="trip-stage-list">
                {plan.stages.map((stage) => (
                  <li key={stage.id}>
                    <strong>{stage.label}</strong>
                    <span>{stage.distanceMiles.toFixed(0)} mi · {stage.durationMinutes} min</span>
                    <small><GasPump aria-hidden="true" /> {stage.fuelStops.length ? `${stage.fuelStops.length} fuel window${stage.fuelStops.length === 1 ? "" : "s"}` : "Fuel range covered"}</small>
                    <small><Timer aria-hidden="true" /> {stage.breaks.length ? `${stage.breaks.length} rest window${stage.breaks.length === 1 ? "" : "s"}` : "No break window"}</small>
                    {stage.id !== plan.stages.at(-1)?.id ? <label>Overnight stop
                      <input aria-label={`Overnight stop for ${stage.label}`} value={overnights[stage.id] ?? ""} placeholder={stage.finish.label} onChange={(event) => setOvernights((values) => ({ ...values, [stage.id]: event.target.value }))} />
                    </label> : null}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
