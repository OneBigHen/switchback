# PA Gravel Atlas — adversarial architecture review

Date: 2026-09-11
Branch: `feat/pa-gravel-atlas-routing`
Draft PR: #123

## Decision

Use the statewide GPX as a **routing-intelligence dataset**, not as a route and not as a replacement routing graph.

The best architecture is:

```text
statewide gravel GPX
  -> dedicated catalogue ingest
  -> normalize / simplify / dedupe
  -> graph-match with motorcycle profile
  -> retain source + disagreement provenance
  -> attach canonical OSM-directed segment identity where possible
  -> aggregate adjacent verified gravel into coherent corridors
  -> write graph-fingerprinted gravel-atlas SQLite
  -> bounded spatial query for the current plan
  -> select 1 / 2 / 3 corridors for Balanced / More / Maximum
  -> existing Switchback candidate routing
  -> live router remains authoritative for access/connectivity
  -> measure actual atlas overlap + continuity on returned routes
  -> rank/diversify normally
```

Do **not** modify the GraphHopper/Valhalla base graph until evidence proves bounded shaping is insufficient.

## Existing Switchback assets worth leveraging

### Strong reuse

- Adventure and Gravel product profiles.
- GraphHopper motorcycle routing and custom-model support.
- GPX map-matching seam.
- Stable canonical OSM-directed segment identity and migration/quarantine logic.
- Destination corridor candidate generator.
- Existing bounded provider concurrency and candidate budgets.
- Route score inputs for gravel, continuity, fragmentation, detour, backtracking, overlap, confidence, and eligibility.
- PA DEP/PASDA historic unpaved-road evidence as an independent corroborating source.
- Node 24 built-in SQLite already used server-side.

### Do not reuse as storage

`data/gpx-library/atlas.json` / `atlas:build` is the existing **visual Route Atlas**: poster-art metadata for imported rides. It is not a spatial routing index. Coupling gravel routing to it would mix UI artwork lifecycle with safety/routing evidence.

Reuse its ideas (source fingerprinting, dedupe, bounding boxes), not its file or schema.

## Adversarial findings

### 1. Post-route PA enrichment cannot discover gravel

The current PA DEP/PASDA enrichment runs after provider routing. It can prove overlap but cannot make the provider investigate a good gravel corridor it never proposed.

**Resolution:** Atlas influences bounded candidate generation before final ranking.

### 2. Normal GPX import is intentionally hostile to this dataset

The ride importer rejects large disconnected road catalogues because they are not rides.

**Resolution:** dedicated Gravel Atlas ingest pipeline.

### 3. GPX geometry is not legal-access truth

The file may contain private, gated, stale, seasonally closed, disconnected, or no-longer-existing roads.

**Resolution:** only graph-verified `routable` corridors may attract routing; every final candidate still routes through the live motorcycle graph.

### 4. Graph verification can go stale

A corridor verified against an old PBF/profile/config must not remain trusted forever.

**Resolution implemented:** runtime SQLite queries require exact `GRAVEL_ATLAS_GRAPH_FINGERPRINT`. A graph rebuild without an atlas rebuild returns zero atlas corridors.

The eventual ingest command should fingerprint at least:

- source GPX bytes/version
- routing PBF bytes/version
- GraphHopper profile/config inputs that affect motorcycle routability
- Atlas schema/build version

### 5. Provider edge IDs are not durable identity

GraphHopper edge IDs can move after a graph rebuild.

**Resolution:** never persist them as canonical identity. Use Switchback canonical OSM-directed segment IDs where possible; keep provider IDs as transient map-match evidence only.

### 6. Raw statewide geometry must never enter one route request

Sending thousands of line/polygon areas in a custom model would be expensive, fragile, and hard to reason about.

**Resolution implemented:** runtime database query is bounded; selector hard-caps Atlas shaping to 3 corridors and total corridor generation remains bounded by the existing planner budget.

