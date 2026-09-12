# PA/NJ Gravel Atlas — adversarial architecture review

Date: 2026-09-11  
Branch: `feat/pa-gravel-atlas-routing`  
Draft PR: #123

## Decision

Use official road-surface datasets as **routing evidence**, not as routes and not as a replacement routing graph.

The implemented architecture is:

```text
PA PASDA / NJGIN official linework
  -> bounded deterministic source snapshot
  -> normalize + dedupe + preserve provenance
  -> source-fingerprinted staging SQLite
  -> exact motorcycle-routing build fingerprint
  -> bounded canonical OSM segment export near source evidence
  -> conservative geometry/direction reconciliation
  -> quarantine ambiguous / unmatched evidence
  -> live-router end-to-end traversability verification (policy v2)
  -> quarantine corridors that fail live traversal proof
  -> source + graph + policy-fingerprinted runtime SQLite schema v2
  -> bounded planning/viewport query
  -> select 1 / 2 / 3 corridors for Balanced / More / Maximum
  -> ordinary Switchback candidate routing
  -> live router remains authoritative for connectivity/access
  -> measure actual Atlas overlap + continuity on returned routes
  -> replace baseline only when evidence gain and detour/duration guards pass
```

Do **not** turn official source geometry into must-use roads or inject statewide source geometry into GraphHopper requests.

## Current traversability contract

The current evidence contract is `GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION = 2`, stored in runtime schema version 2. A corridor may be published only when the running GraphHopper service proves a non-degenerate endpoint-to-endpoint route with:

- endpoint snaps <= 60 m;
- a 20 m route/corridor match radius;
- aligned corridor coverage >= 80%;
- one continuous matching run >= 60% of the corridor;
- direction agreement >= 85% of proximity hits; and
- route/corridor detour ratio <= 1.5x.

Any change to these acceptance semantics requires a policy-version change and regeneration. Matching graph/source fingerprints alone are no longer sufficient to make an older runtime database current.

## Source semantics

### Pennsylvania PASDA 2012

PASDA contributes historic unpaved-surface evidence. It does not establish present legal motorcycle access and excludes State/National Forest roads. Its redistribution terms are restrictive, so code requires explicit operator acknowledgement before fetching it. That acknowledgement is not permission or a license. Production PA activation remains conditional on independent authorization.

### New Jersey NJGIN

NJGIN road centerlines are admitted only when they are `Unimproved`, `Active`, and `Non-Restricted`. This is stronger access/status evidence than the PASDA layer but still does not promise current field conditions or passability.

## Adversarial findings and current disposition

### 1. Post-route enrichment cannot discover gravel — resolved

A route cannot earn gravel overlap if the provider never investigates that corridor.

**Implementation:** verified Atlas corridors participate in bounded candidate generation before final ranking. Ordinary A-to-B and Free Ride/round-trip flows are supported.

### 2. Generic ride GPX import is the wrong boundary — resolved

Road catalogues are evidence sets, not rides.

**Implementation:** Gravel Atlas has a dedicated official-source snapshot/staging/reconciliation/verification/runtime pipeline independent from the imported ride library and visual Route Atlas.

### 3. Official geometry is not routing/access truth — fenced

Surface linework may be stale, private, gated, seasonally unavailable, disconnected, or offset from current OSM topology.

**Implementation:** source observations are reconciled conservatively to canonical motorcycle-routable OSM-directed segments, then independently verified end to end against the running GraphHopper service under policy v2. Ambiguous/unmatched or non-traversable observations are quarantined. Final route candidates still go through the normal provider, and returned-route overlap must improve before a candidate may win.

### 4. Graph verification can go stale — resolved fail-closed

The active GraphHopper cache is stamped with a content fingerprint derived from the exact prepared PA+NJ motorcycle PBF, GraphHopper binary, canonical config, and sorted custom models. Runtime metadata and rows carry the graph fingerprint. Route-time reads validate metadata before querying rows, so a stale graph build cannot masquerade as current merely because some row values happen to match.

### 5. Source evidence can go stale independently — resolved fail-closed

Official-source snapshots have a deterministic source fingerprint. Runtime rows and metadata carry it, and route/map reads require the configured source fingerprint to match. Updating source observations without rebuilding the runtime Atlas therefore disables stale evidence rather than mixing builds.

