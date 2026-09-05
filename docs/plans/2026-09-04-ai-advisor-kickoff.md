# Build brief — Switchback AI Advisor ("the co-pilot")

**Audience:** a strong autonomous coding agent (Opus-class). Paste this whole file
as the kickoff prompt.
**Repo:** `/root/Vibe/switchback`, `main` @ `f757be2`, tree clean, Node 24.
**Do not deploy anything. Do not touch infra.** Production is live at
`ride.henning.rodeo`.

---

## 0. Read before writing a line

- `AGENTS.md` — product guardrails + **frozen decisions**. Binding. The rest of
  this brief is written to stay inside it; if you find a conflict, stop and say
  so rather than "improving" past it.
- `node_modules/next/dist/docs/` — this is a **modified Next.js**. Read the
  relevant guide before any Next code.
- ADRs: `docs/adr/0001` (providers propose, Switchback decides), `0013` (default
  route), `0017` (candidate pipeline), `0020` (Free Ride: Discovery + Live
  contracts, workload-aware, "one quiet suggestion"), `0021` (premium
  capabilities — server-declared, identity-gated, **missing key disables only
  that capability**), `0022` (Route Policy V2 detour envelopes).
- `docs/release/ROADMAP-WAVES.md` — current wave.
- Existing intent seam you will extend, not replace: `src/app/api/ride-intent/`,
  `src/components/planner/usePlannerRideIntent.ts`, `src/app/api/place-ideas/`,
  `src/app/api/ride-research/`.
- Use **Context7 MCP** for every external library API (OpenRouter, Google Maps
  client, etc.). Do not guess APIs.

---

## 1. The vision

Rider's words:

> "When I free-draw and route a random route it makes **one** route — can it do
> alternatives and give me options? And a secondary quality gate: run the route
> against Google Gemini on OpenRouter (cheap model), tool-call grounded with
> Google Maps, and tell me what it'd do and why. Broad-sweeping — I'm debating
> having it feed initial input into GraphHopper and Valhalla too. Design an AI
> advisor for all of this, themed like a friendly Windows paperclip. It needs to
> be a killer feature that covers the app and executes well."

Turn that into **one coherent assistant** — a friendly, capable co-pilot that
spans planning, route explanation, and (later, owner-gated) intent shaping into
the routing engines — delivered in **three PRs**, smallest-risk first.

The persona is themed after Clippy **as a cautionary tale**: never modal, never
blocking, always dismissible, quiet by default, earns its place by being right.
It is chatty while planning and nearly silent while riding.

---

## 2. Non-negotiable constraints

1. **No LLM route ranker.** `AGENTS.md` rejects it. The advisor never reorders
   candidates, never auto-selects, never feeds a score back into the pipeline.
   It *reads* the final candidate set / the chosen route and *writes* advisory
   text, or it *proposes structured, rider-visible inputs* that the rider
   confirms before routing. "Providers propose, Switchback decides" (ADR 0001)
   — the advisor is one more proposer, never the decider. Enforce this with
   module boundaries, not just intent.
2. **Premium capability, ADR 0021 shape.** Gate on `OPENROUTER_API_KEY`
   (server env). No key ⇒ capability absent, zero UI, core product byte-for-byte
   unaffected. No billing. No client-only flags.
3. **Small adapter, no framework.** `src/lib/advice/` with a clean interface and
   one implementation. No generic "LLM/provider/agent framework," no
   microservices.
4. **Riding mode obeys ADR 0020.** Ahead-only, workload-aware, at most one quiet
   suggestion. The persona must never surface mid-corner. Design the quiet-mode
   state machine explicitly.
5. **Privacy + degradation.** Sending route geometry/waypoints to OpenRouter is
   data egress: **default OFF for self-hosters**, env opt-in, documented.
   Determinism: adapters injected, **no network in unit tests / CI**. ≤3
   deliberate PostHog events, no PII, no route content in props.
