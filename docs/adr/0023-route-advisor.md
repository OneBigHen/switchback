# ADR 0023: The co-pilot proposes; Switchback still decides

## Status

Accepted, 2026-09-04.

Extends [ADR 0001](0001-routing-provider-architecture.md) (providers propose,
Switchback decides), [ADR 0017](0017-federated-route-candidates.md),
[ADR 0021](0021-premium-capabilities.md) (server-declared capabilities), and
[ADR 0011](0011-product-analytics.md).

## Context

`AGENTS.md` rejects "a learned/LLM route ranker", and that rejection stands.
Three rider needs sit next to it and are not the same thing:

1. **"Is this actually the right route?"** Switchback's scoring is
   deterministic and explainable, and it is still only one opinion.
2. **"What's worth stopping for?"** The planner finds fun stops by category. It
   cannot hold a conversation about them — *"anywhere with decent beer after the
   gravel section?"* — which is how riders actually think.
3. **"Just put me a ride together."** Describing a ride in a sentence is faster
   than placing pins, and the deterministic parser only recovers part of it.

None of the three requires ranking a route.

## Decision

A co-pilot lives in `src/lib/advice/`: one adviser, one toolbox, one resolver.
It is a **proposer**, and the boundary is enforced by module structure and
validation, not by prompt wording.

### What it may do

- Read the `TripPlan` Switchback produced and comment on it.
- Say which of the **existing** candidates it would take, and why.
- Propose **stops** the rider accepts with one tap, becoming ordinary waypoints.
- Propose a whole **ride** — profile, minutes, start, finish, waypoints — which
  lands in the planner's own editable controls and routes only when the rider
  presses Plan.
- Hold a multi-turn conversation about any of it.

### What it structurally cannot do

| Boundary | How it is enforced |
|---|---|
| Cannot invent a route | `wouldPick` is validated against the candidate ids Switchback supplied; an unknown id drops the whole second opinion. |
| Cannot invent a place | Every coordinate — stop, start, finish, waypoint — comes from a tool result Switchback resolved through its own geocoder. The model references a `placeId`; it never emits a latitude. |
| Cannot rank or score | It receives a finished plan. There is no path from `src/lib/advice/` into eligibility, scoring, dedupe, or role assignment. |
| Cannot auto-plan | A proposed ride is a filled-in form. The rider presses Plan. |
| Cannot exceed the planner's own limits | Profile must be in the enum; `targetMinutes` must be 20–480; out-of-range values are dropped, not clamped. |
| Cannot block planning | Every failure resolves to a status. Never on the routing critical path. |

This is ADR 0001 applied one layer up: routing providers propose candidates and
Switchback decides; the co-pilot proposes *inputs and explanations* and the
rider decides. What `AGENTS.md` rejects is a model that produces or orders the
candidate set. Nothing here does. The line, stated once: **the co-pilot may help
you fill in the form; it may never mark the answers.**

Precedent already in the tree: `src/lib/ai/corridor-adviser.ts` has worked this
way since Phase 5 — the model proposes named corridors, and anything whose
source or anchor cannot be verified is discarded.

### Gemini, natively

The transport is the Gemini API directly, not a proxy. That choice is forced by
what the co-pilot needs: Grounding with Google Maps is a Gemini-API-**native**
tool, and OpenRouter's OpenAI-compatible surface does not carry it.

Two constraints were verified against the live endpoint, and the implementation
is shaped by them:

1. Built-in tools and function declarations coexist **only** with
   `toolConfig.include_server_side_tool_invocations: true`. Without it the API
   returns `INVALID_ARGUMENT` naming the flag.
2. `google_maps` **cannot** be combined with a JSON response mime type — the API
   rejects the pair outright — although our own function declarations combine
   with `responseJsonSchema` fine.

So a turn is: grounded tool rounds carrying Maps plus our functions, then one
structured call that drops Maps and asks for the schema. When Maps grounding is
switched off, the schema rides along on the first call and a turn costs one
request. Citations gathered during grounding are carried across.

### Google Maps: what is used, and what is deliberately not

Maps grounding supplies place character — is the brewery any good, is the
lookout actually a view — and returns rich detail plus citations, but **no
coordinates**. That is a useful property, not a limitation: a Maps chunk is
context, never a point. Anything the co-pilot wants to route to must still be
pinned through Switchback's own geocoder.

