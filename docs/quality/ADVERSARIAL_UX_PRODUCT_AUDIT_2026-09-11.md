# Switchback adversarial UX/product audit

Date: 2026-09-11  
Reference app: https://ride.henning.rodeo  
Repository: `OneBigHen/switchback`  
Audit branch: `audit/adversarial-ux-2026-09-11`  
Starting source HEAD: `a9c5250045d1b5ecbb2924064d6adc2284ba7de9`

## Executive verdict

Switchback has the beginnings of a genuinely differentiated motorcycle product, but it is not ready to put in front of 100 ordinary riders without explanation.

The product has a clear ambition: help riders choose roads for how they feel, not only how quickly they connect two points. The route-character vocabulary, curve signals, gravel/ADV intent, Free Ride, and rider-oriented detail are valuable. Search, route progress, cancellation, turn instructions, and the visible drawing-mode escape path are already solid foundations.

The current experience is not cohesive enough yet. Several surfaces expose internal implementation concepts, multiple interaction modes remain active at the same time, and route state can visually disagree with the user’s choices. That combination damages trust more than any individual spacing or styling defect.

Current readiness: **not beta-ready for ordinary riders**. It is a strong internal prototype / controlled technical preview that needs one focused product-quality pass before a broad beta.

## What was tested

The production/reference app was operated as a first-time, returning, planning, ADV-oriented, one-handed, and failure-case rider. The following complete journeys were exercised:

1. First launch and initial orientation.
2. Place search, route calculation, slow response, cancellation, route selection, details, directions, preparation, saving, and route start.
3. Map layers and style controls.
4. Edit route, ride character, target time, stops, avoidances, preferred roads, profiles, and loop mode.
5. Free Ride with denied location permission.
6. Draw route with point placement, drag drawing, undo, clear, finish, and cancel.
7. Navigation/ride preview with denied location permission.
8. Record with denied location permission and zero GPS points.
9. Rides/library with saved and imported data.
10. Discover empty state.
11. Settings and shell navigation.
12. Invalid place input, out-of-coverage destination, back navigation, reload, repeated state restoration, and mode cancellation.

## Evidence limits

The managed browser viewport was 1363×936. Its WebGL environment could not start the interactive map, so fresh pan/zoom, route fitting, road hierarchy, terrain, satellite rendering, and real map gesture behavior could not be validated in this session. This is an environment limitation, not proof that WebGL fails on normal rider devices.

The map failure UI was still tested as a product state. Map-dependent tools remained available or produced contradictory feedback after the map had failed, which is a valid release concern.

Fresh managed-browser viewport resizing was unavailable. The repository contains prior Playwright mobile/tablet artifacts, but those are not treated as current-run evidence. A physical-device or real WebGL browser pass remains required before calling the map or responsive experience verified.

No P0 was observed in the tested environment because the core place-to-route flow eventually completed. Several P1 issues remain.

## Journey health

| Journey | Health | Main conclusion |
|---|---|---|
| First launch | P2 | The app is visually polished enough to invite exploration, but does not establish one obvious first action. |
| Normal route planning | P1/P2 | The route can be planned, but state, terminology, and hierarchy create avoidable trust failures. |
| Free Ride | P1 | The flagship mode enters before GPS readiness and presents itself as experimental rather than dependable. |
| Draw route | P1 in map-failure state | The mode is visible and escapable, but completion can become impossible with contradictory feedback. |
| Returning user | P1/P2 | Restoration and recalculation are not clearly separated; the route can change under the rider. |
| Failure cases | P1 | Progress and cancellation are good, but invalid inputs and GPS failures do not consistently block unsafe or confusing next actions. |
| Rides | P2 | Imported project noise overwhelms the rider’s own meaningful rides. |
| Discover | P2 | The empty community state is a dead end for the product’s most important discovery promise. |
| Settings | P2/P3 | Organized and usable, but still contains internal language that should remain secondary. |

## Highest-impact findings

### P1-01 — Route identity contradicts the selected ride character

**Surface:** route choices / Prepare  
**Viewport:** desktop 1363×936  
**Reproduction:** Search `New Hope, PA`, calculate a route, leave the ride character as Scenic, and inspect the selected route card.  
**Actual:** The route is titled `Scenic route` but receives the prominent `FASTEST NOW` role badge. The card also describes it as a scenic route.  
**Expected:** The label should describe the route strategy the rider selected, such as `Best Ride`, `Scenic`, or `Twisty`. `Fastest` should only appear when fastest is actually the chosen strategy.  
**Impact:** This is a direct trust failure. A rider cannot tell whether Switchback honored the preference or silently optimized for speed.  
**Likely source:** `src/components/planner/v2/RouteDecisionCard.tsx`; the role helper currently gives `Fastest Now` precedence when duration equals the fastest route, regardless of the selected profile.

