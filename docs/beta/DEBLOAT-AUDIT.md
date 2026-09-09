# Switchback beta debloat audit

Date: 2026-09-08
Baseline reviewed: `main` @ `b53c177c1620098bfa00883257eae245411a6f5c`

This is a product-and-code bloat audit, not a delete list. Every removal needs live-reference, migration/data, deep-link and regression evidence first.

## Decision rule

For beta, a capability earns permanent screen space only if it improves a frequent rider decision at that point in the journey.

Classify every capability as:

- **PRIMARY** — frequent, directly advances the current task.
- **CONTEXTUAL** — useful, but only after an explicit action/condition.
- **POST-RIDE** — belongs after a ride is completed/recorded.
- **ADVANCED** — legitimate specialist/diagnostic workflow, hidden from normal flow.
- **DEFER** — keep code/data if inexpensive, remove normal entry point for beta.
- **RETIRE CANDIDATE** — appears to be compatibility/dead authority; verify references before deletion.

The point is not minimalism for its own sake. It is to stop making the rider parse the repository's feature inventory.

## 1. `Prepare ride` is currently a feature inventory

`RouteComparison`'s `Prepare ride` disclosure currently contains, in sequence:

1. mapped data-quality coverage;
2. GPX intelligence;
3. GPX join workflow;
4. measured route facts;
5. route score / `Why this route`;
6. road-lock satisfaction;
7. must-lock conflict recovery;
8. recorded-vs-planned replay comparison;
9. route weather;
10. route evidence;
11. multi-day trip staging;
12. 1–5 star route rating / preference training;
13. private portable sharing;
14. public/unlisted community publishing;
15. save route;
16. GPX export-format selection and export.

This is not one rider task. It is several products mounted under one toggle.

### Beta target: route readiness, not module inventory

The normal preparation surface should answer:

- Is this the ride I selected?
- Is there anything important I should know before committing?
- Is it usable for my bike?
- Do I have the map/guidance/offline state I think I have?
- Start / Save / Export / Share as intentional actions.

Recommended composition:

```text
ROUTE READY
67 mi · 1h 34m · selected Best Ride

Important
- Weather warning / no warning
- Required-road conflict / no conflict
- Track-only / turn-by-turn
- Unknown surface/data caveat if decision-relevant

Prepare
- Offline readiness
- Fuel/range warning if relevant
- Weather details
- Route evidence/details

[Start ride]
Save   Export   Share   More
```

Do not create another giant `RouteReadinessDashboard`. Reuse existing deterministic panels through concise summaries + explicit detail actions.

### Module disposition

#### RouteDataQualityPanel — CONTEXTUAL

Value: high for trust, especially mixed-surface/unknown-data routes.

Problem: a full three-bar coverage diagnostic is too prominent for every ordinary paved route.

Beta direction:
- show a compact caveat/status only when quality changes a decision;
- keep full access/surface/condition coverage under `Evidence & data`;
- preserve `Unknown`, update date and caveats;
- never convert poor coverage into a green `safe` state.

#### GpxIntelligencePanel / GPX Join — CONTEXTUAL by route type

High value for imported track-only routes; irrelevant to live routed rides.

Render only when the route actually carries GPX intelligence / track-only join capability. This is already conditional in part; ensure surrounding preparation hierarchy does not reserve conceptual space for it on normal routes.

#### Measured route facts + Why this route + RouteEvidencePanel — CONSOLIDATE

These overlap heavily:
- measured facts;
- curve/turn character;
- surface mix;
- route-score explanation;
- official unpaved survey explanation;
- weather/traffic disclaimers.

Create one route explanation read model and one user-facing `Why this route` summary. Deep evidence remains expandable.

Do not maintain three parallel copy generators that can contradict each other.

A route explanation should distinguish:
- measured route fact;
- selection tradeoff;
- evidence coverage/caveat;
- external/live status.

