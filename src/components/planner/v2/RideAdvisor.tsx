"use client"

import { ArrowUp, ChatCircleDots, MapPin, MapTrifold, X } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import type {
  AdvisorMessage,
  GroundingCitation,
  ProposedRide,
  ProposedStop
} from "@/lib/advice/contracts"
import type { AdvisorCapability } from "@/lib/advice/capability"
import { advisorContextFromPlan } from "@/lib/advice/route-context"
import { selectNudge, type Nudge } from "@/lib/advice/nudges"
import { fetchAdvisorCapability, requestAdvisorTurn } from "@/lib/client/advisor-client"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"
import styles from "./RideAdvisor.module.css"

/**
 * The co-pilot.
 *
 * Themed after Clippy as a *cautionary tale*: never modal, never covering the
 * map, always dismissible, and silent unless it has a specific number to offer.
 * It renders nothing at all when the capability is absent (ADR 0021) — no
 * disabled state, no upsell, no hint that a paid thing exists.
 *
 * Two ways in. The **nudge** is deterministic, free, and instant: it comes from
 * the plan itself, so it cannot be wrong about a fact, and tapping it opens the
 * conversation already asking the useful question. The **panel** is the
 * conversation — stops, road character, and, when there is no route yet, a whole
 * ride the rider confirms with one tap.
 *
 * Everything the advisor offers is a suggestion. "Add to ride" and "Plan this
 * ride" hand structured inputs to the ordinary planner path, which routes
 * deterministically. The advisor never selects a route.
 */

const STARTERS_WITH_ROUTE = [
  "Anywhere good to stop?",
  "Is the extra time worth it?",
  "Any gravel on this?"
]

const STARTERS_NO_ROUTE = [
  "Three hours of gravel and a brewery at the end",
  "Somewhere twisty for the afternoon",
  "A half-day loop from here"
]

export interface RideAdvisorProps {
  routes: PlannedRoute[]
  selectedRouteId: string
  warnings: string[]
  /** Map centre or rider location, so place search works before a route exists. */
  origin?: { lat: number; lon: number; label?: string } | null
  /** Accept a proposed stop as an ordinary rider waypoint, then replan. */
  onAddStop(stop: Waypoint): void
  /** Accept a whole proposed ride: fills the planner's controls, then plans. */
  onPlanRide?(ride: ProposedRide): void
}

/** A turn plus a stable identity, so the thread never re-keys on append. */
interface ThreadTurn extends AdvisorMessage {
  key: string
}

let turnCounter = 0
function threadTurn(turn: AdvisorMessage): ThreadTurn {
  turnCounter += 1
  return { ...turn, key: `turn-${turnCounter}` }
}

function citationList(citations: GroundingCitation[]) {
  if (citations.length === 0) return null
  return (
    <ul className={styles.citations}>
      {citations.map((citation) => (
        <li key={citation.url}>
          {/* Sources sit immediately after the content they support, named and
              linked exactly as the source supplied them. */}
          <a href={citation.url} target="_blank" rel="noreferrer noopener" translate="no">
            {citation.title}
          </a>
        </li>
      ))}
    </ul>
  )
}

function rideShape(ride: ProposedRide): string {
  return [
    ride.mode === "loop" ? `Loop from ${ride.start.name}` : `${ride.start.name} → ${ride.finish?.name ?? "destination"}`,
    ride.targetMinutes ? `${Math.round(ride.targetMinutes / 6) / 10} hr` : null,
    `${ride.profile} roads`,
    ride.waypoints.length > 0 ? `via ${ride.waypoints.map((point) => point.name).join(", ")}` : null
  ].filter(Boolean).join(" · ")
}