### P1-02 — Uncommitted or invalid endpoint text can still initiate Replan

**Surface:** Edit route  
**Viewport:** desktop 1363×936  
**Reproduction:** Open Edit route, replace the finish with `zzzzzzzz no such place`, observe unrelated suggestions, and click Replan.  
**Actual:** The suggestions do not present a clear no-results state. Replan remains available and starts routing while the raw invalid text is still visible. The previous finish coordinate remains part of the visible draft state, so it is unclear whether the request uses stale coordinates, a partial match, or the invalid text.  
**Expected:** A typed place is not a valid endpoint until the rider selects a known suggestion or explicitly chooses a map point. Replan should be disabled or should show `Choose a destination from the suggestions first.` The previous valid route should remain intact.  
**Impact:** High risk of silently routing somewhere other than the rider intended.  
**Likely source:** planner endpoint query/selection state in `PlannerDeck.tsx`, `PlanComposer.tsx`, and the route planning store.

### P1-03 — GPS permission failure is handled after entering riding mode

**Surface:** Free Ride and Record  
**Viewport:** desktop live surface plus existing mobile visual evidence  
**Reproduction:** Enter Free Ride or Record with location denied.  
**Actual:** The app opens a full-screen riding HUD, reports GPS unavailable or permission denied, and still presents prominent `Finish & save` controls with zero valid points. Free Ride also repeats `Experimental` in the header, empty state, warning, and suggestion language.  
**Expected:** Run a short location preflight before entering the riding surface. If permission is denied, explain the fix and offer `Try GPS again` plus one clear exit. Saving must be disabled until at least one valid point exists.  
**Impact:** The rider cannot tell whether the feature is active, recording, or merely waiting. The save action looks meaningful when there may be nothing to save.  
**Likely source:** `src/components/shell/FreeRideHud.tsx` and `src/components/shell/RideRecordingHud.tsx`.

### P1-04 — Interaction modes do not own the screen

**Surface:** draw route, preferred-road draft, avoid-area draft, Record  
**Viewport:** desktop 1363×936; mobile risk inferred but requires fresh device verification  
**Reproduction:** Start `Prefer a road on map`, inspect the planner dock; open Record from the main shell.  
**Actual:** Road-preference mode leaves route-start actions visible behind the map tool. The mode presents both a top cancel control and an in-panel cancel action. Record renders as a surface while the planner remains visible behind it.  
**Expected:** Once a map tool or recording mode starts, unrelated planning actions disappear or become inert. The active mode owns the screen and has one obvious exit.  
**Impact:** A one-handed rider can start the wrong operation, lose track of the current mode, or assume a background control still applies.

### P1-05 — Map failure leaves map-dependent actions active and gives impossible recovery

**Surface:** map workspace, draw route, avoid area, preferred roads  
**Viewport:** desktop 1363×936 managed browser  
**Reproduction:** With the map unable to initialize, enter Draw route, draw a line, and choose `Finish drawing and plan route`.  
**Actual:** The app says `Wait for the map to finish loading, then try this line again` even though the map is in a terminal `The interactive map could not start in this browser` state. Preferred-road and avoid-area tools remain active but do not provide clear feedback when map gestures cannot be processed.  
**Expected:** Distinguish loading from failed. Disable map-dependent tools and offer a clear fallback such as route fields, retry, or reload.  
**Impact:** The rider is told to repeat an action that cannot succeed and cannot tell whether work was lost.

### P1-06 — Reload restores a route while silently changing it

**Surface:** returning user / restored planning session  
**Viewport:** desktop 1363×936  
**Reproduction:** Create a meaningful route state, change it to a loop, reload in a new tab, and observe the restored state through completion.  
**Actual:** The session shows `Ride restored` while also entering `Routing your ride…`; after recalculation, the distance/time changed from the prior route. The user is not told that restoration triggered a new route calculation or that the route changed.  
**Expected:** Restore the last stable route exactly. If a recalculation is necessary, show a draft state and require an explicit `Update route` before replacing the stable route.  
**Impact:** A returning rider cannot trust that a saved or previously prepared ride is still the same ride.

## P2 systemic friction

### P2-01 — First launch has no declared hierarchy

The first screen exposes Plan, Rides, Discover, Settings, Draw route, Free Ride, Ride options, and Gravel Goblin at once. The rider must infer which action is the normal path. This is particularly harmful on a phone where every additional control consumes scarce attention.

