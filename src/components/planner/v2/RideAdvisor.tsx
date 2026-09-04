"use client"

import { ArrowUp, ChatCircleDots, MapPin, MapTrifold, Sparkle, X } from "@phosphor-icons/react"
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
import type { PlannedRoute } from "@/lib/routing/types"
import styles from "./RideAdvisor.module.css"

/**
 * One co-pilot, two natural entry points:
 *
 * - With no route, it is a ride builder. The rider describes the day they want
 *   and gets a bounded, geocoder-resolved planner proposal to confirm.
 * - With routes, it becomes the second opinion: trade-offs, road character,
 *   gravel and real stops. The conversation survives the transition so a ride
 *   the co-pilot just built does not suddenly forget why it exists.
 *
 * It is never modal, never on the routing critical path, and never owns a route
 * decision. Structured proposals go through the ordinary planner boundary.
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
  /** Explicit planner start, when the rider has supplied one. */
  origin?: { lat: number; lon: number; label?: string } | null
  /** Accept a proposed stop with its along-route evidence intact. */
  onAddStop(stop: ProposedStop): void
  /** Confirm a whole proposed ride and hand it to the ordinary planner. */
  onPlanRide?(ride: ProposedRide): void
}

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
    <ul className={styles.citations} aria-label="Advisor sources">
      {citations.map((citation) => (
        <li key={citation.url}>
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
    ride.mode === "loop"
      ? `Loop from ${ride.start.name}`
      : `${ride.start.name} → ${ride.finish?.name ?? "destination"}`,
    ride.targetMinutes ? `${Math.round(ride.targetMinutes / 6) / 10} hr` : null,
    `${ride.profile} roads`,
    ride.avoidHighways ? "avoid highways" : null,
    ride.tollPolicy === "avoid" ? "avoid tolls" : null,
    ride.waypoints.length > 0 ? `via ${ride.waypoints.map((point) => point.name).join(", ")}` : null
  ].filter(Boolean).join(" · ")
}

function scopeFor(routes: readonly PlannedRoute[], selectedRouteId: string): string {
  return `${selectedRouteId}|${routes.map((route) => route.id).join(",")}`
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
  const threadRef = useRef<HTMLDivElement | null>(null)
  const currentScope = scopeFor(routes, selectedRouteId)
  // The scope the visible artifacts belong to, held twice on purpose, because
  // two callers need it and neither can use the other's copy: render must not
  // read a ref, and an async reply resolving later must not read a value its
  // closure captured before the route changed. The state answers "is what I am
  // about to paint stale", so the one render between a route change and the
  // reset effect already hides stale artifacts; the ref answers "is this reply
  // still wanted", and doubles as the effect's guard so a double-invoked effect
  // cannot abort a request the second pass just started.
  const [scope, setScope] = useState(currentScope)
  const scopeRef = useRef(currentScope)
  const scopeStale = scope !== currentScope

  useEffect(() => {
    const controller = new AbortController()
    void fetchAdvisorCapability(controller.signal).then((next) => {
      if (!controller.signal.aborted) setCapability(next)
    })
    return () => controller.abort()
  }, [])

  // Route changes invalidate route-scoped artifacts and any in-flight answer,
  // but deliberately keep the transcript so a ride the co-pilot just built does
  // not lose the conversation that produced it.
  useEffect(() => {
    if (scopeRef.current === currentScope) return
    const hadConversation = conversation.length > 0
    scopeRef.current = currentScope
    pending.current?.abort()
    pending.current = null
    setScope(currentScope)
    setBusy(false)
    setStops([])
    setRide(null)
    setCitations([])
    setSecondOpinion(null)
    setNotice(hadConversation && selectedRouteId
      ? "Route changed \u2014 I\u2019ll use the route you have selected now."
      : null)
  }, [conversation.length, currentScope, selectedRouteId])

  // The thread is a bounded scroller, so a new turn would otherwise land below
  // the fold. Follow the newest turn instead of making the rider hunt for it.
  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    })
  }, [conversation.length, busy])

  useEffect(() => () => pending.current?.abort(), [])

  if (!capability?.enabled) return null

  const hasRoute = routes.length > 0
  const visibleStops = scopeStale ? [] : stops
  const visibleRide = scopeStale ? null : ride
  const visibleCitations = scopeStale ? [] : citations
  const visibleSecondOpinion = scopeStale ? null : secondOpinion
  const visibleBusy = scopeStale ? false : busy
  const visibleNotice = scopeStale ? null : notice
  const nudge: Nudge | null = hasRoute
    ? selectNudge({ routes, selectedRouteId, dismissed: dismissedNudges })
    : null

  const ask = async (riderMessage?: string) => {
    if (busy && !scopeStale) return
    const context = hasRoute
      ? advisorContextFromPlan({ selectedRouteId, routes, warnings })
      : null
    pending.current?.abort()
    const controller = new AbortController()
    const requestScope = currentScope
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
      if (controller.signal.aborted || scopeRef.current !== requestScope) return

      if (reply.status !== "ok") {
        setNotice(
          reply.status === "timeout"
            ? "That took too long — ask again if you want another read."
            : reply.status === "rate-limited"
              ? "I’ve hit the turn limit for the moment. Try again shortly."
              : "I couldn’t reach my sources just now. Switchback’s own planner is unaffected."
        )
        return
      }
      setConversation([...asked, threadTurn({ role: "advisor", text: reply.message })])
      setStops(reply.proposedStops)
      setRide(reply.proposedRide)
      setCitations(reply.citations)
      setSecondOpinion(reply.secondOpinion
        ? reply.secondOpinion.agreesWithSwitchback
          ? `Agrees with Switchback’s pick — ${reply.secondOpinion.rationale}`
          : `Would take “${routes.find((route) => route.id === reply.secondOpinion!.wouldPick)?.name ?? reply.secondOpinion.wouldPick}” instead — ${reply.secondOpinion.rationale}`
        : null)
    } finally {
      if (pending.current === controller) setBusy(false)
    }
  }

  const openWith = (question?: string) => {
    setOpen(true)
    if (question) {
      void ask(question)
      return
    }
    // Opening the builder should not spend a model turn merely to ask what the
    // rider wants. A routed ride can earn an automatic opening read.
    if (hasRoute && conversation.length === 0) void ask()
  }

  if (!open) {
    if (!hasRoute) {
      return (
        <section className={styles.builderCard} aria-label="AI ride builder">
          <div className={styles.builderLead}>
            <span className={styles.builderIcon} aria-hidden="true"><Sparkle weight="fill" /></span>
            <span>
              <small>AI ride builder</small>
              <strong>Describe the ride, not just the destination.</strong>
              <span>Time, gravel, back roads, food, a place to end up — give me the vibe and I’ll turn it into a plan you can inspect.</span>
            </span>
          </div>
          <div className={styles.builderQuick} aria-label="Ride builder examples">
            {STARTERS_NO_ROUTE.slice(0, 2).map((prompt) => (
              <button type="button" key={prompt} onClick={() => openWith(prompt)}>{prompt}</button>
            ))}
          </div>
          <button type="button" className={styles.builderOpen} onClick={() => openWith()}>
            <ChatCircleDots weight="fill" aria-hidden="true" />
            <span>Plan a ride with me</span>
          </button>
        </section>
      )
    }

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
          <span>Ask about this ride</span>
        </button>
      </div>
    )
  }

  return (
    <section className={styles.panel} aria-label="Ride advisor">
      <header className={styles.header}>
        <div>
          <span>{hasRoute ? "Co-pilot" : "Ride builder"}</span>
          <h2>{hasRoute ? "What I'd do" : "Build me a good one"}</h2>
        </div>
        <button type="button" aria-label="Close the ride advisor" onClick={() => setOpen(false)}>
          <X weight="bold" aria-hidden="true" />
        </button>
      </header>

      {visibleSecondOpinion ? <p className={styles.verdict} role="note">{visibleSecondOpinion}</p> : null}

      <div ref={threadRef} className={styles.thread} role="log" aria-live="polite" aria-label="Advisor conversation" tabIndex={0}>
        {!hasRoute && conversation.length === 0 && !visibleBusy ? (
          <p className={styles.emptyLead}>
            Tell me how long you have and what sounds fun. A start helps; if you haven’t picked one yet, name the town.
          </p>
        ) : null}
        {conversation.map((turn) => (
          <p key={turn.key} className={turn.role === "rider" ? styles.rider : styles.advisor}>
            {turn.text}
          </p>
        ))}
        {visibleBusy ? <p className={styles.advisor}>Reading the roads…</p> : null}
        {visibleNotice ? <p className={styles.notice} role="status">{visibleNotice}</p> : null}
      </div>

      {citationList(visibleCitations)}

      {visibleRide && onPlanRide ? (
        <div className={styles.ride} aria-label="Proposed ride">
          <span className={styles.rideBody}>
            <strong>{visibleRide.summary}</strong>
            <small>{rideShape(visibleRide)}</small>
            <small className={styles.rideNote}>
              “Plan this ride” uses these exact settings. They stay editable in Ride options afterward.
            </small>
          </span>
          <button
            type="button"
            className={styles.plan}
            onClick={() => {
              onPlanRide(visibleRide)
              setRide(null)
            }}
          >
            <MapTrifold weight="fill" aria-hidden="true" />
            <span>Plan this ride</span>
          </button>
        </div>
      ) : null}

      {visibleStops.length > 0 ? (
        <div className={styles.stops} aria-label="Suggested stops">
          {visibleStops.map((stop) => (
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
                  onAddStop(stop)
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

      {conversation.length <= 1 && !visibleBusy ? (
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
            ? "Ask about the roads, stops, gravel, or trade-off…"
            : "Three hours, gravel, back roads, end somewhere good…"}
          aria-label="Ask the ride advisor"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" aria-label="Send to the ride advisor" disabled={visibleBusy || draft.trim().length === 0}>
          <ArrowUp weight="bold" aria-hidden="true" />
        </button>
      </form>

      {capability.attributions.length > 0 ? (
        <p className={styles.attribution} translate="no">{capability.attributions.join(" · ")}</p>
      ) : null}
    </section>
  )
}
