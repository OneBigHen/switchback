# Design — the Switchback co-pilot

**Status:** draft for owner review. Nothing in this document is built. Phase 1
(PRs #55 and #56) is shipping separately; phases 2–4 are gated on your comments
here.

**Date:** 2026-09-04
**Relates to:** ADR [0001](../adr/0001-routing-provider-architecture.md),
[0004](../adr/0004-fun-road-scoring.md),
[0013](../adr/0013-default-route-mode.md),
[0017](../adr/0017-federated-route-candidates.md),
[0020](../adr/0020-free-ride-discovery-live.md),
[0021](../adr/0021-premium-capabilities.md),
[0023](../adr/0023-route-advisor.md) (proposed), and the ADR 0024 draft below.

---

## 1. The idea in one paragraph

Switchback answers *"which route will I actually want to ride?"* It answers it
deterministically, and it is good at it. What it cannot do is have the
conversation that comes either side of that answer: *"I've got four hours and I
want to end up somewhere with decent coffee"* before, and *"is the extra 28
minutes actually worth it?"* after. The co-pilot is that conversation. It is one
assistant with one voice across four surfaces, it proposes rather than decides,
and it is chatty while planning and nearly silent while riding.

## 2. What "executes well" means here

Clippy failed for reasons that are well documented and easy to repeat: it was
modal, it interrupted, it guessed at intent, it was hard to dismiss, and it was
usually wrong. Every one of those is a design constraint, not a warning:

- **Right more than it speaks.** A suggestion that is wrong once costs more
  trust than five good ones earn. When it doesn't know, it says so in the same
  breath.
- **Rare.** Rate-limited by design, and silent unless it has something specific.
  "Nothing to add" is a valid outcome and should be the common one on a route
  the rider already understands.
- **Dismissible, always.** Never modal, never covering the map, never a thing
  you have to answer before continuing. Dismissing a suggestion means it does
  not come back for that ride.
- **Fast.** It must never sit on the critical path. Planning completes whether
  the advisor answers or not; its panel fills in afterward.
- **Honest about uncertainty.** Facts come from tools. Anything else is phrased
  as an opinion, and it never contradicts a warning Switchback already showed.

## 3. Architecture

One `Advisor` core in `src/lib/advice/`, capability-gated per ADR 0021, with
four surfaces on top of it. The core is the thing built in PR #56: a bounded
tool-calling loop over a cheap model, a pluggable grounding seam, and resolvers
that validate everything the model says before any of it reaches the rider.

```
                    ┌───────────────────────────────┐
   rider ──────────▶│  Advisor core (src/lib/advice)│
                    │  · bounded tool loop           │
                    │  · grounding sources           │
                    │  · resolvers = the boundary    │
                    └───────────────┬───────────────┘
                                    │ proposes only
   ┌────────────────┬───────────────┼───────────────┬──────────────────┐
   │ (a) panel      │ (b) nudges    │ (c) 2nd       │ (d) intent       │
   │ conversational │ proactive,    │ opinion +     │ shaping          │
   │ planning       │ dismissible   │ explanation   │ (pre-routing)    │
   └────────────────┴───────────────┴───────────────┴──────────────────┘
                                    │ rider confirms
                                    ▼
              existing request builder → GraphHopper / Valhalla
              → eligibility → enrichment → scoring → dedupe → roles
                              (unchanged, deterministic, authoritative)
```

**Surface (a) — conversational panel, planning.** The full back-and-forth. Ask
for stops, ask about the trade-off, ask what a road is like. Proposed stops are
accepted with one tap and become ordinary rider waypoints. *Phase 2.*

**Surface (b) — proactive contextual nudges, planning.** At most one at a time,
inline in the planner (never over the map), dismissible, and rate-limited to a
handful per planning session. A nudge must name a specific, checkable fact —
*"the Leaner option skips the gravel section you avoided last time"* — never a
generic prompt to engage. *Phase 3.*

**Surface (c) — route explanation and second opinion.** Shipping now in PR #56.

**Surface (d) — pre-routing intent shaping.** The debated one; §4.

### Where the code lives

| Concern | Module | Note |
|---|---|---|
| Typed surface + boundaries | `src/lib/advice/contracts.ts` | built |
| Model transport + tool loop | `src/lib/advice/openrouter-adviser.ts` | built |
| Key-free grounding | `src/lib/advice/local-grounding.ts` | built |
| Google Maps grounding | `src/lib/advice/google-maps-grounding.ts` | built, off by default |
| Capability gating | `src/lib/advice/capability.ts` | built |
| Intent shaping | extends `src/app/api/ride-intent/`, `usePlannerRideIntent.ts` | phase 4 |
| Riding-mode gate | extends `src/lib/recommendation/free-ride.ts` | phase 4 |

There is deliberately **no** generic agent/LLM/provider framework. One
interface, one implementation, one small grounding seam — the same shape ADR
0001 requires of routing providers.

## 4. Pre-routing intent shaping — the debated surface

This is the piece that sits closest to a frozen decision, so it gets the most
words.

### What it does

A rider says *"four hours, ending somewhere I can get lunch, nothing on
highways, I want the good roads north of the river."* Today the deterministic
parser in `ride-intent.ts` gets the profile, the duration, and maybe a
destination. The advisor could extract more: a corridor bias, an avoid area, a
lunch stop, a toll policy.

It turns that into **structured, bounded, rider-visible planner inputs**:

```
profile · targetMinutes · tollPolicy · avoidHighways
corridorBias (a sketch corridor, exactly the PR #55 shape)
avoidAreas · waypoints
```

Every one of those already exists as a field on `RouteRequest`. Nothing new is
invented; the advisor fills in a form the rider can see and edit.

### Why this is not the rejected ranker

`AGENTS.md` rejects "a learned/LLM route ranker". ADR 0001 says providers
propose and Switchback decides. Intent shaping stays inside both, and the
argument has to hold at the level of code structure, not intent:

1. **It runs before routing, not after.** It produces *request fields*. It never
   sees a candidate set, so it cannot order one.
2. **Every field is rider-visible and editable before the request is sent.**
   The proposed inputs render as the planner's own controls — profile chips, a
   time target, a drawn corridor, avoid areas — pre-filled and changeable. The
   rider presses Plan. Nothing routes on the advisor's say-so.
3. **Every field is bounded and validated.** `targetMinutes` in 20–480, at most
   three avoid areas, at most six waypoints, corridor capped at 48 samples,
   profile from the fixed enum. Out-of-range or unknown values are dropped, not
   clamped-and-hoped.
4. **Coordinates never come from model prose.** A waypoint must resolve through
   the geocoder or a grounding tool — the same rule PR #56 already enforces, and
   the same rule `corridor-adviser.ts` has enforced since Phase 5.
5. **The module boundary is one-directional.** `src/lib/advice/` may import from
   `src/lib/routing/` types; nothing under `src/lib/routing/` or
   `src/lib/recommendation/` may import from `src/lib/advice/`. That is
   checkable with a lint rule and should be one.

The line, stated once: **the advisor may help you fill in the form; it may never
mark the answers.**

### What would cross the line

For the record, so a future change is easy to recognise:

- Passing candidate routes to a model and using its output to order, filter, or
  select them.
- Feeding advisor output into `scoreRoute`, `rankDiverseCandidates`, or role
  assignment.
- Auto-planning from advisor output without a rider confirmation step.
- Persisting model-derived road opinions into the route Atlas or curvature DB.

Any of those needs a new ADR that explicitly supersedes the `AGENTS.md`
rejection. None of them is proposed here.

### Precedent already in the tree

`src/lib/ai/corridor-adviser.ts` (Phase 5) does exactly this shape today: it
asks a model for named corridors, then discards any whose source URL does not
parse or whose anchor does not geocode, and Phase 4 still owns every envelope
and routability check. Intent shaping deepens a seam that already exists rather
than opening a new one.

## 5. Riding mode — near silent

Under ADR 0020, Live is ahead-only, workload-aware, and offers **at most one
quiet suggestion**. The co-pilot inherits that contract wholesale. It has no
conversational surface while riding, no panel, and no unprompted speech.

### The quiet-mode state machine

```
                    ┌──────────┐
      ride starts──▶│  SILENT  │◀────────────────────────┐
                    └────┬─────┘                         │
       workload low,     │                               │ dismissed,
       ahead-only        │                               │ accepted, or
       candidate exists  ▼                               │ ride ends
                    ┌──────────┐   rider taps    ┌───────┴──────┐
                    │  ARMED   │────────────────▶│   OFFERED    │
                    └────┬─────┘                 └──────────────┘
       workload rises,   │
       or candidate      │
       goes stale        ▼
                    ┌──────────┐
                    │  SILENT  │
                    └──────────┘
```

**States**

- `SILENT` — the default and the destination. No UI at all.
- `ARMED` — a suggestion exists and the conditions to show it are met. Nothing
  is drawn yet; the state exists so the transition is testable.
- `OFFERED` — one glanceable card, ahead-only, dismissible with one tap.

**Guards, all of which must hold to leave `SILENT`:**

| Guard | Rule |
|---|---|
| Workload | Not in or approaching a corner, junction, or manoeuvre; ADR 0020's existing workload signal is authoritative. |
| Ahead-only | The suggestion is ahead on the route, with enough distance to act on it calmly. |
| Budget | At most one offer per ride leg, and never two within N minutes. |
| Freshness | The candidate is still ahead and still valid, or the state falls back to `SILENT` without showing anything. |
| Rider history | A dismissed suggestion never returns for this ride. |

**The persona never appears in riding mode.** No name, no voice, no character —
only the existing Free Ride suggestion surface. Personality is a planning-time
affordance; at 60 mph it is a hazard.

## 6. Persona and theme

**Name — decision needed.** "The co-pilot" is the working term. Options worth
considering: **Pillion** (the passenger who reads the map and knows the roads —
on-brand, motorcycle-native, no cartoon baggage), **Switch**, or no name at all
(just "Second opinion"). *Recommendation: `Pillion`, used lightly — a label on a
panel, never a mascot.*

**Voice.** A riding buddy who knows these roads. Plain, warm, specific, two or
three sentences. No corporate hedging, no exclamation marks, no "I'd be happy
to". It has opinions and states them, and it says "I don't know" without
apologising. It never nags and never repeats a suggestion you passed on.

**Visual treatment.** On-brand with the existing system: Sora for the display
line, DM Sans for body, `--sb-ember-strong` used sparingly as an accent, and the
panel tinted rather than filled so it always reads as *secondary* to the route
decision rail above it. No avatar. No animation beyond a short reduced-motion-
respecting entrance. Explicitly **not** a floating character, **not** an
overlay, **not** a chat bubble that follows the rider around the app.

**What we take from Clippy.** Only the lesson. The whole design is a list of
things it did that we do not: it appeared uninvited, it inferred intent from
weak signals, it could not be dismissed for good, it had no facts behind it, and
its personality was the product rather than a thin layer over something useful.

## 7. Privacy, cost, degradation

**No key ⇒ nothing.** No `OPENROUTER_API_KEY` and the capability is absent: the
API answers `disabled`, no UI renders, the core product is unchanged. No
billing, no plans, no upsell copy anywhere (ADR 0021).

**Egress is opt-in and off for self-hosters.** Enabling the advisor sends
sampled route geometry (≤40 coordinates), candidate metrics, and the rider's own
messages to OpenRouter, and — only when separately enabled — a coarse midpoint
to Google. Documented in `.env.example` in those words. Conversations are never
stored server-side.

**Cost.** The default is a cheap Gemini Flash-Lite class model: a turn is one or
two completions over a small context, on the order of a tenth of a US cent.
Grounding with Google Maps is the expensive part at roughly **$14 per 1,000
grounded queries** after a free tier — hence its own flag, a daily ceiling, and
`usage.groundedQueries` on every reply.

**Degradation.** Every failure resolves to a status, never an exception. A
grounding outage becomes a fact the model is told about, so it says it could not
check rather than inventing an answer.

**Analytics (ADR 0011).** Three deliberate events, no PII, **no route content
and no message content**: `route_adviser_shown`, `route_adviser_turn` (status
and tool-call count only), `route_adviser_stop_accepted`.

## 8. Owner decisions required

1. **Pre-routing intent shaping — build it at all?** §4 argues it stays inside
   ADR 0001. You may still prefer the advisor never touch planner inputs.
2. **Google Maps grounding and its ToS.** Same question as PR #56, restated
   because phases 2–4 lean on it harder: place character is where the co-pilot
   gets genuinely good, and it is also where the licensing risk lives.
3. **Data-egress default.** Off for self-hosters is implemented. Should the
   hosted instance also require a per-rider opt-in?
4. **Ships enabled by default?** Today the advisor appears as soon as
   `OPENROUTER_API_KEY` exists. Should it need its own flag?
5. **Persona name.** `Pillion`, something else, or no name.
6. **Model and cost budget.** Default model id, and a daily grounded-query
   ceiling.
7. **Nudges (surface b) — wanted?** It is the surface with the highest chance of
   feeling like Clippy. It is reasonable to skip it entirely.

## 9. Phasing

| Phase | Contents | Gate |
|---|---|---|
| **1 — shipping now** | Corridor-aware free-draw alternatives (#55). Second opinion + conversational panel + grounding seam + ADR 0023 (#56). | #56 needs decisions 2–4, 6. |
| **2** | Conversational planning panel promoted to a first-class surface: multi-turn stop discovery, ride-shaping questions, accepted stops replanned deterministically. | Owner review of this doc; decisions 4–6. |
| **3** | Proactive contextual nudges. Strict rate limit, one at a time, inline only, dismissal remembered for the ride. | Decision 7, plus phase 2 shipped and observed. |
| **4** | Pre-routing intent shaping into the existing request builder, and the riding-mode quiet state machine under ADR 0020. | Decision 1. Needs its own accepted ADR (0024 draft below) before any code. |

Each phase is independently revertible and independently useful. If you stop
after phase 1, what shipped is a route explainer that costs nothing when its key
is absent.

---

## Appendix — ADR 0024 draft

Reproduced here rather than filed as an ADR, because it should not enter the
numbered record until decision 1 is made. If accepted, this becomes
`docs/adr/0024-advisor-intent-shaping.md`.

> ### ADR 0024 (draft): The advisor may shape planner inputs, never planner output
>
> **Status:** Draft. Requires an explicit owner decision; do not implement first.
>
> **Context.** ADR 0001 fixes "providers propose, Switchback decides". `AGENTS.md`
> rejects a learned or LLM route ranker. Riders nonetheless describe rides in
> sentences, and Switchback's deterministic parser recovers only part of that.
>
> **Decision.** The advisor may produce **structured, bounded, rider-visible
> inputs** to the existing route request builder — profile, target minutes, toll
> policy, highway avoidance, a sketch corridor, avoid areas, and geocoder- or
> tool-resolved waypoints — and nothing else. Those inputs are rendered as the
> planner's own editable controls and are sent only when the rider presses Plan.
> The deterministic pipeline downstream is untouched.
>
> Enforced structurally: `src/lib/advice/` may import routing *types*; nothing in
> `src/lib/routing/` or `src/lib/recommendation/` may import from
> `src/lib/advice/`, checked by a lint rule. Every field is validated against the
> same schema the API boundary already enforces. Coordinates never originate in
> model prose.
>
> **Consequences.** Free-text planning gets materially better without any model
> output reaching scoring, ordering, or selection. The rejected ranker stays
> rejected, and remains recognisable: any change that lets advisor output reach a
> candidate set needs a new ADR that supersedes this one. The cost is a
> confirmation step the rider cannot skip — which is also the safety property.