Maps grounding also returns directions, travel times, and search-along-route.
**Switchback consumes none of it.** Route geometry and route choice stay with
GraphHopper and Valhalla. Maps content is displayed with the required
attribution and discarded — never persisted, never folded into the route Atlas,
never used to derive a routing decision.

That boundary is also a licensing one. Google Maps Platform terms prohibit
extracting or exporting Maps content for use outside the Services, and require
the source name and link to be shown immediately beside the content they
support. The UI renders every citation with `translate="no"` and the required
"Grounded with Google Maps" attribution, and the adapter refuses to pass along a
Maps answer that came back with no citations at all.

### Proactive nudges are deterministic

The nudge is the surface most likely to feel like Clippy, so it is built with
the least freedom. A nudge is derived from the plan Switchback already computed
(`src/lib/advice/nudges.ts`): no model is consulted to decide whether to speak or
what to say. It is free, instant, and cannot be wrong about a fact. One at a
time, priority-ordered, each naming a specific number, each dismissible for the
life of the plan, and nothing fires unless it clears a materiality threshold —
so a plan the rider already understands stays silent, which is the common case.
What the model is for is the conversation *after* the rider taps it.

### Capability shape (ADR 0021)

- `GEMINI_API_KEY` turns the co-pilot on at all. Absent means absent: the API
  answers `disabled`, the UI renders nothing, the core product is unchanged. No
  billing, no plans, no upsell copy.
- `GEMINI_MAPS_GROUNDING=0` drops Maps grounding while leaving the co-pilot
  running on Switchback's own data. It defaults **on**, because grounded place
  character is what makes the co-pilot worth talking to. It is **not** a free
  feature: Maps grounding is priced separately from ordinary Gemini turns and
  billed per grounded search beyond whatever allowance the account's tier
  includes. Allowances and prices change, so check Google's current Gemini API
  pricing before enabling it on a shared or public instance, and set it to `0`
  to run the co-pilot on Switchback's own data alone.
- `CURVATURE_DB_PATH` additionally offers the road-character tool, so the
  co-pilot can hunt scored roads and gravel. Absent just means one fewer tool.

### The rider this is built for

A dual-sport rider. That is not a preference toggle, it is the shape of the
data: unpaved share is in the briefing and in the nudges, `find_good_roads`
takes `surface=unpaved` to hunt gravel, `brewery` is the first stop kind, and
the persona treats gravel as a reason to go rather than a warning.

### Privacy and cost

Enabling the co-pilot sends downsampled route geometry (≤40 coordinates),
candidate metrics, and the rider's messages to Google. That is real egress from
a self-hosted instance, so it is opt-in, off by default, and documented in
`.env.example`. Conversations are not stored server-side: the client holds the
transcript and posts it back each turn.

Cost is bounded by construction rather than assumed to be zero. A turn is one
request without Maps grounding and two with it, the in-process limiter caps
advisor turns per minute, and tool rounds and per-round tool calls are both
bounded. `usage.groundedQueries` is reported on every reply, and a `429`
degrades to a `rate-limited` status the UI states plainly rather than hiding.

Ordinary Gemini turns and Maps-grounded searches are priced differently and
both vary by model and account tier; `.env.example` carries the operator-facing
warning and points at Google's current pricing page. Nothing here claims the
co-pilot is free to run.

### Analytics (ADR 0011)

At most three deliberate events, no PII and **no route or message content**:
`route_adviser_shown`, `route_adviser_turn` (status and tool-call count only),
`route_adviser_stop_accepted`.

## Consequences

A deployment with no key is unchanged, down to the absence of any UI. A
deployment with a key gets a co-pilot that can explain a route, find a real
brewery on it, and build a ride from a sentence.

This is the first place in Switchback where a model's output reaches the rider
as *advice* rather than as a parsed intent. Keeping it a proposer — with the
boundary in the resolver rather than the prompt — is what stops it drifting into
the ranker `AGENTS.md` rejects. Any future change that lets advisor output reach
the scoring pipeline needs a new ADR, not an extension of this one. For the
record, the four changes that would cross the line:

- passing candidate routes to a model and using its output to order or select them;
- feeding advisor output into `scoreRoute`, `rankDiverseCandidates`, or role assignment;
- auto-planning from advisor output with no rider confirmation;
- persisting model-derived road opinions into the route Atlas or curvature database.

The wider picture — riding-mode behaviour under ADR 0020, and how far intent
shaping should eventually go — is designed in
`docs/design/2026-09-04-ai-advisor.md`.
