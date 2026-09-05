# Design — the Switchback co-pilot

**Status:** phases 1–3 are built and shipped, and that includes the pre-routing
**ride builder**: with no route on the map the co-pilot is a first-class way to
start a ride, and the same conversation becomes the advisor for the deterministic
candidates once they exist. Building a ride from a sentence is no longer future
work — see §3, surface (d).

Two things are still deliberately unbuilt, and only these:

1. **Intent shaping beyond a confirmed ride** — the advisor pre-filling planner
   controls generally, without the rider asking it to build a ride and confirming
   the result. §4 describes it; it needs the ADR 0024 draft in the appendix
   accepted first, and that draft is deliberately unfiled until then.
2. **Riding-mode (in-motion) behaviour** — the quiet state machine in §5. Designed,
   not built. Nothing in the shipped code speaks while the rider is moving.

**Date:** 2026-09-04
**Relates to:** ADR [0001](../adr/0001-routing-provider-architecture.md),
[0004](../adr/0004-fun-road-scoring.md),
[0013](../adr/0013-default-route-mode.md),
[0017](../adr/0017-federated-route-candidates.md),
[0020](../adr/0020-free-ride-discovery-live.md),
[0021](../adr/0021-premium-capabilities.md),
[0023](../adr/0023-route-advisor.md), and the ADR 0024 draft below.

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
accepted with one tap and become ordinary rider waypoints. **Built.**

**Surface (b) — proactive nudges.** At most one at a time, inline in the planner
(never over the map), dismissible for the life of the plan. Every nudge names a
specific, checkable number, and it is **deterministic** — derived from the plan
itself, with no model consulted to decide whether to speak or what to say. It is
therefore free, instant, and incapable of being wrong about a fact. Nothing
fires unless it clears a materiality threshold, so a plan the rider already
understands stays silent. **Built.**

**Surface (c) — route explanation and second opinion.** **Built.**

**Surface (d) — ride building from a sentence.** The rider describes a ride;
the co-pilot pins the places through Switchback's geocoder and hands back a
filled-in planner form to confirm. **Built** — this is the confirmed-ride form
of intent shaping. §4 covers how much further it should go.

**One conversation, two entry points.** (a) and (d) are not separate chat
systems. `RideAdvisor` renders the builder when there is no `RouteComparison`
and the advisor once candidates exist, and the transcript survives that
transition: a ride the co-pilot just built does not forget the sentence that
produced it. Route-*scoped* artifacts — a second opinion, proposed stops,
citations, an in-flight turn — are fenced to the route they were asked about and
are dropped when the rider changes route or replaces the plan. The transcript is
not.

**The handoff is atomic.** `advisorRideToPlannerHandoff` converts a confirmed
proposal into one immutable set of planner inputs — mode, profile, target
minutes, start, finish, shaping points, highway avoidance, toll policy — which
is passed *directly* into the first route request as well as mirrored into React
state for later editing. The card and the router therefore cannot disagree
because a state setter had not committed yet.

### Where the code lives

| Concern | Module | Note |
|---|---|---|
| Typed surface + boundaries | `src/lib/advice/contracts.ts` | built |
| Gemini transport + tool loop | `src/lib/advice/gemini-adviser.ts` | built |
| Tools Switchback owns | `src/lib/advice/toolbox.ts` | built |
| Answer validation (the boundary) | `src/lib/advice/resolve-answer.ts` | built |
| Persona + briefing | `src/lib/advice/route-context.ts` | built |
| Deterministic nudges | `src/lib/advice/nudges.ts` | built |
| Capability gating | `src/lib/advice/capability.ts` | built |
| Ride builder handoff into the planner | `src/lib/advice/planner-handoff.ts` | built |
| Riding-mode gate | extends `src/lib/recommendation/free-ride.ts` | not built |

