# PA Gravel Atlas Routing — implementation plan

## Objective

Use a statewide Pennsylvania gravel-road GPX as bounded routing intelligence so Adventure/Gravel planning can deliberately discover coherent, legal gravel corridors without treating GPX geometry as proof of access or creating a second routing graph.

## Adversarial findings

1. **Post-route enrichment is too late.** `adventure-route-enricher.ts` can prove that a route overlaps the PA DEP/PASDA survey, but it cannot make GraphHopper discover a gravel road it did not propose.
2. **Generic GPX import is the wrong boundary.** The normal GPX importer correctly rejects road catalogues with many disconnected pieces; the statewide file needs a dedicated atlas ingest path.
3. **Raw GPX is evidence, not topology.** Atlas geometry may be stale, private, gated, seasonally closed, disconnected, or mislabeled. It must never bypass the live motorcycle routing graph.
4. **Provider edge IDs are ephemeral.** GraphHopper edge IDs may be used during matching but must not be stored as stable atlas identity. Prefer Switchback canonical OSM-directed segment identity when available.
5. **Reranking alone is insufficient.** A route cannot win a gravel score if it was never generated. Atlas data must influence bounded candidate generation before final scoring.
6. **Statewide request-time geometry is unsafe and expensive.** Never place the full atlas in a GraphHopper custom model. Select a tiny number of relevant verified corridors first.
7. **Continuity matters more than fragment count.** Ten 0.2-mile gravel fragments should not beat one useful 8-mile gravel run simply because they produce more matches.
8. **Existing source semantics must stay honest.** A verified gravel atlas corridor is not a community ride and not a RIG corridor; it needs an explicit source identity.
9. **Trusted geometry must not be synthetically moved.** Existing destination-corridor `forcedAnchors` can swing generic hints away from their source. Atlas anchors must stay on the verified gravel corridor.
10. **Feature-off behavior must be unchanged.** Atlas routing is opt-in at the request boundary until product defaults are explicitly chosen.

## Architecture

```text
statewide GPX
  -> dedicated catalogue parser
  -> normalize/simplify/dedupe
  -> graph-match against motorcycle graph
  -> retain source disagreement + provenance
  -> attach canonical segment ids where possible
  -> aggregate adjacent verified segments into gravel corridors
  -> spatial index
  -> query corridors in current planning envelope
  -> bounded corridor selector (max 3)
  -> existing destination/loop candidate generation
  -> normal GraphHopper/Valhalla routing + access rules
  -> actual atlas overlap/continuity measurement
  -> existing route eligibility/scoring/ranking
```

The live graph remains authoritative for connectivity/access. The atlas contributes surface evidence and route-attraction candidates only.

## Task 1 — Pure verified-corridor selector

**Files**
- Create `src/lib/routing/gravel-atlas.ts`
- Create `tests/unit/gravel-atlas.test.ts`

**Contract**
- A corridor is eligible for attraction only when graph verification says it is routable.
- Corridor must intersect/fit the current route envelope.
- Ranking rewards continuous verified gravel distance and confidence, while penalizing fragmented evidence and detour burden.
- Selection is deterministic and capped at 3.
- No function in this layer can express `must-use` semantics.

**Adversarial tests**
- unroutable but long corridor loses
- outside-envelope corridor loses
- long continuous corridor beats fragmented equivalent
- weak-confidence corridor is penalized
- result count never exceeds cap
- ties are deterministic
- no mutation of source objects

## Task 2 — Candidate-generation integration

**Files**
- Modify `src/lib/routing/destination-corridors.ts`
- Modify `src/lib/routing/candidate-generator.ts`
- Modify `src/lib/routing/types.ts`
- Extend existing routing unit tests

**Rules**
- Add explicit `gravel-atlas` candidate source.
- Atlas corridors enter after graph-backed RIG evidence and before loose GPX/community hints.
- Atlas shaping anchors are sampled from the verified corridor itself; never use synthetic lateral swing anchors for atlas geometry.
- Preserve existing global candidate bounds.

## Task 3 — Request contract and normalization

**Files**
- Modify `src/lib/routing/types.ts`
- Modify `src/lib/domain/routing/normalized-request.ts`
- Extend normalization tests

**Contract**

```ts
gravelAtlas?: {
  enabled: boolean
  intensity: "balanced" | "more" | "maximum"
}
```

Normalized default is disabled so existing routing is byte-for-byte behaviorally unchanged unless opted in.

Invalid values fail closed to disabled/balanced rather than accidentally activating atlas attraction.

## Task 4 — Atlas repository / ingestion seam

**Files**
- Add `src/lib/roads/gravel-atlas/*` modules
- Add unit fixtures/tests

This stage begins once the real statewide GPX is supplied. Do not fake its structure.

The importer must preserve individual source road pieces rather than using the normal ride importer. Record source hash/version, geometry, match state, confidence, provenance, and canonical segment linkage when available. Keep surface disagreements explicit.

## Task 5 — Shadow scoring before active routing

Run representative PA routes with Atlas OFF and Atlas shadow-scored. Record:
- available verified gravel in envelope
- generated candidates
- winning-route atlas gravel share
- longest continuous atlas run
- detour minutes/miles versus baseline
- access/bike compatibility rejection
- router-call count

No default-on rollout until this corpus demonstrates useful improvement without absurd detours.

## Task 6 — Active routing and UI

Only after shadow validation:
- wire selected atlas corridors into A-to-B and loop candidate source assembly
- expose `Use PA Gravel Atlas`
- intensity: Balanced / More gravel / Max gravel
- show actual verified gravel miles/share and longest continuous run
- keep known-gravel map overlay viewport/corridor-bounded

## Verification gates

- unit tests for selector and candidate integration
- route-request normalization regression tests
- typecheck + lint
- full Vitest suite
- targeted Playwright planner tests
- existing beta/release gates
- golden PA route corpus comparing Atlas OFF vs ON
- manually inspect at least one route where Atlas improves gravel and one where it correctly makes no change

## Non-goals for this branch

- importing the full GPX before its real structure is inspected
- new GraphHopper/Valhalla graph build
- replacing PA DEP/PASDA evidence
- making atlas geometry a legal/access authority
- storing GraphHopper edge IDs as canonical identity
- unlimited candidate/waypoint search