6. **Quality gate.** `npm run verify` (lint, typecheck, vitest, build) green on
   every branch. Add e2e where it matters. If visual baselines change, inspect
   each diff and only accept explained changes (see how PR #54 did it).
7. **Google Maps grounding is an owner decision, not yours.** Google Maps
   Platform terms restrict using Maps data to build routing/navigation products.
   Advisory text may be fine; derived routing is not. Make grounding pluggable,
   default to a **key-free** source, and put the ToS question in the ADR.

---

## 3. PR A — Corridor-aware alternatives for free-draw  *(normal PR, ship-ready)*

**Why:** free-draw silently can't do what Destination mode does. This is close to
a bug and has no frozen-decision conflict.

**Traced for you — verify, then build:**

- `src/lib/planner/route-sketch.ts` `routeIntentFromSketch()` converts the stroke
  into `{start, finish, via[]}` with up to `MAX_ROUTE_POINTS - 2 = 6` **hard
  `via` shaping points** (`shapingPoints()`).
- `src/components/planner/PlannerShell.tsx` ~L1155 `handleRouteSketch()` →
  `replaceRoutePoints(intent.points)` → `handlePlan({mode, points})`.
- `src/lib/client/trip-planning-coordinator.ts` `loadAlternatives()` already
  fires the progressive `candidateSet:"alternatives"` follow-up for sketches.
- `src/lib/routing/planner.ts` `planAlternativeRoutes()` then either hard-bails
  (`roundTrip || loopTargetMinutes || segmentProfiles` → warning *"Alternatives
  are only available for point-to-point destination rides"*) **or**, for a
  destination sketch, re-runs comparison profiles that all collapse to >85%
  geometry overlap because the 6 fixed vias pin the line → `chooseDistinctCandidate`
  rejects them → **0 alternatives**. `MAX_ALTERNATIVES` = `PA_NJ_ROUTE_POLICY_V1.maxAlternatives` (2).
- ⚠️ `scorePlannedRoute` / `planAlternativeRoutes` currently have no covering
  tests — add them.

**Build:** treat the stroke as a **soft corridor**, not hard vias. Produce a
small set of genuinely distinct options that still honour the drawing. Reuse the
existing eligibility → enrichment → scoring → dedupe → role-assignment pipeline.
Design the option set; a reasonable shape:

| Option | Behaviour |
|---|---|
| **Traced** | hugs the drawn line (today's behaviour) |
| **Better roads nearby** | loosens adherence within a bounded envelope to pick up curves / surface / scenery, scored by the rider's role |
| **Leaner** | the line as a loose hint; fewer detours, closer to fastest-through-the-corridor |

- Add a **corridor-adherence term** to scoring (deviation from the sampled
  stroke) so it is a real scored axis, not a special case.
- Keep the drawn stroke on the map as a reference overlay so each option reads
  against what the rider drew.
- Near-closed strokes (loops) also get options — vary the loop, not just the
  profile.
- Respect Route Policy V2 detour envelopes per role (ADR 0022). Always show
  added minutes vs fastest.

**Tests:** unit for corridor sampling, the adherence term, and "distinct options
from one stroke"; one e2e that draws a stroke and asserts ≥2 selectable options.

---

## 4. PR B — "Second Opinion" route advisor  *(open as a DRAFT, owner-gated)*

After Switchback makes its own deterministic decision, ask a cheap LLM for an
independent read and show it as a clearly-secondary card.

- **Explanation only** (see constraint 1). The module signature is literally
  "read `TripPlan` → return `RouteAdvice`". It cannot mutate selection or scoring.
- `src/lib/advice/` — `interface RouteAdviser { advise(input): Promise<RouteAdvice> }`,
  one impl `OpenRouterGeminiAdviser` (model id via env, default a cheap Gemini
  flash/lite through OpenRouter).
- Grounding is pluggable: `interface GroundingSource` exposing tool functions the
  model may call (`describePlace(lat,lon)`, `roadContext(bbox)`, …). Ship **two**
  impls: a key-free default over data Switchback already has (OSM / PASDA / route
  Atlas) and `GoogleMapsGrounding` used only when `GOOGLE_MAPS_API_KEY` is set.
  Default key-free.
- Output contract, e.g.:
  ```ts
  interface RouteAdvice {
    agreesWithSwitchback: boolean
    wouldPick: string            // routeId from the existing set — never a new route
    rationale: string
    cautions: string[]
    confidence: "low" | "medium" | "high"
  }
  ```
  Rendered as a labelled **"Second opinion"** card beside Switchback's
  recommendation, visually clearly secondary.
- Tests use a fake adviser + fake grounding. No network.
- PostHog: `route_adviser_shown`, `route_adviser_pick_followed` — no route content.

**ADR** `docs/adr/0023-*.md` (split 0023/0024 if cleaner): (a) reconcile with the
"no LLM route ranker" rejection — why explanation-only is a different thing;
(b) the ADR 0021 capability shape; (c) an **"Owner decisions required"** section:
Google Maps grounding + ToS, route-data egress to OpenRouter + self-hoster
default; (d) rough per-call cost of the default model.

**PR B description** leads with **"⚠️ Owner decisions required before merge"**:
(1) confirm explanation-only scope, (2) Google Maps grounding vs key-free
default + ToS, (3) route-data egress + self-hoster default. Open as **draft**.

---

## 5. PR C — App-wide AI advisor: design doc + ADR draft  *(docs-only DRAFT PR)*

**Do not build this.** Produce `docs/design/2026-09-04-ai-advisor.md` plus an ADR
draft (number after 0024), opened as a docs-only draft PR so the owner can
comment inline. It must cover:

1. **Architecture.** One `Advisor` core, capability-gated (ADR 0021). Four
   surfaces: (a) conversational panel in planning, (b) proactive contextual
   nudges in planning — dismissible, rate-limited, non-modal, (c) route
   explanation + second opinion (= PR B), (d) **pre-routing intent shaping**
   (the debated one).

2. **Pre-routing intent shaping.** The advisor turns free-text / drawn /
   contextual intent into **structured, bounded, rider-visible planner inputs**
   (profile, target time, corridor bias, avoid areas, waypoints) that feed the
   **existing** request builder → GraphHopper / Valhalla. It extends the
   `usePlannerRideIntent` / `src/app/api/ride-intent` seam — deepening a seam
   that already exists, not new architecture. It is a **proposer of inputs
   only**: the rider sees and can edit every structured input before routing;
   the deterministic pipeline (eligibility → scoring → dedupe → role assignment)
   is untouched. Spell out, with code-structure boundaries, how this stays
   inside ADR 0001 and never becomes the rejected ranker.

3. **Riding mode.** Near silent. ADR 0020 Live contract: ahead-only,
   workload-aware, ≤1 quiet suggestion. The persona never pops mid-corner.
   Include the quiet-mode state machine.

4. **Persona / theme.** Name, voice, visual treatment, on-brand (Sora / DM Sans,
   existing palette). Explicitly learn from Clippy's failures. One paragraph on
   what "executes well" means here (right, rare, dismissible, fast, honest about
   uncertainty).

5. **Privacy / cost / degradation.** No key ⇒ nothing. Route-data egress
   default-OFF for self-hosters (env opt-in). Cheap model default + rough
   per-call cost. ≤3 deliberate PostHog events.

6. **"Owner decisions required."** Pre-routing shaping scope; Google Maps
   grounding + ToS; data-egress default; whether the persona ships enabled by
   default; model/cost budget.

7. **Build phasing.** PR A + PR B = phase 1 (shipping now). Doc lays out phases
   2–4 (conversational panel → proactive nudges → intent shaping into the
   engines), each gated on owner review of this doc.

---

## 6. Process

- One branch per PR. Conventional-commit messages. Commit trailers:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VRjptnwMrucB3TfRDkENQ2
  ```
  PR descriptions end with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- `npm run verify` green on every branch.
- PR A: normal PR, ready for review. PR B: **draft** + owner-decisions section.
  PR C: **draft**, docs only.
- Local dev: `npm run dev`. Identity needs `SWITCHBACK_SESSION_SECRET` (32+
  chars). GraphHopper + Valhalla already run on this host and are healthy —
  routing works out of the box.
- Do **not** merge anything.

## 7. Hand back

PR A / PR B / PR C URLs, one paragraph each on contents, the consolidated
owner-decision list, any guardrail tension you hit, and `npm run verify` status
per branch.