### 7. Total statewide miles can lie about local usefulness

A 100-mile corridor that touches the plan envelope at one vertex must not outrank a useful 8-mile local gravel run.

**Resolution implemented:** selector calculates only contiguous source geometry actually inside the current planning envelope and scores only those eligible meters.

### 8. Fragment soup is not a good gravel ride

Many tiny gravel snippets can inflate naive gravel counts.

**Resolution implemented:** continuous gravel distance gets a strong reward; fragmentation gets a penalty.

### 9. Existing synthetic corridor swing is wrong for trusted Atlas geometry

Switchback can move generic corridor anchors laterally to force time. Doing that to verified gravel would move the anchor off the road that supplied the evidence.

**Resolution implemented:** Gravel Atlas anchors are copied from source geometry and never synthetically swung.

### 10. Feature availability is not rider consent

A future refactor could accidentally inject Atlas candidates merely because the database was loaded.

**Resolution implemented:** request normalization defaults Atlas OFF; only Adventure/Gravel may enable it; candidate assembly independently requires `preference.enabled`.

### 11. Route caching can erase the feature

Atlas ON/OFF or intensity changes alter routing semantics. If absent from the cache key, an Atlas route could reuse a non-Atlas result and vice versa.

**Resolution implemented:** route cache keys normalize and include Atlas enabled/intensity state.

### 12. Duplicate source records can waste candidate budget

Ingest/map-match bugs or source overlap may emit the same stable corridor more than once.

**Resolution implemented:** stable corridor IDs are deduplicated; the strongest deterministic candidate wins before the hard result cap.

### 13. Spatial query radius must match the planning model

The existing curvature resolver uses only about ±0.1° around endpoints while destination timeboxing permits much wider lateral exploration.

**Resolution implemented for Atlas:** server query uses the planner's hard maximum 40-mile lateral reach as a conservative first-stage bbox; the selector then applies the much tighter actual route envelope.

## Current implementation scope

The safe corridor contract, request opt-in, repository, cache semantics, spatial query, and destination-candidate integration are now on the draft branch.

The current corridor resolver is consumed by **destination timeboxing**. Therefore the Atlas is not yet product-complete for:

- ordinary A→B requests with no ride-time target
- round-trip / Free Ride corridor-seeking
- map overlay
- UI control
- actual route-overlap telemetry

Those must not be implied as finished.

## Recommended next implementation order

1. **Inspect the real GPX before writing ingest assumptions.** Record file size, track/route count, disconnected pieces, names/extensions, point count, duplicate rate, coordinate ordering, licensing/provenance.
2. Build `scripts/build-gravel-atlas.*` to emit the SQLite schema already expected by runtime.
3. Map-match and attach canonical OSM segment references; quarantine ambiguous/unmatched roads rather than guessing.
4. Produce a source + graph fingerprint and set `GRAVEL_ATLAS_GRAPH_FINGERPRINT` from the same build artifact.
5. Run shadow evaluation on a PA golden corpus before exposing UI.
6. Add actual returned-route Atlas overlap/longest-run metrics; never award full candidate-source miles merely because a shaping anchor was requested.
7. Extend ordinary A→B routing with a measured detour policy rather than silently changing ETA behavior.
8. Extend Free Ride/loops by selecting reachable gravel clusters, not by random waypoint soup.
9. Add the rider UI only after the shadow corpus proves the algorithm materially improves gravel usage.

## Golden-corpus acceptance criteria

For Atlas ON vs OFF, record:

- verified Atlas gravel miles/share
- longest continuous verified gravel run
- added minutes/miles vs baseline
- access/bike-profile rejections
- self-overlap/backtracking
- router call count
- candidate source selected
- stale/unverified Atlas exclusion

Success means: when useful graph-routable gravel exists inside a reasonable ride envelope, Atlas ON produces materially more **continuous verified gravel** without absurd detours, access-rule bypass, candidate explosion, or regression when the feature is OFF.
