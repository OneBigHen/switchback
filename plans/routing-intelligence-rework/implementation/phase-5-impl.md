---
type: planning
entity: implementation-plan
plan: "routing-intelligence-rework"
phase: 5
status: draft
created: "2026-07-22"
updated: "2026-07-22"
---

# Implementation Plan: Phase 5 - You.com Corridor Adviser

> Implements [Phase 5](../phases/phase-5.md) of [routing-intelligence-rework](../plan.md)

## Approach

Create an isolated server-side adviser that asks for named, source-backed motorcycle corridor hints and returns only validated data objects. Keep it abortable, cached, optional, and outside the primary route path. Phase 4 remains the sole authority that converts hints into scored routes.

## Affected Modules

| Module | Change Type | Description |
|--------|-------------|-------------|
| `src/lib/ai/ride-research.ts` | modify | Replace stale search behavior and retain manual research compatibility |
| `src/lib/ai/corridor-adviser.ts` | create | Prompt, response schema, validation, and normalization |
| `src/app/api/ride-corridors/` | create | Bounded adviser endpoint |
| `src/lib/server/corridor-cache.ts` | create | Seven-day SQLite cache at ignored `data/route-research-cache.sqlite` |
| `tests/unit/corridor-adviser.test.ts`, `corridor-cache.test.ts`, `ride-research.test.ts` | create/modify | Adapter, safety, caching, and compatibility behavior |

## Required Context

| File | Why |
|------|-----|
| `src/lib/ai/ride-research.ts` | Existing stale `api.you.com/v1/search` integration |
| `src/app/api/ride-research/route.ts` | Current key wiring and manual endpoint |
| `src/lib/geocoding/search.ts` | Existing Google/Photon validation path |
| `src/lib/routing/types.ts` | Phase 1 corridor-hint contract |
| `plans/routing-intelligence-rework/plan.md` | Non-blocking and source-validation rules |
| `https://you.com/docs/api-reference/search/v1-search` | Current Search API URL and request contract |
| `https://you.com/docs/api-reference/research/v1-research` | Current Research API and structured-output constraints |

## Implementation Steps

### Step 1: Implement current You.com transports

- **What**: Support current Search API for quick source retrieval and Research API for structured background synthesis.
- **Where**: Server-only adapter functions.
- **Why**: Existing code targets a stale search endpoint and cannot provide structured corridor hints.
- **Considerations**: Search uses the documented `ydc-index.io/v1/search`; Research uses `api.you.com/v1/research`; never expose the key client-side.

### Step 2: Build a motorcycle-specific structured request

- **What**: Ask for up to three named paved road/corridor options, anchor towns/places, useful crossings, toll risk, rationale, and source URLs for the exact endpoints and target duration.
- **Where**: `corridor-adviser.ts` prompt and strict schema.
- **Why**: Generic tourism queries return stops, not useful riding corridors.
- **Considerations**: Explicitly reject invented roads/coordinates and generic interstate recommendations; structured output uses supported schema constraints.

### Step 3: Normalize and validate hints

- **What**: Require sources, validate URLs, geocode names, de-duplicate anchors, and return hints without geometry. Phase 4 owns every geographic-envelope and GraphHopper routability check.
- **Where**: Adviser validator with an injected geocoder; Phase 4 owns envelope predicates.
- **Why**: External prose is not routing truth.
- **Considerations**: A source title/snippet alone does not prove routability; Phase 4 applies the locked envelope, routes, and scores the anchor.

### Step 4: Add cancellation, deadlines, and cache

- **What**: Respect caller aborts, fit within the 12-second alternatives deadline, and cache successful normalized hints for seven days in `data/route-research-cache.sqlite` using a small server-only SQLite table.
- **Where**: API handler and server cache.
- **Why**: Research can be slower than local routing and should not repeat unnecessarily.
- **Considerations**: Cache key uses endpoints rounded to two decimals, target rounded to the nearest 15 minutes, and ride character; store normalized hints/sources plus created/expiry timestamps, never API keys or raw user-identifying prompt text. SQLite failure degrades to an in-memory request result without failing routing.

### Step 5: Preserve graceful fallback

- **What**: Return an empty adviser result with diagnostic status for no key, timeout, malformed output, or no valid hints.
- **Where**: API response and Phase 4 integration contract.
- **Why**: Local curvature/GPX planning remains authoritative.
- **Considerations**: Do not convert provider failure into route-planning failure.

## Testing Plan

| Test Type | What to Test | Expected Outcome |
|-----------|-------------|-----------------|
| Unit | Endpoint/request shape | Current documented URL, auth, schema, and query behavior |
| Unit | Hint validation | Missing source, bad URL, ungeocodable, and duplicate hints rejected |
| Unit | Cache | Seven-day TTL and intent-key separation |
| Unit | Cancellation/timeouts | Empty fallback without delaying primary routing |
| Contract | Phase 4 boundary | Source-backed/geocoded hint objects are supplied; Phase 4 owns envelope/routability and no geometry is trusted |

Primary verify command:

```bash
npm test -- --run tests/unit/ride-research.test.ts tests/unit/corridor-adviser.test.ts tests/unit/corridor-cache.test.ts tests/unit/api-handlers.test.ts && npm run typecheck && git diff --check
```

### Test Integrity Constraints

- Keep manual ride-research source-card behavior working unless intentionally migrated with equivalent coverage.
- Never use a live paid API call as the only automated test.
- Tests must include plausible-sounding hallucinated road names and prove they are discarded.

## Rollback Strategy

Disable the adviser endpoint/integration and revert the Phase 5 commit. Primary and local alternatives remain fully functional.

## Open Decisions

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| Runtime dependency | MCP/HTTP | server-side HTTP API | MCP is an agent tool, not an app runtime contract |
| Research placement | primary/background/manual only | background alternatives | User wants useful research without route latency |
| Output authority | route geometry/hints only | hints only | GraphHopper and scoring remain safety truth |
| Cache duration | none/1 day/7 days | 7 days | Road-corridor advice changes slowly and external calls cost time |

## Reality Check

### Code Anchors Used

| File | Symbol/Area | Why it matters |
|------|-------------|----------------|
| `src/lib/ai/ride-research.ts` | `researchRideIdea` | Existing manual You.com adapter uses old search URL and returns source cards only |
| `src/components/planner/usePlannerRideResearch.ts` | manual research flow | Must remain optional and cancellable |
| `src/lib/geocoding/search.ts` | `searchPlaces` | Reusable validated endpoint/anchor resolution |

### Mismatches / Notes

- You.com Research structured output requires standard-or-higher effort; `lite` cannot be used with `output_schema`.
- A research response may exceed the alternatives deadline; timeout must yield no hint rather than hold the route.
