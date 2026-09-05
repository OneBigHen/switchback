# Implementation backlog

Implement in dependency order. Each wave is a coherent behavioral outcome; split PRs by ownership/migration boundary where necessary. Do not ship a large branch that simultaneously replaces state, map gestures, routing, and visuals. Existing production/data remain protected. File names below identify likely owners, not mandatory renames.

## Wave 0 — Establish truth and settle policy

**Reason:** U03/U04/U19 are immediate correctness/trust issues; deployment/source and test evidence are not yet a release baseline.

**Affected behavior:** AI before routing and Home/unknown-data claims; selected-route default; public/curated discovery scope; release authority.

**Expected UX:** New-ride requests reach the real handler; unsupported facts are not presented as known. The current product remains usable while the refactor is prepared.

**Likely systems:** advisor route schema/client/resolver, `RideAdvisor`, `RouteDecisionRail`, deployment metadata, `AGENTS.md`, ADRs 0012/0013/0020/0023, root PRODUCT/DESIGN and this package.

**Dependencies:** none. Audit findings are inputs, not a completed gate.

**Acceptance:** reproduce and fix null-context contract through the actual handler; Home must resolve explicitly; unknown surface/search coverage cannot become certainty; capture exact source/build/provider configuration identifiers without secrets; reconcile the decision register and retired document authority; record baseline failures and remaining manual tests.

**Required tests:** client-to-handler builder contract; fatigue without Home; empty/failed/partial POI search; unknown surface coverage; real selected-route outcome; reproduce clipping at 320×568 and 844×390. Capture current artifacts before changing baselines. Complete remaining high-risk audit paths; no broad feature implementation needed here.

## Wave 1 — One recoverable ride intent

**Reason:** U01/U02/U05/U14 and every future input method depend on consistent ownership.

**Affected behavior:** point/preferences/constraint changes, undo/redo, cancel, stale responses, refresh, duplicate actions.

**Expected UX:** A change preserves the previous usable ride until a valid result is ready. Undo restores the entire change. Refresh restores the same intent.

**Likely systems:** `planner-store.ts`, `PlannerShell.tsx`, `planning-session-controller.ts`, `trip-planning-coordinator.ts`, `route-entity-cache.ts`, new narrow intent/command/checkpoint modules under existing planner/client/storage directories.

**Dependencies:** wave 0 decisions and regression fixtures.

**Acceptance:** all route-defining fields have one writable owner; every migrated UI callback dispatches a typed command; 50-entry bounded history covers all intent fields; pending/result revision identity enforced; controller-local abort; atomic IndexedDB draft/result checkpoint; safe migration from existing preferences/locks without losing library data; cross-tab conflict detection; legacy setters removed as migrated.

**Required tests:** compound edit→undo→redo; edit→cancel; slow A then fast B; A primary/B primary/A alternatives; double Apply; selection survives alternatives; excluded area and highway preference survive reload; corrupt/partial/quota-denied storage; migration/rollback with existing libraries; no large geometry duplication in history.

## Wave 2 — Coherent planning and route choice

**Reason:** U06–U13/U25/U26 prevent otherwise valid routes from feeling understandable.

**Affected behavior:** first run, origin, intent input, route comparison, preparation entry, responsive workspace.

**Expected UX:** Express a ride without opening a control inventory. Best ride is selected, alternatives explain time/road tradeoffs, and the map shows the route above the controls.

**Likely systems:** `PlannerComposition`, `PlannerDeck`, `PlanComposer`, `PlanOptions`, `RouteDecisionRail/Card`, `ContextSheet`, `map-viewport-insets`, `AppNavigation`, token/global/component CSS, waypoint search.

**Dependencies:** wave 1 command/read-model boundary. Design prototypes can be reviewed during wave 1; state writes must use the new owner.

**Acceptance:** one natural request entry; explicit/inferred start provenance and coverage; no Neural/provider ordinal labels; one highway control; bike eligibility distinct from ride preference; selected Best ride and fastest eligible delta before extra taps; useful empty/error/partial alternatives; selected route visible in actual usable map rectangle; keyboard/focus/short-height layouts; no irrelevant expanded publishing/rating/staging forms.

**Required tests:** first-time destination/timebox flows, geolocation denial, no-key core, no distinct alternatives, selected-route preservation; screenshots at all seven required sizes and 200% text; keyboard-only and touch-target inspection; contrast on actual composited screens; no map remount during task switches.