#### Road-lock satisfaction / must-lock conflict — PRIMARY WHEN PRESENT

This changes whether the selected ride actually honors authored intent. Keep visible whenever unresolved. Do not bury behind generic evidence.

#### Replay comparison — CONTEXTUAL / POST-RIDE

Relevant only when viewing an actual recorded ride beside its plan. Keep out of ordinary route preparation.

#### RouteWeatherPanel — CONTEXTUAL, preferably lazy

Weather can change a go/no-go ride decision and stays beta-relevant.

Current behavior performs weather requests when the preparation details mount. After prep is simplified:
- fetch when weather/readiness is actually requested or when a compact route-readiness summary intentionally needs it;
- warnings may elevate themselves;
- ordinary route selection should not trigger weather work;
- failure means unavailable, not `clear`.

#### TripStagePanel — CONTEXTUAL / DEFER FROM ORDINARY ROUTES

The current panel exposes daily ride time, fuel range, reserve, break cadence, daylight window and overnight labels on every selected route's preparation surface.

For beta this should appear only through an explicit `Plan multi-day trip` action or for a trip object already being edited. A one-hour local loop should never ask the rider to reason about overnight staging.

Do not delete the domain logic or saved trip data.

#### RouteRating — MOVE TO POST-RIDE

Current copy: `Rate this route for this bike` / `Teach Switchback your road taste` before the rider starts the route.

That is temporally wrong as a default workflow. Pre-ride rating trains preference from expectation, not experience.

Beta direction:
- ask for rating after a recording/completed ride or when explicitly reviewing a ridden route;
- keep route selection itself as implicit intent only if the product contract explicitly permits it;
- do not show star controls in ordinary preparation.

This also reduces risk that preference learning learns from routes the rider never rode.

#### RouteSharePanel + CommunityPublishPanel — CONSOLIDATE BEHIND ONE `Share` ACTION

Both currently ask separately for:
- hide start;
- hide finish;
- privacy radius.

One then creates a private editable copy; the other adds title/description/visibility, passkey auth and publishes a sanitized public/unlisted route.

This duplicates privacy decisions and gives public publishing permanent preparation space.

Beta direction:

```text
Share
  Private editable link          default
  Publish to Discover…           explicit secondary path
```

One shared privacy-preview model/controller owns start/finish/radius and exact sanitized geometry. Public publishing adds only its unique metadata/authentication step.

Preserve existing private-link semantics and community records; no backend/data deletion during UI consolidation.

#### Save / Export — PRIMARY ACTIONS, BUT COMPACT

These are useful and deterministic. Do not bury them among evidence panels.

Recommended:
- Save is a visible secondary action.
- Export opens a small format chooser only after `Export` is invoked; do not permanently show a GPX format select in every preparation view.

#### Public publishing — DEFER PROMINENCE, NOT NECESSARILY CAPABILITY

The beta is a small rider group, while public route sharing is already implemented. Keep it reachable if tested, but do not allow it to dominate the core plan→ride path.

## 2. UI customization is likely overpowered for beta

Settings currently exposes a `Customize` editor that lets the rider reorder:

- Plan quick actions;
- Quick map layers;
- Ride HUD metrics;
- Recording metrics;
- 12 route-detail modules, including `rating-publish`.

The settings data model persists all of those arrays/order/hidden-module fields.

This creates two costs:

1. every redesigned planner/route-detail surface must preserve an arbitrary user layout contract;
2. agents must reason about defaults plus every customized ordering/visibility state while the base information architecture is still changing.

### Beta recommendation

Run a usage/reference audit before touching stored data.

For beta, likely retain only customization that improves real on-bike/task ergonomics:

- Ride HUD metric selection/order (bounded to 3);
- perhaps quick-layer choices if #82 confirms the current UI consumes them;
- perhaps recording metrics.

Candidates to DEFER/HIDE until the base UI stabilizes:

- arbitrary Plan quick-action ordering;
- arbitrary route-detail module ordering/hiding.