### 6. Traversability policy can go stale independently — resolved fail-closed

A stricter verifier can invalidate corridors even when graph and source fingerprints are unchanged.

**Implementation:** policy identity is explicit. Verification output carries policy version 2, the runtime builder refuses missing/older policy versions, runtime schema is version 2, and route-time metadata reads reject stale policy databases before any corridor rows are considered.

### 7. Partial runtime configuration can accidentally activate stale local data — resolved fail-closed

Fingerprints without an explicit database path previously allowed route-time code to fall back to `data/gravel-atlas.sqlite`, which could silently select an unintended file.

**Implementation:** Atlas routing activation now requires the complete triad: `GRAVEL_ATLAS_DB_PATH`, `GRAVEL_ATLAS_GRAPH_FINGERPRINT`, and `GRAVEL_ATLAS_SOURCE_FINGERPRINT`. Missing any member leaves ordinary routing functional but Atlas influence disabled. The map path uses the same activation contract.

### 8. Provider edge IDs are not durable identity — resolved

GraphHopper edge IDs are transient only. Persisted graph proof uses stable SwitchBack canonical OSM way/from-node/to-node/direction identities.

### 9. Statewide geometry at request time is unsafe — resolved

ArcGIS source services are build-time only. Runtime SQLite queries are spatially bounded; map requests are viewport bounded; routing uses at most 1 / 2 / 3 selected Atlas corridors by intensity. No statewide source payload is sent to the browser or provider.

### 10. Total source miles can lie about local usefulness — resolved

Runtime/candidate logic evaluates usable local evidence, then the returned route is independently measured for Atlas overlap. A huge source feature does not win merely because its statewide length is large.

### 11. Fragment soup can beat a coherent ride under naive scoring — resolved

Continuous verified gravel receives explicit value and fragmented evidence is penalized. Candidate replacement also requires a real evidence gain over baseline.

### 12. Synthetic lateral shaping corrupts trusted source geometry — resolved

Gravel Atlas anchors come from the verified corridor itself; they are not synthetically swung away from the road supplying the evidence.

### 13. Data availability is not rider consent — resolved

Atlas defaults OFF and only compatible Adventure/Gravel requests may activate it. Map-layer visibility is deliberately separate from routing preference.

### 14. Route caching can erase feature semantics or survive a build swap — resolved

Atlas OFF, Balanced, More, and Maximum occupy distinct normalized/cache semantics. Atlas-enabled cache keys are additionally namespaced by active graph and source fingerprints so a process that survives a build swap cannot return a route from an older Atlas build.

### 15. Cancellation can be swallowed as an ordinary failed candidate — resolved

Atlas attraction wraps extra provider calls. Treating cancellation like a normal rejected candidate can return a stale baseline after the rider has already changed intent.

**Implementation:** aborted signals and route-cancellation errors propagate through both destination and Free Ride shaping, with regression coverage.

### 16. Duplicate evidence can consume bounded candidate budget — resolved

Stable identities are deduplicated deterministically before the result cap.

### 17. ArcGIS service pagination can silently truncate source snapshots — resolved

PASDA advertises a 1,000-row maximum. The collector uses the effective source-policy page size for offsets and EOF detection rather than the caller's larger requested page size. Incomplete max-page walks fail instead of producing partial snapshots.

### 18. One provider failure can erase unrelated map layers — resolved

The map-feature path separates local Gravel Atlas from public OSM/weather providers and reports provider unavailability independently, preserving successful features from the other side.

### 19. Legacy layer persistence can create duplicate/invalid state — resolved

The old `unpaved` layer identity migrates to `gravel-atlas`, including sparse persisted settings/map packs, while preserving rider intent.

### 20. Generic feature styling makes gravel evidence unreadable — resolved

Gravel Atlas has a dedicated tan dashed line treatment matching its legend instead of inheriting a generic feature-layer style.

### 21. Graph-export process can hang after a fast child exit — resolved with regression coverage

The `osmium` exporter originally registered its `close` listener only after draining stdout, allowing a fast process to close before the listener existed.

**Implementation:** completion/error listeners are registered immediately after `spawn()`, stdout is then drained, and the already-captured completion promise is awaited afterward.

