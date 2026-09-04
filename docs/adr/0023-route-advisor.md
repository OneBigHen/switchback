# ADR 0023: The route advisor proposes; Switchback still decides

## Status

Proposed — **not accepted**. Sections marked *Owner decision required* must be
settled before the implementation merges.

Extends [ADR 0001](0001-routing-provider-architecture.md) (providers propose,
Switchback decides), [ADR 0017](0017-federated-route-candidates.md),
[ADR 0021](0021-premium-capabilities.md) (server-declared capabilities), and
[ADR 0011](0011-product-analytics.md).

## Context

`AGENTS.md` rejects "a learned/LLM route ranker" outright, and that rejection
stands. But two rider needs sit next to it and are not the same thing:

1. **"Is this actually the right route?"** Switchback's scoring is deterministic
   and explainable, and it is still only one opinion. A rider about to commit
   two hours to a route benefits from an independent read.
2. **"What's worth stopping for?"** The planner already finds fun stops by
   category. It cannot hold a conversation about them — *"anywhere with coffee
   before the twisty bit?"* — which is exactly how riders actually think.

Both are answerable without ranking a single route.

## Decision

An advisor lives in `src/lib/advice/`: one interface, one implementation, a
small pluggable grounding seam. It is a **proposer**, and the boundary is
enforced by module structure and validation, not by prompt wording.

### What the advisor may do

- Read the `TripPlan` Switchback already produced and comment on it.
- Say which of the **existing** candidates it would take, and why.
- Propose **stops** — places, from a grounding tool — that the rider accepts
  with one tap, at which point they become ordinary rider waypoints on a normal
  planning request.
- Hold a multi-turn conversation about the ride.

### What it structurally cannot do

| Boundary | How it is enforced |
|---|---|
| Cannot invent a route | `RouteSecondOpinion.wouldPick` is validated against the candidate ids Switchback supplied. An unknown id drops the whole second opinion. |
| Cannot invent a place | A proposed stop must reference a `placeId` a grounding tool returned *this turn*. Coordinates come from that tool result; the model never supplies them. |
| Cannot rank or score | It receives a finished plan. There is no path from `src/lib/advice/` into eligibility, scoring, dedupe, or role assignment. |
| Cannot auto-select | Accepting a stop is a rider tap. The advisor never calls the planner. |
| Cannot block planning | Every failure resolves to an `AdvisorReply` with a status. It is never on the routing critical path. |

This is the ADR 0001 shape applied one layer up: routing providers propose
candidates and Switchback decides; the advisor proposes *inputs and
explanations* and the rider decides. What ADR 0004 and `AGENTS.md` reject is a
model that produces or orders the candidate set. Nothing here does.

### Capability shape (ADR 0021)

Two independent switches, because they carry different consequences.

- `OPENROUTER_API_KEY` — turns the advisor on at all. Absent means the
  capability is absent: the API answers `disabled`, the UI renders **nothing**,
  and the core product is unchanged. No billing, no plans, no upsell copy.
- `GOOGLE_MAPS_GROUNDING=1` **plus** `GOOGLE_MAPS_API_KEY` — adds Grounding with
  Google Maps. **Off by default**, and a key alone is not consent.

A missing optional key disables only that source. The key-free source is the
*default*, not the fallback: the advisor has to be useful on a bare self-hosted
instance or it does not deserve to ship.

### Why Google Maps grounding is a separate transport

`google_maps` is a Gemini-API-**native** tool. OpenRouter's OpenAI-compatible
surface passes through some Gemini-style tool objects but does not carry it, so
the advisor cannot simply add it to its OpenRouter tool list. `GoogleMapsGrounding`
therefore makes its own request to `generativelanguage.googleapis.com` with
`tools: [{ google_maps: {} }]` and returns the grounded answer to the
conversation as a tool result. The co-pilot stays one voice on one cheap model;
Maps is a fact source it can consult.

Grounding with Google Maps can also return **directions, travel times, and
search-along-route**. Switchback consumes **none** of that. Route geometry,
route choice, and every score stay with GraphHopper / Valhalla and the
deterministic pipeline. Maps content is displayed, attributed, and discarded —
never persisted, never folded into the route Atlas, never used to derive a
routing decision.

That boundary is also a licensing one. Google Maps Platform terms prohibit
extracting, exporting, or scraping Maps content for use outside the Services,
and require the source name and link to be shown immediately beside the content
they support. The implementation renders every returned citation with
`translate="no"` and the required "Grounded with Google Maps" attribution, and
refuses to pass along a Maps answer that came back with no citations at all.

### Privacy and data egress

Turning the advisor on sends route geometry (downsampled to at most 40
coordinates), candidate metrics, and the rider's own messages to OpenRouter, and
— when enabled — a coarse midpoint to Google. That is real egress from a
self-hosted instance, so the capability is opt-in, documented in
`.env.example`, and off by default. Conversations are not stored server-side:
the client holds the transcript and posts it back each turn.

### Cost

The default model is a cheap Gemini Flash-Lite class model on OpenRouter: a turn
is one or two completions with a small context, on the order of a tenth of a US
cent. **Grounding with Google Maps is the expensive part** — roughly **$14 per
1,000 grounded queries** after a free tier — which is why it is separately
gated, why the advisor prefers the key-free source, and why replies report
`usage.groundedQueries`. A per-day budget and circuit breaker follow the
existing ADR 0021 mechanism.

### Analytics (ADR 0011)

At most three deliberate events, no PII and **no route content**:
`route_adviser_shown`, `route_adviser_turn` (status + toolCalls only), and
`route_adviser_stop_accepted`.

## Owner decisions required

1. **Scope.** Is "proposes stops the rider taps to accept" inside the line, or
   should the first release be strictly explanation-only? The stop path is what
   makes the advisor useful rather than decorative, and it is a rider-confirmed
   waypoint on the existing request builder — but it is a step past pure
   explanation and it is the owner's call.
2. **Google Maps grounding.** Enable it at all? It is the sharpest ToS question
   in this ADR: advisory prose with required attribution reads as compliant, but
   Google's terms are written to stop Maps content leaving the Services, and
   Switchback is by definition a routing product. The safe reading — display and
   discard, never derive routing from it — is what is implemented. Confirm, or
   keep the capability permanently off.
3. **Data egress default.** Off for self-hosters is implemented. Confirm that
   `.env.example` wording is strong enough, and whether the hosted instance
   should also require an explicit opt-in per rider.
4. **Model and budget.** Confirm the default model id and set a daily
   grounded-query ceiling.
5. **Enabled by default?** On the owner's hosted instance the advisor appears
   as soon as `OPENROUTER_API_KEY` is set. Should it instead need its own flag?

## Consequences

A deployment with no keys is unchanged, down to the absence of any UI. A
deployment with only `OPENROUTER_API_KEY` gets a conversational co-pilot
grounded in OpenStreetMap and the route contract. Adding Maps grounding buys
freshness and place character at a real per-query cost and a real attribution
obligation.

The advisor is the first place in Switchback where a model's output reaches the
rider as *advice* rather than as a parsed intent. Keeping it a proposer — with
the boundary in the resolver rather than the prompt — is what stops it drifting
into the ranker `AGENTS.md` rejected. Any future change that lets advisor output
reach the scoring pipeline needs a new ADR, not an extension of this one.

The app-wide picture — conversational planning, proactive nudges, pre-routing
intent shaping, and riding-mode behaviour under ADR 0020 — is deliberately out
of scope here and is designed separately in
`docs/design/2026-09-04-ai-advisor.md`.
