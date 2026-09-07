# Gravel Goblin route-memory spec

Date: 2026-09-07

## Goal

Give Gravel Goblin two grounded route sources without creating a second routing stack:

1. **My Rides** — evaluate and retrieve real recorded/saved GPX-backed rides from local metadata and measured route characteristics.
2. **New Ride** — synthesize a new route by combining the rider's current request with a compact learned profile derived from recorded rides, while leaving geometry generation to Switchback's existing deterministic routing pipeline.

## Non-negotiable boundaries

- The language model may interpret rider language, choose high-level tools, compare grounded candidates, and explain measured evidence.
- The language model must never invent route geometry, raw GraphHopper custom-model JSON, route ids, or GPX evidence.
- Recorded-ride analysis must work without an LLM and without a network call.
- Unknown evidence stays unknown. Missing surface/road-class evidence must not be turned into a confident preference.
- No vector database, LangGraph, MCP-internal orchestration layer, fine tuning, or second model gateway is introduced for this feature.
- Model selection remains independent of route-memory logic.
- Bike/access/closure constraints continue to outrank preference rewards.

## Data model

### RideFingerprint

A compact measured description of one ride, built from `PlannedRoute` / imported GPX intelligence rather than raw coordinates.

Required measured values:

- distance and duration;
- normalized twistiness;
- elevation interest when elevation evidence exists;
- gravel share when surface evidence exists;
- highway share / highway aversion when road-class evidence exists;
- source kind, road names, and region when available;
- per-axis evidence flags and an overall confidence score.

No fingerprint field may imply evidence that the source route does not actually contain.

### LearnedRiderProfile

A provider-neutral `RidePreferenceVector` plus per-axis support metadata:

- sample count;
- whether the axis is learned or still using the supplied baseline;
- confidence;
- total ride count used.

A learned value replaces the baseline only when there is enough measured evidence. Sparse/unknown axes preserve the current intent baseline instead of guessing.

## My Rides behavior

Natural-language retrieval is a two-step process:

1. Parse common deterministic constraints locally (source kind, mileage/duration range, region, named roads/tags and measurable characteristics such as twistiness/gravel/highway share).
2. Rank actual ride documents with deterministic scoring. Return only real ids.

The LLM may summarize/compare the small ranked result set, but it does not search raw GPX coordinates itself.

## New Ride behavior

1. Parse current rider intent into `RidePreferenceVector`.
2. Derive a learned rider profile from recorded rides.
3. Merge only learned axes into the current intent unless the rider explicitly overrode that axis in the current conversation.
4. Feed the resulting provider-neutral preference vector into the existing route-generation path.
5. Generate real candidates with existing routing providers and rank them with Switchback-owned scoring.
6. Let Gravel Goblin compare/explain grounded candidates.

The learned profile is advice, not a hard constraint.

## Model swapping

Keep the existing `AdvisorProvider` boundary. Add logical model slots, not another gateway:

- `intent`: cheapest structured model suitable for parsing/refinement;
- `goblin`: normal tool-capable conversational model;
- `reasoning`: optional stronger fallback for ambiguous comparison/reasoning;
- `maps`: Gemini-native maps specialist where current code requires it.

Each slot resolves from configuration and can be replaced without touching route-memory code or tool contracts.

## Adversarial stage gates

### Stage 1 — fingerprints and learned profile

Must prove:

- no fabricated surface/highway evidence;
- sparse data preserves baseline axes;
- outlier rides cannot dominate the learned profile;
- values are bounded and deterministic;
- adding more supported rides increases confidence monotonically.

### Stage 2 — My Rides retrieval

Must prove:

- queries return only real ids;
- contradictory constraints return no result rather than relaxing silently;
- unknown evidence never satisfies a positive filter;
- deterministic ranking is stable for the same corpus/query;
- a measurable-character query outperforms the previous metadata-only search on fixtures designed to distinguish them.

### Stage 3 — learned New Ride preferences

Must prove:

- explicit current-turn edits beat learned history;
- unlearned axes remain unchanged;
- learned history cannot disable hard safety/access constraints;
- no route geometry is created by the memory layer;
- generated preference inputs are deterministic.

### Stage 4 — model slots and eval harness

Must prove:

- changing a model id requires configuration only;
- unavailable optional slots fall back according to existing provider policy;
- route-memory unit tests are model/network independent;
- a fixed Goblin eval corpus detects route-id hallucination, constraint loss, invalid tool choice, and ungrounded claims.

## Value criteria

Keep a stage only when it either improves a measurable capability or removes operational risk. A stage that merely adds abstraction without passing its value gate should be reverted rather than expanded.