**Root cause:** The shell treats every capability as a peer. The product needs a primary rider path: `Plan a ride`, with Free Ride and discovery as deliberate alternatives.

### P2-02 — Prepare is a kitchen sink

The route surface combines route selection, turn-by-turn, data quality, weather, sources, sharing, publishing, GPX export, road preferences, and ride start. Progressive disclosure exists, but the result is still a long nested scroll with a fixed action dock and an independently scrolling directions list.

**Root cause:** technical completeness has been added to the same surface as the rider’s immediate decision. Move deep evidence, publishing, and export behind secondary details or separate actions.

### P2-03 — Road-lock vocabulary leaks implementation concepts

`Road locks`, `routing engine`, `Map Studio`, source survey names, and `routing layer` are understandable to developers but not to an ordinary rider. The empty Road locks drawer says the rider should tap a corridor or import a GPX as a lock, which does not explain the outcome in rider terms.

Recommended copy:

- `Road locks` → `Road preferences` or `Keep this road`.
- `Lock` → `Prefer` or `Always use` depending on the actual constraint.
- `routing engine` → `route calculation`.
- raw survey/provider names → `Road-surface evidence` behind a source disclosure.

### P2-04 — Gravel Goblin has duplicate calls to action

After a route is ready, the rider can see an inline `Ask Goblin` suggestion and another standalone `Ask Gravel Goblin` action. Both compete for attention and make the suggestion feel like an unfinished experiment rather than a deliberate product feature.

Keep one contextual suggestion with one action. Its copy should explain the benefit in rider language.

### P2-05 — Rides is dominated by imported artifacts

The reference session showed 537 rides, primarily imported project entries with names such as `Project GPX` and `rideplanner`, while the rider had one planned ride. The default page makes the rider sift through the corpus before seeing their own ride.

Recommended information architecture:

1. Your rides: planned, recorded, saved.
2. Imported tracks: secondary filter or separate section.
3. Community/atlas: discovery surface, not mixed into personal rides.

### P2-06 — Discover is an empty dead end

The page reports `0 routes` and `No public routes yet` without offering a local alternative. This undercuts the promise of finding interesting roads.

When community data is empty, show a useful next action: start a local discovery ride, explore saved/imported routes, or ask Gravel Goblin for a regional route idea. Do not fabricate community content.

### P2-07 — Data-quality honesty is good but poorly framed

`67% mapped data coverage`, `Condition unavailable`, and long source caveats are honest, but the current presentation can read as a warning that the route is unsafe rather than a calibrated explanation of what Switchback knows.

Use a compact rider-facing summary first: `Road shape is well mapped; surface condition is unknown.` Keep percentages and source provenance behind `How we know`.

## Accessibility and touch risks

These observations are based on DOM semantics and visible layout; they are not a claim of full accessibility compliance.

- Several important actions are icon-only visually, including navigation controls and the overnight pause control. Accessible names exist in places, but the visual UI does not teach the meaning.
- The route surface contains nested scroll areas. This is difficult to operate one-handed and makes it easy to scroll the inner list while believing the whole sheet is moving.
- The minimize control is visually a chevron without a text label. Its effect is important enough to deserve a clear label or stable affordance.
- Disabled and enabled states are not consistently communicative. `Clear drawing` can be enabled with no points, and save actions look available while no GPS data exists.
- The full-screen riding surfaces use very large cards and sparse map context. This may be appropriate while riding, but must be tested on a real phone with safe areas, screen brightness, and glove-friendly touch targets.
- A real device pass is still required for focus order, VoiceOver/TalkBack announcements, dynamic type, reduced motion, orientation changes, and accidental edge swipes.

## Root causes

The observed issues consolidate into four systemic problems rather than a 30-item cosmetic backlog.

### 1. Competing state authorities

Typed endpoint text, selected place coordinates, saved routes, draft routes, restored routes, and recalculated routes are not always presented as distinct states. This produces invalid Replan, route-label contradiction, and reload drift.

### 2. No single active-mode coordinator

Planning, map editing, road preference, avoid-area drawing, Record, Free Ride, and ride preview can visually overlap. Each feature owns some controls, but no parent surface clearly owns the current mode.

### 3. Technical completeness is presented as primary product UI

Evidence, provider concepts, source names, publishing, locks, and imported corpora are useful capabilities, but they are not the first decision a rider needs to make. The UI exposes them too early and too prominently.

### 4. Failure and empty states are not first-class product states

Map initialization failure, GPS denial, empty Discover, no-result geocoding, and restored-route recalculation need explicit state contracts. At present, some are treated as temporary interruptions even when they are terminal or require user choice.

## Recommended remediation order

### Batch 1 — high-confidence safety and trust fixes