## Wave 3 — Direct route authoring

**Reason:** U15–U17; "drawing should behave like drawing" requires an intent model rather than disposable sampled input.

**Affected behavior:** stops/shaping points, route dragging, sketches, kept/avoided road spans, avoid polygons.

**Expected UX:** Draw endpoints, extend/correct a line, drag a section, and edit any exclusion. Every action visibly changes the relevant geometry and has a meaningful undo.

**Likely systems:** `PlannerMapStage`, `route-sculpting-state`, click-fence helpers, `map-drawing`, `route-sketch`, `sketch-corridor`, road matching/locks, point/constraint object list, shared gesture controller.

**Dependencies:** waves 1–2; provider adapters must support or explicitly reject each constraint.

**Acceptance:** exclusive gesture owner; canceled gestures never leak clicks; raw sketch preserved after failed routing; new stroke endpoints outrank auto location; closed-loop inference editable; multiple strokes/segment replacement with stroke-level undo; stable stop IDs and accessible reorder; any polygon selectable/movable/vertex-editable/deletable; kept span direction/pass preserved; conflicts located on map and never silently weakened.

**Required tests:** open/closed/short/jitter/figure-eight/double-back sketches; second stroke; crossing existing route; endpoint in exclusion; multiple overlapping polygons; rapid pointer/cancel/lost-capture; drag then immediately undo; keyboard alternatives; one-way keep/reverse; route adherence vs eligibility; real legal routed result, not only fixture geometry.

## Wave 4 — AI acts through the ride model

**Reason:** U03/U04/U18–U20/U26/U27. Current successful prose is not successful rider intent execution.

**Affected behavior:** all twelve rider prompts, contextual map requests, proposal previews, Apply/Discard, explanations.

**Expected UX:** "Avoid that area" references a selected area; "extend an hour" shows a new ride and measured difference; Apply changes the map once and Undo restores it.

**Likely systems:** `advice/contracts`, toolbox/resolvers/execution policy/provider seam, `advisor-client`, endpoint schema, `RideAdvisor`, planner handoff, current `ai/ride-intent`/research adapters, proposal preview component.

**Dependencies:** waves 1–3; explicit ADR policy for preview routing and model second opinions.

**Acceptance:** bounded canonical context with revision/selected object; narrow typed operations; no arbitrary store mutation; every place/span reference grounded; no unsupported Home/access/difficulty/POI coverage claims; exact deterministic metric deltas; no internal IDs in prose; stale proposals cannot apply; absent AI leaves structured controls complete; text retained on failure; one proposal transaction per Apply.

**Required tests:** twelve-prompt contract matrix with actual handler; missing referents/Home; changed route while thinking; repeated Apply; canceled request; malformed tool references; partial capabilities; prompt injection in imported descriptions/POI text; privacy/redaction; live provider sample scored for task completion and evidence fidelity, separately from deterministic fixture tests. Add no learned ranking behavior.

## Wave 5 — Continuous Free Ride and navigation

**Reason:** U02/U05/U07/U24. Session correctness and legibility matter before adding riding intelligence.

**Affected behavior:** destination-free start, suggestions, accept/ignore, character changes, extend/shorten, turn around, Head Home, GPS loss, reroute, pause/recovery, recording.

**Expected UX:** One ride continues through Free Ride and guidance. A rider can get home without losing constraints or recording. Moving UI is quiet and readable.

**Likely systems:** `FreeRideHud`, `RideHud`, shell Free Ride handlers, recording hook/controller, navigation store/session, navigation engine/recovery, Free Ride API/recommendation graph, new active session owner.

**Dependencies:** waves 1–3; wave 4 only for natural-language variations, not essential manual actions.

**Acceptance:** guidance and recording are separate session attributes; suggestion acceptance/completion and Head Home retain recording ID/history/constraints; workload/GPS freshness/recent traversal supplied honestly; return target explicit; refresh restores paused correct activity; unreliable GPS suppresses ahead prompts; unsupported terrain requests explained; opaque high-contrast HUD; original track-only guidance preserved.

**Required tests:** destination-free start; reliable/unreliable/denied/lost/recovered GPS; null heading/speed serialization; accepted suggestion routing failure; stale expiry; constraint survival; recorded continuity; remaining stops only; network loss; imported-track deviation; audio/wake lifecycle; physical phone ride, daylight/gloves, background/foreground and airplane mode. No simulated GPS test can close physical acceptance.

