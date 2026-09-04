"use client"

import { ArrowRight, ArrowUp, MapPin, MapTrifold, X } from "@phosphor-icons/react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import type {
  AdvisorMessage,
  GroundingCitation,
  ProposedRide,
  ProposedStop,
  RouteSecondOpinion
} from "@/lib/advice/contracts"
import type { AdvisorCapability } from "@/lib/advice/capability"
import { advisorContextFromPlan } from "@/lib/advice/route-context"
import { selectNudge, type Nudge } from "@/lib/advice/nudges"
import { fetchAdvisorCapability, requestAdvisorTurn } from "@/lib/client/advisor-client"
import type { PlannedRoute } from "@/lib/routing/types"
import opinionStyles from "./GravelGoblinOpinion.module.css"
import styles from "./RideAdvisor.module.css"

/**
 * Gravel Goblin is one companion with two natural jobs:
 *
 * - Before routing, it is a ride scout. The rider describes the day they want
 *   and gets a bounded, geocoder-resolved planner proposal to confirm.
 * - With routes, it becomes a second opinion: trade-offs, road character,
 *   gravel and real stops. The conversation survives the transition so a ride
 *   Gravel Goblin just helped build does not suddenly forget why it exists.
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
  /** Preview/select an existing Switchback candidate the Goblin prefers. */
  onSelectRoute?(routeId: string): void
}

interface ThreadTurn extends AdvisorMessage {
  key: string
}

let turnCounter = 0
function threadTurn(turn: AdvisorMessage): ThreadTurn {
  turnCounter += 1
  return { ...turn, key: `turn-${turnCounter}` }
}

function GoblinAvatar({ size = "normal" }: { size?: "tiny" | "normal" | "large" }) {
  return (
    <span className={styles.avatar} data-size={size} aria-hidden="true">
      <Image
        src="/brand/gravel-goblin-avatar.webp"
        alt=""
        width={96}
        height={96}
        unoptimized
      />
    </span>
  )
}