1. Make route-role labels profile-aware.
2. Prevent Replan until endpoints are committed valid places or map points.
3. Keep the stable route visible while a draft recalculates; do not replace it on reload without an explicit update.
4. Gate Free Ride and Record on GPS readiness; disable save until valid points exist.
5. Give map tools a single active-mode shell and one obvious cancel action.
6. Disable map-dependent tools after terminal map failure and offer route-field fallback.
7. Remove duplicate Goblin actions and humanize Road locks / routing terminology.

### Batch 2 — structural product surfaces

1. Redesign Plan/Prepare around the rider’s immediate decision.
2. Separate personal rides from imported tracks and community discovery.
3. Give Discover a useful empty state without inventing content.
4. Reframe route evidence as a concise trust summary with optional provenance.

### Batch 3 — real-device map and riding pass

1. Verify MapLibre/OpenFreeMap with WebGL on iPhone, small Android, tablet, and desktop.
2. Verify route fitting, bottom-sheet padding, attribution, controls, safe areas, and map gestures.
3. Verify Free Ride and Record outdoors with permission granted, denied, unavailable, and intermittent GPS.
4. Test one-handed use while stopped and with gloves.

## Product opportunities worth pursuing

These are focused extensions of the existing identity, not a request for feature bloat.

- **Free Ride as a confident discovery mode:** preflight GPS, show what it is looking for, and turn each suggestion into a simple accept/skip moment.
- **Route personality:** make `quick`, `balanced`, `twisty`, `scenic`, `adventure`, and `gravel` feel like meaningful rider choices with visible tradeoffs.
- **ADV confidence:** summarize pavement, access, surface confidence, and recent evidence without exposing provider internals.
- **Fast manipulation:** make adding a stop, pulling toward a road, and preferring a corridor produce an immediate, legible change summary.
- **Riding-oriented map:** show road character and the next meaningful choice without competing with the route itself.

## Source/component map

The following components are likely leverage points for the remediation, based on observed behavior and source inspection:

- `src/components/planner/v2/RouteDecisionCard.tsx` — route role naming and selected-route semantics.
- `src/components/planner/PlannerDeck.tsx` — planning stage, sheet ownership, action dock, and restored route presentation.
- `src/components/planner/v2/PlanComposer.tsx` — endpoint query/selection, route options, and planning actions.
- `src/components/planner/RouteComparison.tsx` — route details, nested directions, preparation, and fixed actions.
- `src/components/planner/RoadLockLibraryDrawer.tsx` — rider-facing road-preference terminology and empty state.
- `src/components/planner/workspace/ContextSheet.tsx` — detents and shared sheet behavior.
- `src/components/shell/FreeRideHud.tsx` — GPS preflight, discovery framing, and save gating.
- `src/components/shell/RideRecordingHud.tsx` — recording preflight and zero-point save behavior.
- `src/components/planner/RouteEvidencePanel.tsx` — trust summary versus raw provenance language.

## Suggested acceptance criteria for the next implementation pass

- Scenic, Adventure, and Gravel routes never display `Fastest Now` unless the rider explicitly selected the fastest strategy.
- Replan cannot start from free-typed endpoint text that has not been committed to a place or map coordinate.
- Reload restores the last stable route exactly, or clearly labels a pending draft update before replacing it.
- Free Ride and Record do not enter an active/saveable state until location permission and a valid position are available.
- Finish/save is disabled and visually explained when there are zero valid points.
- A map editing mode hides or disables route-start actions and exposes exactly one primary cancel path.
- Terminal map failure never tells the rider to wait for a load that has already failed.
- One Gravel Goblin action is visible per state.
- Normal rider-facing UI contains no unexplained `road lock`, `routing engine`, or provider/source jargon.

## Git and verification truth at audit time

- Starting branch: `ux/v2-final-integration`.
- Starting HEAD: `a9c5250045d1b5ecbb2924064d6adc2284ba7de9`.
- Starting worktree: clean.
- GitHub `main` observed at: `c649214e4729c76649b38300422d1c8a4758ba4c`.
- Local tracking ref `origin/ux/v2-final-integration` was divergent from the starting local branch; it was preserved.
- No product code was changed during this audit.
- No automated verification was rerun for this documentation-only commit.
- Browser verification was performed against the production/reference app; the map/WebGL and viewport limitations above remain open.

## Bottom line

Switchback does not need a wholesale rewrite. It needs a firm product center: one active mode, one source of truth for route state, one rider-facing vocabulary, and a route surface that reveals complexity only when it helps a decision.

If those four problems are corrected, the existing motorcycle-specific ideas can become a product riders trust for real trips instead of a capable demo they need explained.