### 22. One-command NJ refresh could publish the wrong stage — resolved with regression coverage

Runtime publication must consume live-router-verified output, not reconciliation-only output.

**Implementation:** `gravel-atlas:refresh:nj` runs `gravel-atlas:verify-routability` before `gravel-atlas:runtime`, and the runtime command consumes `data/gravel-atlas-verified-traversable.json`. The standalone runtime builder defaults to that traversability-filtered artifact and rejects stale or missing policy identity.

### 23. Feature work can accidentally remove older request-contract regression coverage — resolved

The feature branch briefly narrowed canonical ride-request coverage while adding the new preference.

**Implementation:** pre-existing regression cases for lifecycle IDs, invalid/missing points, per-leg topology, and sketch propagation were restored alongside the new Gravel Atlas preference coverage.

## Remaining adversarial risk: build-compatible versus internal-edge proof

The canonical exporter reads the **exact prepared PBF** used by GraphHopper and mirrors hard motorcycle access/one-way eligibility while requiring the active graph-cache fingerprint to match those inputs. It still does not inspect every internal GraphHopper edge after parser/subnetwork processing.

Policy-v2 live-router verification is the primary fence for this limitation, not an optional sample. In addition:

- every route candidate must still route successfully through GraphHopper;
- candidate replacement requires measured returned-route overlap and evidence gain;
- stale schema/policy/source/graph metadata disables Atlas evidence;
- meaningful exporter-vs-router discrepancies discovered during current real-data validation remain release blockers and should strengthen the pipeline rather than weaken the gate.

## Product implementation status

The branch includes:

- official PASDA and NJGIN adapters;
- deterministic source snapshot/staging database and source fingerprint;
- GraphHopper input fingerprinting and graph-cache stamping;
- bounded canonical OSM segment export;
- conservative source reconciliation and quarantine;
- policy-v2 live traversability verification and quarantine;
- source+graph+policy-fingerprinted runtime SQLite schema v2;
- metadata validation on route-time reads;
- explicit three-variable runtime activation with no DB-path fallback;
- bounded runtime route/map queries;
- A-to-B and Free Ride/round-trip Atlas attraction;
- actual returned-route overlap/continuity evidence;
- detour/duration/evidence-improvement guards;
- cancellation propagation;
- build-aware route-cache namespacing;
- `Favor known gravel` + Balanced/More/Maximum UI;
- independent `Known gravel roads` quick map layer;
- legacy layer/map-pack migration;
- dedicated gravel rendering and provider-specific load state;
- operator commands and activation/rollback runbook; and
- restored canonical ride-request regression coverage.

The remaining blocker is not an unimplemented routing feature. It is **fresh release evidence against the current hardened policy and exact final head**, plus independent UX/release review.

## Historical evidence warning

The September 11 NJ run that reported 43 reconciled / 38 published / 5 refused was generated before policy v2. It remains useful diagnostic history but is not proof of the current release. Current policy-v2 counts, fingerprints, distributions, and representative rides must come from a fresh regeneration and must replace historical values in the PR's active-status section before merge.

## Release acceptance criteria

Before PR #123 leaves draft status, record current evidence for:

- exact final branch/head SHA and base SHA;
- activated source scope (`NJ-only` or independently authorized `PA+NJ`);
- runtime schema version 2 and traversability policy version 2;
- source and graph fingerprints;
- official observations accepted/rejected;
- canonical segments retained;
- corridors reconciled, published, refused, and quarantine totals by reason;
- accepted policy-v2 coverage/continuity/direction/detour distributions;
- at least one useful A-to-B Atlas improvement;
- at least one Free Ride Atlas case;
- at least one correct no-change case;
- actual verified overlap and longest continuous run;
- distance/duration delta against Atlas OFF;
- stale source/graph/policy fail-closed behavior;
- missing `GRAVEL_ATLAS_DB_PATH` fail-closed behavior;
- cancellation/request-fencing behavior;
- mobile/desktop UI and independent map-layer/routing-toggle behavior;
- no generated data/secrets in the diff;
- complete exact-head protected CI + Mobile Core; and
- independent UX/code review with concrete findings resolved.

Full operational steps and rollback requirements are in `docs/operations/GRAVEL_ATLAS_ACTIVATION.md`.
