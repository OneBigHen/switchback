# Gravel Goblin route-advisor review

Date: 2026-09-07

## Decision

Keep Gravel Goblin and Switchback's existing routing pipeline. Do not fork either comparison project wholesale.

Use **BikeScout as a behavioral reference** for a tool-driven conversational advisor and **openGpx as an MIT-licensed routing reference** for motorcycle-specific GraphHopper custom-model tuning.

The target boundary is:

```text
rider conversation
  -> bounded ride intent / preference edits
  -> Switchback-owned deterministic candidate generation
  -> GraphHopper routing policy
  -> Switchback-owned route analysis and ranking
  -> advisor compares/explains candidates
```

The language model may interpret and refine rider intent. It must not invent route geometry, raw provider weights, or unverified waypoints.

## What Switchback already has

Switchback is not starting from zero and should not grow a parallel agent/routing stack.

- `src/lib/ai/ride-intent.ts` already converts free text into a strict, bounded intent with destination/loop mode, profile, duration, toll policy, gravel preference, and highway avoidance, with OpenRouter plus a local fallback.
- `src/lib/advice/contracts.ts` already enforces the important safety boundary: the advisor proposes; Switchback resolves route ids and grounded places.
- `src/lib/advice/toolbox.ts` is already a Switchback-owned tool surface.
- `src/lib/routing/candidate-generator.ts` already generates bounded deterministic corridor and loop candidates.
- `src/lib/routing/graphhopper-request.ts` already builds GraphHopper custom models for bike capability, road locks, avoid areas, and provider-safe constraints.
- Planned routes already carry road/surface mix, curvature detail, elevation, toll evidence, provenance, and route-score fields.

The main missing capability is **continuous conversational route character**. Current intent collapses requests into a profile plus booleans. That cannot faithfully represent edits such as "keep this route idea, make it twistier, but use less gravel" without throwing away unrelated intent.

## BikeScout: adopt the behavior, not the code

Repository: `hifly81/bikescout`

### Useful ideas

1. **Agent-callable typed tools instead of free-form route generation.** BikeScout exposes geocoding and a route/mission scout as MCP tools with explicit schemas.
2. **Mission constraints are first-class.** Its route call carries surface preference, direction bias, urban/rural bias, distance flexibility, and a priority mode instead of forcing every request into one preset.
3. **One route can be enriched by optional analysis.** Weather, surface, mud, POI, elevation, nutrition, GPX and map output are separate capabilities hanging off the route mission.
4. **Tool descriptions contain operational contracts.** For example, the route tool documents acceptable distance tolerance so an agent does not repeatedly reroute a valid result.
5. **The agent asks for/uses rider and machine context.** Switchback can adapt this concept later as a motorcycle/rider profile rather than BikeScout's physiological cycling profile.

### Do not copy

- BikeScout source is AGPL-3.0. Treat it as a behavioral/reference implementation only unless Switchback deliberately chooses AGPL obligations.
- Its cycling-specific physiological, nutrition, battery and mud domain is not Switchback's product.
- Its OpenRouteService-specific routing inputs should not become a second routing contract inside Switchback.
- Do not expose dozens of low-level tools merely because MCP makes that easy. Keep the advisor toolbox small and rider-centered.

## openGpx: adopt the motorcycle routing mechanics

Repository: `lod0it/openGpx`

License: MIT.

### Useful ideas

`backend/app/services/graphhopper.py` contains a compact motorcycle custom-model strategy that is directly relevant to Switchback:

- progressively penalize `MOTORWAY`, `TRUNK`, and `PRIMARY` as adventure preference rises;
- reward `SECONDARY` and especially `TERTIARY` roads;
- reward GraphHopper curvature thresholds;
- optionally reward `UNPAVED`, `GRAVEL`, `DIRT`, `GROUND`, and `GRASS` surfaces;
- vary `distance_influence` so the engine is allowed to take a longer, more interesting line;
- query mountain passes through Overpass for an explicit high-adventure mode;
- request and aggregate `road_class` and `surface` details so the UI can explain what the generated route actually contains.

Switchback already has the harder provider boundary and custom-model machinery. The useful donor is therefore the **weighting policy and pass/scenic enrichment**, not openGpx's backend or UI as a whole.

### Do not copy blindly

- Do not use one monolithic `adventure: 0..100` slider as Switchback's product model. It conflates curves, road class, surface and detour tolerance.
- Do not make mountain-pass waypoints mandatory when they are only evidence; Switchback already has explicit road-evidence semantics for this problem.
- Do not copy magic multipliers without replaying them against Switchback's route corpus and regression routes.
- Bike capability and legality stay hard constraints; fun-road preferences remain soft rewards.

## Target Switchback contract

Introduce a normalized preference vector independent of GraphHopper/Valhalla:

- `twistiness`
- `scenery`
- `gravel`
- `technicality`
- `elevation`
- `highwayAversion`

Each axis is `0..1`. The values describe rider intent, not provider configuration.

Conversational edits are relative operations (`less`, `more`, `much-less`, `much-more`) applied only to axes the rider actually mentioned. This is the key behavior needed for follow-ups:

> "More curves and less gravel."

must change only `twistiness` and `gravel`; scenery, technicality, elevation and highway aversion remain unchanged.

This PR adds that deterministic foundation and bridges the existing coarse `RideIntent` profiles into it without changing current routing behavior yet.

## Phased implementation

### PR 1 — preference contract (this branch)

- normalized provider-neutral preference vector;
- deterministic profile-to-vector bridge for current intents;
- relative edit semantics that preserve unspecified intent;
- unit coverage;
- no routing behavior change yet.

### PR 2 — GraphHopper policy adapter

Translate the preference vector into bounded GraphHopper custom-model rules. Start with the openGpx ideas that map cleanly onto existing Switchback evidence:

- highway/trunk/primary penalties from `highwayAversion`;
- secondary/tertiary preference from `scenery` + `twistiness`;
- curvature rewards from `twistiness`;
- unpaved/gravel rewards from `gravel`, bounded by the selected bike profile;
- `distance_influence` from detour tolerance, which should be an explicit contract rather than inferred from one style axis.

Generate multiple policy variants around the requested preference vector rather than one model call -> one route.

### PR 3 — advisor refinement tools

Expose high-level Switchback tools such as:

- `refine_route_character`
- `generate_route_alternatives`
- `compare_route_candidates`
- `preserve_route_section` / road-lock-backed equivalent

Do not expose raw GraphHopper custom-model JSON to the model.

### PR 4 — route enrichment

Add optional tool/evidence layers inspired by BikeScout/openGpx:

- mountain-pass and notable-road discovery via bounded OSM/Overpass queries;
- weather/road-condition context when relevant;
- better surface/elevation/road-character explanations;
- rider/bike preference profile persistence.

### PR 5 — model routing

Use the cheapest structured/tool-capable model for intent extraction and ordinary refinements; escalate only ambiguous comparison/reasoning turns. Provider choice must not alter the deterministic routing contract.

## Acceptance gates before routing weights ship

1. Existing route fixtures and critical E2E behavior do not regress.
2. A preference edit never resets an unmentioned axis.
3. Hard safety/access/bike constraints beat preference rewards.
4. The same normalized intent produces deterministic candidate policy inputs.
5. Candidate diversity is bounded and measurable; no random waypoint soup.
6. Route explanations cite measured road/surface/curvature/elevation data rather than model claims.
7. Any literal openGpx code reuse retains MIT attribution; no BikeScout AGPL source is copied.