Why: the application should first ship one excellent default hierarchy. Exposing layout customization before the hierarchy is coherent transfers design responsibility to the rider and multiplies the QA state space.

Do not delete `RiderUiPreferences` fields in one beta cleanup PR. First prove which are consumed, then provide a versioned migration/default for any retired field.

## 3. Settings duplicates ride intent/default concepts

Settings contains:
- Default route style;
- Avoid highways default;
- Learn from my rides;
- bike category and surface capability.

These are legitimate durable defaults, but they must remain clearly separate from route-specific authored intent.

Audit that:
- changing a default does not mutate an active ride unexpectedly;
- an explicit current ride always wins;
- `Avoid highways` is not presented as an independent permanent preference plus a conflicting style/profile choice;
- `Learn from my rides` is inspectable before #81-style memory becomes more influential.

Do not add more persistent preference axes to Settings until #80/#81 prove rider value.

## 4. Browse surfaces are duplicated

Current product has:
- in-app Discover community browse;
- `/routes` community list;
- `/routes/[routeId]` detail;
- `/gpx-library` curated/project Atlas browse;
- `/gpx-library/[routeId]` detail;
- project GPX also appears inside personal Rides.

The duplicate is the **browse task**, not necessarily URL/storage objects.

Beta target:
- Discover is canonical browse UI;
- source is explicit (`Curated`, `Community`);
- public/deep-link detail URLs stay for compatibility/share;
- project corpus leaves personal Rides;
- existing Atlas filter/minimap logic is reused rather than rewritten.

Retire/redirect list pages only after deep-link, server rendering and share/SEO behavior are verified.

## 5. Community scope needs product restraint

The API surface currently includes community routes and reports, and the route preparation surface directly exposes publish/unpublish.

`AGENTS.md` explicitly defines sharing as opaque-link/read-only snapshots, not a social network.

Beta rule:
- keep only infrastructure needed for safe publish/discover/reporting of routes that is already proven;
- no feed, followers, likes, DMs, social reputation or moderation-product expansion;
- do not delete stored community/report data in a debloat pass;
- report/admin machinery can remain non-prominent infrastructure.

## 6. Global stylesheet authority is carrying migration debt

`src/app/layout.tsx` imports a long ordered chain of global feature CSS files. Comments explicitly describe recovered styles, late overrides and rules loaded last to neutralize stale earlier geometry.

`globals.css` still bundles four font families because Sora/DM Sans remain for V1 carry-over, while `tokens.css` identifies Inter/Oswald as the V2 pair and keeps V1 variable aliases.

This is an agent-regression amplifier:
- behavior depends on import order;
- a worker cannot know whether a local selector is authoritative without tracing later files;
- mobile fixes become another override instead of removing the old rule;
- all four font packages stay in the client build until migration is genuinely complete.

Beta path:
1. read-only selector/reference inventory;
2. choose one surface;
3. migrate its live rules to canonical V2 token/module authority;
4. delete superseded selectors/file in same PR;
5. run visual sizes before and after;
6. repeat.

Never create `beta-fixes.css`, `final-polish.css`, or similar new last-write-wins authority.

## 7. Legacy/compatibility components need evidence-based retirement

Example: `src/components/planner/LibraryDrawer.tsx` is currently only a re-export of `RidesDestination`.

That may be a legitimate compatibility seam or dead naming debt. Do not delete based only on file size.

Cheap-agent retirement inventory should identify:
- importers;
- tests;
- public API/barrel references;
- migration reason;
- removal condition.

Candidates include:
- re-export shims;
- V1 CSS aliases;
- legacy route choice UI inside `RouteComparison` if current V2 never enables it outside tests/compatibility;
- old route browse list pages after Discover convergence;
- stale feature flags after exact rollout evidence;
- MapLibre only after ADR retirement/device/production criteria.

## 8. RouteComparison may still contain a second/legacy route chooser