function citationList(citations: GroundingCitation[]) {
  if (citations.length === 0) return null
  return (
    <ul className={styles.citations} aria-label="Gravel Goblin sources">
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

function confidenceLabel(confidence: RouteSecondOpinion["confidence"]): string {
  return `${confidence[0]!.toUpperCase()}${confidence.slice(1)} confidence`
}

export function RideAdvisor({
  routes,
  selectedRouteId,
  warnings,
  origin,
  onAddStop,
  onPlanRide,
  onSelectRoute
}: RideAdvisorProps) {
  const [capability, setCapability] = useState<AdvisorCapability | null>(null)
  const [open, setOpen] = useState(false)
  const [conversation, setConversation] = useState<ThreadTurn[]>([])
  const [stops, setStops] = useState<ProposedStop[]>([])
  const [ride, setRide] = useState<ProposedRide | null>(null)
  const [citations, setCitations] = useState<GroundingCitation[]>([])
  const [secondOpinion, setSecondOpinion] = useState<RouteSecondOpinion | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [dismissedNudges, setDismissedNudges] = useState<string[]>([])
  const pending = useRef<AbortController | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const currentScope = scopeFor(routes, selectedRouteId)
  const [scope, setScope] = useState(currentScope)
  const scopeRef = useRef(currentScope)
  const scopeStale = scope !== currentScope

  useEffect(() => {
    const controller = new AbortController()
    const probe = (): void => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      void fetchAdvisorCapability(controller.signal).then((next) => {
        if (!controller.signal.aborted) setCapability(next)
      })
    }
    probe()
    window.addEventListener("online", probe)
    return () => {
      controller.abort()
      window.removeEventListener("online", probe)
    }
  }, [])

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
      ? "Route changed — I’m looking at the one you picked now."
      : null)
  }, [conversation.length, currentScope, selectedRouteId])

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
  const opinionRoute = visibleSecondOpinion
    ? routes.find((route) => route.id === visibleSecondOpinion.wouldPick) ?? null
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
            ? "That one took too long. Give me another crack at it."
            : reply.status === "rate-limited"
              ? "I’ve chewed through my turns for the moment. Try me again shortly."
              : "I can’t reach my outside sources right now. Your Switchback planner still works normally."
        )
        return
      }
      setConversation([...asked, threadTurn({ role: "advisor", text: reply.message })])
      setStops(reply.proposedStops)
      setRide(reply.proposedRide)
      setCitations(reply.citations)
      setSecondOpinion(reply.secondOpinion)
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
    if (hasRoute && conversation.length === 0) void ask()
  }

  if (!open) {
    if (!hasRoute) {
      return (
        <section className={styles.goblinInvite} aria-label="Gravel Goblin ride builder">
          <button type="button" className={styles.goblinInviteButton} onClick={() => openWith()}>
            <GoblinAvatar size="large" />
            <span className={styles.goblinInviteCopy}>
              <small>Gravel Goblin</small>
              <strong>Need a ride idea?</strong>
              <span>Give me the vibe — time, dirt, twisties, food — and I’ll scout something worth riding.</span>
            </span>
            <span className={styles.goblinInviteAction}>Ask</span>
          </button>
        </section>
      )
    }

    return (
      <div className={styles.closed}>
        {nudge ? (
          <div className={styles.nudge} role="note">
            <GoblinAvatar size="tiny" />
            <span className={styles.nudgeText}>{nudge.text}</span>
            <span className={styles.nudgeActions}>
              <button type="button" onClick={() => openWith(nudge.followUp)}>Ask Goblin</button>
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
          <GoblinAvatar size="tiny" />
          <span>Ask Gravel Goblin</span>
        </button>
      </div>
    )
  }

  return (
    <section className={styles.panel} aria-label="Gravel Goblin">
      <header className={styles.header}>
        <div className={styles.identity}>
          <GoblinAvatar size="normal" />
          <span className={styles.identityCopy}>
            <span>Gravel Goblin</span>
            <h2>{hasRoute ? "Your second opinion" : "Let’s find the fun way"}</h2>
          </span>
        </div>
        <button type="button" aria-label="Close Gravel Goblin" onClick={() => setOpen(false)}>
          <X weight="bold" aria-hidden="true" />
        </button>
      </header>

      {visibleSecondOpinion && opinionRoute ? (
        <section className={opinionStyles.verdict} aria-label="Gravel Goblin route opinion">
          <div className={opinionStyles.header}>
            <span className={opinionStyles.pick}>
              <small>{visibleSecondOpinion.agreesWithSwitchback ? "Goblin agrees" : "Goblin pick"}</small>
              <strong>{opinionRoute.name}</strong>
            </span>
            <span className={opinionStyles.confidence} data-confidence={visibleSecondOpinion.confidence}>
              {confidenceLabel(visibleSecondOpinion.confidence)}
            </span>
          </div>
          <p className={opinionStyles.rationale}>{visibleSecondOpinion.rationale}</p>
          {visibleSecondOpinion.cautions.length > 0 ? (
            <ul className={opinionStyles.cautions} aria-label="Things to keep in mind">
              {visibleSecondOpinion.cautions.slice(0, 3).map((caution) => <li key={caution}>{caution}</li>)}
            </ul>
          ) : null}
          {!visibleSecondOpinion.agreesWithSwitchback && opinionRoute.id !== selectedRouteId && onSelectRoute ? (
            <button
              type="button"
              className={opinionStyles.action}
              aria-label={`Show ${opinionRoute.name} route`}
              onClick={() => onSelectRoute(opinionRoute.id)}
            >
              <span>Show route</span>
              <ArrowRight weight="bold" aria-hidden="true" />
            </button>
          ) : null}
        </section>
      ) : null}

      <div ref={threadRef} className={styles.thread} role="log" aria-live="polite" aria-label="Gravel Goblin conversation" tabIndex={0}>
        {!hasRoute && conversation.length === 0 && !visibleBusy ? (
          <div className={styles.assistantTurn}>
            <GoblinAvatar size="tiny" />
            <p className={styles.emptyLead}>
              Tell me how long you have and what sounds fun. A start helps; if you haven’t picked one yet, name the town.
            </p>
          </div>
        ) : null}
        {conversation.map((turn) => turn.role === "rider" ? (
          <p key={turn.key} className={styles.rider}>{turn.text}</p>
        ) : (
          <div key={turn.key} className={styles.assistantTurn}>
            <GoblinAvatar size="tiny" />
            <p className={styles.advisor}>{turn.text}</p>
          </div>
        ))}
        {visibleBusy ? (
          <div className={styles.assistantTurn}>
            <GoblinAvatar size="tiny" />
            <p className={styles.advisor}>Sniffing out the good roads…</p>
          </div>
        ) : null}
        {visibleNotice ? <p className={styles.notice} role="status">{visibleNotice}</p> : null}
      </div>

      {citationList(visibleCitations)}

      {visibleRide && onPlanRide ? (
        <div className={styles.ride} aria-label="Gravel Goblin ride idea">
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
        <div className={styles.stops} aria-label="Gravel Goblin stop ideas">
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
        <div className={styles.starters} aria-label="Things to ask Gravel Goblin">
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
            ? "Ask about roads, stops, gravel, or the trade-off…"
            : "Three hours, dirt, back roads, end somewhere good…"}
          aria-label="Ask Gravel Goblin"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" aria-label="Send to Gravel Goblin" disabled={visibleBusy || draft.trim().length === 0}>
          <ArrowUp weight="bold" aria-hidden="true" />
        </button>
      </form>

      {capability.attributions.length > 0 ? (
        <p className={styles.attribution} translate="no">{capability.attributions.join(" · ")}</p>
      ) : null}
    </section>
  )
}
