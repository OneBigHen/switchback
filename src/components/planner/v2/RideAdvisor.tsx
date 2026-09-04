"use client"

import { ArrowUp, ChatCircleDots, MapPin, X } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import type { AdvisorMessage, GroundingCitation, ProposedStop } from "@/lib/advice/contracts"
import type { AdvisorCapability } from "@/lib/advice/capability"
import { advisorContextFromPlan } from "@/lib/advice/route-context"
import { fetchAdvisorCapability, requestAdvisorTurn } from "@/lib/client/advisor-client"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"
import styles from "./RideAdvisor.module.css"

/**
 * The co-pilot.
 *
 * Themed after Clippy as a *cautionary tale*: it is never modal, never blocks
 * the map, opens only when the rider asks, and can always be closed. It earns
 * its place by being right and specific, or it should not be here at all.
 *
 * It renders nothing at all when the capability is absent (ADR 0021) — no
 * disabled state, no upsell, no mention that a paid thing exists.
 *
 * Everything it offers is a suggestion. "Add to ride" hands the stop to the
 * ordinary waypoint path, which replans deterministically; the advisor never
 * selects a route, and its opinion is rendered as clearly secondary to
 * Switchback's own.
 */

const STARTER_PROMPTS = [
  "Anywhere worth stopping for coffee?",
  "Is the extra time actually worth it?",
  "What should I know before I commit?"
]

export interface RideAdvisorProps {
  routes: PlannedRoute[]
  selectedRouteId: string
  warnings: string[]
  /** Accept a proposed stop as an ordinary rider waypoint, then replan. */
  onAddStop(stop: Waypoint): void
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

export function RideAdvisor({ routes, selectedRouteId, warnings, onAddStop }: RideAdvisorProps) {
  const [capability, setCapability] = useState<AdvisorCapability | null>(null)
  const [open, setOpen] = useState(false)
  const [conversation, setConversation] = useState<AdvisorMessage[]>([])
  const [stops, setStops] = useState<ProposedStop[]>([])
  const [citations, setCitations] = useState<GroundingCitation[]>([])
  const [secondOpinion, setSecondOpinion] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
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
    setCitations([])
    setSecondOpinion(null)
    setNotice(null)
  }

  useEffect(() => () => pending.current?.abort(), [])

  if (!capability?.enabled || routes.length === 0) return null

  const ask = async (riderMessage?: string) => {
    const context = advisorContextFromPlan({ selectedRouteId, routes, warnings })
    if (!context || busy) return
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setNotice(null)
    const asked: AdvisorMessage[] = riderMessage
      ? [...conversation, { role: "rider", text: riderMessage }]
      : conversation
    setConversation(asked)
    setDraft("")

    const reply = await requestAdvisorTurn({
      context,
      conversation,
      ...(riderMessage ? { riderMessage } : {})
    }, controller.signal)
    if (controller.signal.aborted) return
    setBusy(false)

    if (reply.status !== "ok") {
      setNotice(reply.status === "timeout"
        ? "That took too long — ask again if you want another read."
        : "I couldn't reach my sources just now. Switchback's own picks are unaffected.")
      return
    }
    setConversation([...asked, { role: "advisor", text: reply.message }])
    setStops(reply.proposedStops)
    setCitations(reply.citations)
    setSecondOpinion(reply.secondOpinion
      ? reply.secondOpinion.agreesWithSwitchback
        ? `Agrees with Switchback's pick — ${reply.secondOpinion.rationale} (${reply.secondOpinion.confidence} confidence)`
        : `Would take "${routes.find((route) => route.id === reply.secondOpinion!.wouldPick)?.name ?? reply.secondOpinion.wouldPick}" instead — ${reply.secondOpinion.rationale} (${reply.secondOpinion.confidence} confidence)`
      : null)
  }

  if (!open) {
    return (
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setOpen(true)
          if (conversation.length === 0) void ask()
        }}
      >
        <ChatCircleDots weight="fill" aria-hidden="true" />
        <span>Ask about this ride</span>
      </button>
    )
  }

  return (
    <section className={styles.panel} aria-label="Ride advisor">
      <header className={styles.header}>
        <div>
          <span>Second opinion</span>
          <h2>What I&apos;d do</h2>
        </div>
        <button type="button" aria-label="Close the ride advisor" onClick={() => setOpen(false)}>
          <X weight="bold" aria-hidden="true" />
        </button>
      </header>

      {secondOpinion ? (
        <p className={styles.verdict} role="note">{secondOpinion}</p>
      ) : null}

      <div className={styles.thread} role="log" aria-live="polite" aria-label="Advisor conversation">
        {conversation.map((turn, index) => (
          <p
            key={`${turn.role}-${index}`}
            className={turn.role === "rider" ? styles.rider : styles.advisor}
          >
            {turn.text}
          </p>
        ))}
        {busy ? <p className={styles.advisor}>Having a look…</p> : null}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      </div>

      {citationList(citations)}

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
          {STARTER_PROMPTS.map((prompt) => (
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
          placeholder="Ask about the roads, the stops, the trade-off…"
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