## Wave 6 — Rides, discovery, and GPX as one workflow

**Reason:** U12/U21/U22. Valuable source material is split from the place where riders expect to discover it.

**Affected behavior:** search/detail/import/save/remix/share/export/history/notes.

**Expected UX:** Find a ride, understand its source and uncertainty, use it as an editable private derivative, and retain the original.

**Likely systems:** Discover destination, Library drawer/Rides, `/routes` pages, community and project-catalog adapters, GPX worker/parsers/intelligence/join/export, share preview, storage libraries.

**Dependencies:** waves 1–3. Can proceed independently of AI after shared command/import contracts stabilize.

**Acceptance:** one discovery entry with explicit curated/community sources; useful empty/error states; query/pagination cover the catalog; Use this ride loads a derivative; provenance/author/source chain retained; GPX/KML/KMZ multi-segment choices explicit; original download unchanged; imports cancellable; local save immediate and persistent; sharing previews exact trimmed geometry. Retire social comments only after usage/data preservation review, never silently delete records.

**Required tests:** malformed XML/coordinates, empty geometry, 5MiB and 50k-point boundaries, oversized archive/decompression limits, disconnected tracks, multi-track selection, canceled worker, duplicate import; all export formats round-trip; privacy trim start/finish and shared-link restore; attribution/derivative chain; empty community with nonempty curated catalog; back/forward preserving active draft.

## Wave 7 — Preparation and honest offline recovery

**Reason:** U12/U23. A downloaded region or registered service worker is not evidence this ride is prepared.

**Affected behavior:** route-specific readiness, map/track/reroute availability, download/retry, weather/fuel/daylight preparation, storage failure.

**Expected UX:** "Saved route available; maps partial; offline rerouting unavailable here" is precise and actionable. Preparation is proportional to the actual trip.

**Likely systems:** offline readiness/region/corridor modules, geo worker, storage quota/download panels, service worker, route preparation/evidence/weather/staging components.

**Dependencies:** waves 1, 2, 5, and source contracts from wave 6.

**Acceptance:** readiness evaluated against active ride/corridor and verified local artifacts; stale/corrupt/expired/out-of-region graphs cannot imply ready; map display and route computation separate; download atomic/resumable or cleanly retryable; low storage recoverable; weather/daylight/fuel sources and freshness explicit; absent data omitted/unknown, not safe by default.

**Required tests:** cold/warm offline reload; missing graph tile, region boundary, wrong-region pack, stale/corrupt data, partial download/quota; follow saved track vs true reroute; route edit exceeds pack; SW update during active session; physical iPhone/PWA airplane-mode drill. Current Mapbox offline terms/capabilities must be verified before any map-pack parity promise.

## Wave 8 — Release qualification and debt retirement

**Reason:** coherent completion must be demonstrated, not declared by closing phase documents.

**Affected behavior:** entire rider journey and migration/rollback.

**Expected UX:** polished, responsive, accessible planning and dependable recovery, with no known core blocking defects.

**Likely systems:** quality/live/mobile/PWA/visual workflows, fixture corpus, deployment attestation, resource diagnostics, obsolete UI/store adapters and renderer migration switch.

**Dependencies:** all release-scoped waves. Deferred features remain hidden or explicitly unsupported.

**Acceptance:** [RELEASE-GATES](RELEASE-GATES.md) all satisfied for exact candidate; independent review of real screenshots/flows; old state authority removed; migrated user data readable; deployment build attested; public smoke after deployment; rollback rehearsed; no baseline updates used to waive a defect.

**Required tests:** full verify, critical browsers, real-router corpus, PWA/offline, target viewport states, accessibility, performance/resource soak, production health plus routed UI smoke, physical riding drill. Report blocked/manual/deferred separately from passed.

## Implementation discipline

Before each wave, record exact base SHA, current dirty state, scope, and gate. Do not reset the production checkout. Changes to the current product can ship through ordinary small PRs while later waves are designed, but no PR may create a second authoritative route intent. A failing gate becomes a named defect with a reproducer; it is not fixed by weakening an assertion or merely regenerating screenshots.

See [WAVE-RECONCILIATION](WAVE-RECONCILIATION.md): waves 0–1 here are proposed to run as inserted phases of the open premium maps + routing wave in `docs/release/ROADMAP-WAVES.md`, not as a second, parallel sequencing authority.