`PlannerComposition` owns the V2 route-choice workspace and opens `RouteComparison` as route details with `showRouteChoices={false}`. `RouteComparison` itself still contains a full `Choose a route` / `route-slips` implementation behind `showRouteChoices`.

Do not delete it yet: verify all call sites and tests first.

If current production has no legitimate caller with `showRouteChoices=true`, retire that route chooser rather than maintaining two representations of candidate selection.

Value:
- fewer route-role/copy implementations to reconcile;
- smaller visual QA surface;
- fewer contradictory labels;
- RouteComparison can become what V2 already treats it as: selected-route details/preparation.

## 9. Feature promotion matrix for beta

| Capability | Beta placement | Rationale |
|---|---|---|
| Search / natural ride request | PRIMARY | core planning |
| Map point/drag/draw | PRIMARY | core direct manipulation |
| Route alternatives | PRIMARY | core differentiator |
| Route warnings / hard constraint conflicts | PRIMARY | trust/safety |
| Start ride | PRIMARY | core completion |
| Save | PRIMARY secondary | repeat use |
| Export GPX | PRIMARY secondary / contextual chooser | ADV/Garmin value |
| Weather warning | PRIMARY if warning; details contextual | ride decision |
| Full weather samples | CONTEXTUAL | useful, not always needed |
| Full data-quality bars | CONTEXTUAL | evidence detail |
| Full evidence/survey prose | CONTEXTUAL | trust detail |
| GPX join | CONTEXTUAL track-only | route-type specific |
| Replay comparison | POST-RIDE/contextual | recording review |
| Rating | POST-RIDE | experience-based preference |
| Multi-day staging | CONTEXTUAL explicit | specialist trip task |
| Private share | CONTEXTUAL action | useful but not planning core |
| Public publish | CONTEXTUAL secondary share path | not core preparation |
| Route-detail layout customization | DEFER/HIDE candidate | QA/design multiplier |
| More mascot panels | DEFER | no decision value |
| Cinematic 3D | DEFER | polish after core beta |
| New providers | DEFER | core decision UX first |

## 10. Next debloat tasks to add to execution queue

### DB-1 — Preparation module usage/decision audit

Read-only cheap-agent task. For each current prep module, record trigger frequency/condition, API/network side effects, duplicate information, current test coverage and recommended placement.

### DB-2 — Build `RoutePreparationSummary` read model

Only after DB-1. Pure model that elevates blocking/warning facts and produces concise readiness rows. It references, not replaces, detailed evidence modules.

### DB-3 — Split preparation information from actions

Start ride + compact Save/Export/Share remain readily reachable. Detailed evidence/weather/offline live under one bounded Prepare/Details task. Multi-day and publishing become explicit subflows.

### DB-4 — Shared privacy/share flow

One sanitized-preview/privacy configuration shared by private link and community publish. Preserve exact privacy semantics and tests.

### DB-5 — Post-ride feedback relocation

Move route rating from pre-ride preparation to completed/recorded ride review. Verify preference-learning semantics/migration before altering data.

### DB-6 — UI customization consumption audit

Read-only. Prove which `RiderUiPreferences` fields are actually consumed. Decide keep/hide/retire per field with versioned migration plan.

### DB-7 — Retire duplicate route chooser if unreferenced

Prove call sites. If V2 RouteDecisionRail is sole normal chooser, remove RouteComparison's route-slip branch and associated stale CSS/tests after migration.

## Beta debloat acceptance

Debloat is successful when:

- ordinary Plan→Choose→Prepare→Ride contains fewer decisions but loses no necessary capability;
- route warnings and unknown evidence become more visible, not less;
- secondary features remain reachable through contextual actions;
- no user data is silently deleted;
- one module owns each rider-facing concept;
- CSS/React state authority becomes easier to identify;
- visual/test state space shrinks;
- the app feels like one product rather than a set of implemented demos.