export function RideAdvisor({
  routes,
  selectedRouteId,
  warnings,
  origin,
  onAddStop,
  onPlanRide
}: RideAdvisorProps) {
  const [capability, setCapability] = useState<AdvisorCapability | null>(null)
  const [open, setOpen] = useState(false)
  const [conversation, setConversation] = useState<ThreadTurn[]>([])
  const [stops, setStops] = useState<ProposedStop[]>([])
  const [ride, setRide] = useState<ProposedRide | null>(null)
  const [citations, setCitations] = useState<GroundingCitation[]>([])
  const [secondOpinion, setSecondOpinion] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [dismissedNudges, setDismissedNudges] = useState<string[]>([])
  const pending = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetchAdvisorCapability(controller.signal).then(setCapability)
    return () => controller.abort()
  }, [])

  // A new route is a new conversation: advice about the previous one would be
  // quietly wrong, which is worse than no advice. Adjusted during render rather
  // than in an effect so the stale thread is never painted once.
  const [threadRouteId, setThreadRouteId] = useState(selectedRouteId)
  if (threadRouteId !== selectedRouteId) {
    setThreadRouteId(selectedRouteId)
    setConversation([])
    setStops([])
    setRide(null)
    setCitations([])
    setSecondOpinion(null)
    setNotice(null)
  }

  useEffect(() => () => pending.current?.abort(), [])

  if (!capability?.enabled) return null

  const hasRoute = routes.length > 0
  const nudge: Nudge | null = hasRoute
    ? selectNudge({ routes, selectedRouteId, dismissed: dismissedNudges })
    : null

  const ask = async (riderMessage?: string) => {
    if (busy) return
    const context = hasRoute
      ? advisorContextFromPlan({ selectedRouteId, routes, warnings })
      : null
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setNotice(null)
    const history = conversation.map(({ role, text }): AdvisorMessage => ({ role, text }))
    const asked = riderMessage
      ? [...conversation, threadTurn({ role: "rider", text: riderMessage })]
      : conversation
    setConversation(asked)
    setDraft("")

    try {
      const reply = await requestAdvisorTurn({
        context,
        conversation: history,
        ...(riderMessage ? { riderMessage } : {}),
        ...(origin ? { origin } : {})
      }, controller.signal)
      if (controller.signal.aborted) return

      if (reply.status !== "ok") {
        setNotice(
          reply.status === "timeout"
            ? "That took too long — ask again if you want another read."
            : reply.status === "rate-limited"
              ? "I've hit my quota for the moment. Try again shortly."
              : "I couldn't reach my sources just now. Switchback's own picks are unaffected."
        )
        return
      }
      setConversation([...asked, threadTurn({ role: "advisor", text: reply.message })])
      setStops(reply.proposedStops)
      if (reply.proposedRide) setRide(reply.proposedRide)
      setCitations(reply.citations)
      setSecondOpinion(reply.secondOpinion
        ? reply.secondOpinion.agreesWithSwitchback
          ? `Agrees with Switchback's pick — ${reply.secondOpinion.rationale}`
          : `Would take "${routes.find((route) => route.id === reply.secondOpinion!.wouldPick)?.name ?? reply.secondOpinion.wouldPick}" instead — ${reply.secondOpinion.rationale}`
        : null)
    } finally {
      // A superseded turn must not clear the flag the newer one just set.
      if (pending.current === controller) setBusy(false)
    }
  }

  const openWith = (question?: string) => {
    setOpen(true)
    if (question) void ask(question)
    else if (conversation.length === 0) void ask()
  }

  if (!open) {
    return (
      <div className={styles.closed}>
        {nudge ? (
          <div className={styles.nudge} role="note">
            <span>{nudge.text}</span>
            <span className={styles.nudgeActions}>
              <button type="button" onClick={() => openWith(nudge.followUp)}>Ask about it</button>
              <button
                type="button"
                aria-label="Dismiss this suggestion"
                className={styles.nudgeDismiss}
                onClick={() => setDismissedNudges((ids) => [...ids, nudge.id])}
              >
                <X weight="bold" aria-hidden="true" />
              </button>
            </span>
          </div>
        ) : null}
        <button type="button" className={styles.trigger} onClick={() => openWith()}>
          <ChatCircleDots weight="fill" aria-hidden="true" />
          <span>{hasRoute ? "Ask about this ride" : "Plan a ride with me"}</span>
        </button>
      </div>
    )
  }

  return (
    <section className={styles.panel} aria-label="Ride advisor">
      <header className={styles.header}>
        <div>
          <span>Co-pilot</span>
          <h2>{hasRoute ? "What I'd do" : "Let's build one"}</h2>
        </div>
        <button type="button" aria-label="Close the ride advisor" onClick={() => setOpen(false)}>
          <X weight="bold" aria-hidden="true" />
        </button>
      </header>

      {secondOpinion ? (
        <p className={styles.verdict} role="note">{secondOpinion}</p>
      ) : null}

      <div className={styles.thread} role="log" aria-live="polite" aria-label="Advisor conversation">
        {conversation.map((turn) => (
          <p key={turn.key} className={turn.role === "rider" ? styles.rider : styles.advisor}>
            {turn.text}
          </p>
        ))}
        {busy ? <p className={styles.advisor}>Having a look…</p> : null}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      </div>

      {citationList(citations)}

      {ride && onPlanRide ? (
        <div className={styles.ride} aria-label="Proposed ride">
          <span className={styles.rideBody}>
            <strong>{ride.summary}</strong>
            <small>{rideShape(ride)}</small>
            <small className={styles.rideNote}>
              Everything here is editable after — this just fills in the planner.
            </small>
          </span>
          <button
            type="button"
            className={styles.plan}
            onClick={() => {
              onPlanRide(ride)
              setRide(null)
            }}
          >
            <MapTrifold weight="fill" aria-hidden="true" />
            <span>Plan this ride</span>
          </button>
        </div>
      ) : null}

      {stops.length > 0 ? (
        <div className={styles.stops} aria-label="Suggested stops">
          {stops.map((stop) => (
            <div className={styles.stop} key={stop.id}>
              <span className={styles.stopBody}>
                <strong>{stop.name}</strong>
                <small>{stop.reason}</small>
                {stop.routeProgress !== null ? (
                  <small className={styles.stopWhere}>
                    About {Math.round(stop.routeProgress * 100)}% of the way along
                  </small>
                ) : null}
              </span>
              <button
                type="button"
                className={styles.add}
                onClick={() => {
                  onAddStop({ lat: stop.anchor.lat, lon: stop.anchor.lon, label: stop.name })
                  setStops((current) => current.filter((entry) => entry.id !== stop.id))
                }}
              >
                <MapPin weight="fill" aria-hidden="true" />
                <span>Add to ride</span>
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {conversation.length <= 1 && !busy ? (
        <div className={styles.starters}>
          {(hasRoute ? STARTERS_WITH_ROUTE : STARTERS_NO_ROUTE).map((prompt) => (
            <button type="button" key={prompt} onClick={() => void ask(prompt)}>{prompt}</button>
          ))}
        </div>
      ) : null}

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault()
          const question = draft.trim()
          if (question) void ask(question)
        }}
      >
        <input
          type="text"
          value={draft}
          maxLength={400}
          placeholder={hasRoute
            ? "Ask about the roads, the stops, the trade-off…"
            : "Tell me what you feel like riding…"}
          aria-label="Ask the ride advisor"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" aria-label="Send to the ride advisor" disabled={busy || draft.trim().length === 0}>
          <ArrowUp weight="bold" aria-hidden="true" />
        </button>
      </form>

      {capability.attributions.length > 0 ? (
        <p className={styles.attribution} translate="no">{capability.attributions.join(" · ")}</p>
      ) : null}
    </section>
  )
}