Google Maps grounding is **not** a module: it is a server-side Gemini tool that
runs inside the same call as our function declarations. Two API constraints,
verified against the live endpoint, shape the transport: built-in tools coexist
with function calling only under
`toolConfig.include_server_side_tool_invocations`, and `google_maps` cannot be
combined with a JSON response mime type. So a grounded turn is tool rounds plus
one structured call; an ungrounded turn is a single call.

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

**No key ⇒ nothing.** No `GEMINI_API_KEY` and the capability is absent: the
API answers `disabled`, no UI renders, the core product is unchanged. No
billing, no plans, no upsell copy anywhere (ADR 0021).

**Egress is opt-in and off for self-hosters.** Enabling the advisor sends
sampled route geometry (≤40 coordinates), candidate metrics, and the rider's own
messages to Google's Gemini API — the transport is Gemini directly, not
OpenRouter. Maps grounding, when enabled, additionally sends a coarse anchor
point. Documented in `.env.example` in those words. Conversations are never
stored server-side: the client holds the transcript and posts it back each turn.

The rider's saved Home is **not** sent. Only an explicitly chosen planner start
is passed as `origin`, so having a Home saved does not by itself put the rider's
address in a model prompt.

**Cost.** The default is a cheap Flash-Lite class Gemini model, and a turn is one
completion without Maps grounding or two with it. Maps grounding is the expensive
part: it is priced separately from ordinary turns and billed per grounded search
beyond whatever allowance the account's tier includes. Prices, allowances and
which models qualify all change, and they differ by tier — so this document
deliberately quotes no number. Check Google's current Gemini API pricing before
enabling grounding on a shared or public instance. Hence its own flag,
`usage.groundedQueries` on every reply, and the rate limiter on the endpoint.

**Degradation.** Every failure resolves to a status, never an exception. A
grounding outage becomes a fact the model is told about, so it says it could not
check rather than inventing an answer.

**Analytics (ADR 0011).** Three deliberate events, no PII, **no route content
and no message content**: `route_adviser_shown`, `route_adviser_turn` (status
and tool-call count only), `route_adviser_stop_accepted`.

## 8. Open decisions

Settled during the build: Gemini is the transport, Maps grounding is on by
default and switchable off with one variable, egress is off for self-hosters,
nudges are deterministic, and the rider is assumed dual-sport.

Still open:

1. **How much further should intent shaping go?** Today the co-pilot fills in a
   whole ride when the rider asks it to, and the rider confirms it on the card
   before anything routes. §4 describes letting it pre-fill controls more
   generally, with no explicit "build me a ride". That step needs ADR 0024.
2. **Riding mode.** The quiet state machine in §5 is designed but not built.
   Worth doing only once the planning surfaces have been ridden with.
3. **Persona name.** `Pillion` is the recommendation; today the UI just says
   "Co-pilot".
4. **Grounded-query ceiling.** Today the bounds are the per-minute request
   limiter, the bounded tool rounds, and a `429` that degrades cleanly. There is
   no daily cap on grounded queries and no spend ceiling; one is worth adding
   before the audience grows, since grounded searches bill per query.
5. **Per-rider opt-in on the hosted instance.** Currently instance-wide.

## 9. Phasing

| Phase | Contents | State |
|---|---|---|
| **1** | Corridor-aware free-draw alternatives (#55). | Shipped. |
| **2** | Gemini co-pilot: second opinion, conversational panel, grounded stop discovery, ADR 0023. | Shipped. |
| **3** | Deterministic proactive nudges, and ride building from a sentence: the pre-routing builder, the atomic planner handoff, and one transcript across the builder → route transition. | Shipped. |
| **4** | Intent shaping *beyond* a confirmed ride — the advisor pre-filling controls without an explicit "build me a ride" — and the riding-mode quiet state machine under ADR 0020. | Design only, and the only remaining unbuilt work. Needs the ADR 0024 draft below accepted first. |

Each phase is independently revertible. With no key, none of it exists and the
planner is byte-for-byte what it was.

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
