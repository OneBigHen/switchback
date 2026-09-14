# PR3 — Mapbox Phase 1 execution runbook

This packet implements the renderer rollout contract from ADR 0015 on the
reconciled PR #139 base. It does not enable production Mapbox, change routing,
or replace the server capability contract planned for Packet D. Work one task at
a time, in the order below, and stop at the stated owner boundary.

## T-3.1 — Permit the selected renderer's browser requests

**Goal**

Allow the Mapbox Standard renderer and the existing ArcGIS basemap to make the
browser requests their current adapters already issue, while correcting the
existing ArcGIS image-host typo.

**Dependencies**

- PR #139 exact head `a1346aeb85ffc25584ec46e19f124995d4568c9d`, or a proven
  descendant containing the current map-stage contract.
- ADR 0015's Mapbox GL JS v3 renderer decision.

**Existing implementation**

- `next.config.ts`: `SECURITY_HEADERS` contains the current `img-src` and
  `connect-src` directives.
- `src/components/planner/planner-map-renderer.ts`: `mapboxRenderer.load`,
  `mapboxRenderer.create`, and the MapLibre style loader are the request owners.
- `tests/unit/next-config.test.ts`: existing `allowedDevOrigins` contract.
- `tests/unit/deployment-contract.test.ts`: source-level deployment/security
  contract checks; use it as the precedent for configuration assertions.

**Files expected to change**

- `next.config.ts`
- `tests/unit/next-config.test.ts`

**Contract**

- `connect-src` includes `https://api.mapbox.com` and
  `https://events.mapbox.com`.
- The existing ArcGIS image origin is the exact host
  `https://server.arcgisonline.com`, matching its `connect-src` origin.
- No wildcard, secret, token, provider activation, or routing endpoint is added.
- All existing allowed origins remain allowed.

**Implementation steps**

1. Add the two exact Mapbox origins to the existing `connect-src` directive.
2. Correct only the `img-src` ArcGIS origin to its verified `.com` form.
3. Add focused assertions to `tests/unit/next-config.test.ts` for both Mapbox
   hosts and the corrected ArcGIS image host.

**Tests**

- Red/green loop:
  `npx vitest run tests/unit/next-config.test.ts tests/unit/deployment-contract.test.ts`
- Broader affected configuration tests:
  `npx vitest run tests/unit/next-config.test.ts tests/unit/deployment-contract.test.ts tests/unit/security-headers.test.ts`

**Acceptance criteria**

- The focused tests prove the exact CSP hosts and the corrected ArcGIS origin.
- `git diff --check` is clean.
- No unrelated CSP directive changes are present.

**Stop conditions**

- A current adapter requires a host not covered by ADR 0015 or the verified
  existing source.
- A token or secret would need to enter `next.config.ts`.
- The required host list differs from the current renderer implementation.

**Proof**

- Record the exact test command and pass count, `git diff --check`, and the
  commit SHA in the task completion report.

## T-3.2 — Fall back from a failed Mapbox mount to MapLibre

**Goal**

When the opt-in Mapbox renderer fails before its initial style is usable, move
the same planner props to the existing MapLibre renderer and remember that
fallback for the browser session. A MapLibre failure remains an actionable map
error; it must not create a fallback loop.

**Dependencies**

- T-3.1's browser request contract.
- Existing `MapStageProps` and renderer-neutral `PlannerMapStage` contract.
- ADR 0015's statement that MapLibre is the migration rollback path.

**Existing implementation**

- `src/components/planner/MapStage.tsx`: `MapStage` chooses Mapbox from
  `isPremiumMapboxRendererEnabled()` and otherwise mounts `PlannerMapStage` with
  `maplibreRenderer`.
- `src/components/planner/MapboxMapStage.tsx`: passes Mapbox through the shared
  `PlannerMapStage`.
- `src/components/planner/PlannerMapStage.tsx`: the renderer effect calls
  `renderer.load()`, `renderer.create()`, handles `map.on("error")`, tracks
  `initialStyleLoaded`, and owns the 20-second style timeout.
- `src/components/planner/map-stage-props.ts`: renderer-neutral `MapStageProps`.
- `tests/components/map-stage.test.tsx`: current MapStage quick/advanced layer
  contract.
- `tests/components/planner-map-renderer.test.ts`: renderer adapter behavior.

**Files expected to change**

- `src/components/planner/map-stage-props.ts`
- `src/components/planner/MapStage.tsx`
- `src/components/planner/PlannerMapStage.tsx`
- `tests/components/map-stage-fallback.test.tsx` (new regression test)

**Contract**

- Mapbox initial bundle-load, map-construction, initial style-error, and
  initial-style-timeout failures invoke an optional internal failure callback.
- The callback unmounts Mapbox and mounts `PlannerMapStage` with
  `maplibreRenderer`, preserving all `MapStageProps` and planner controls.
- A session-storage marker prevents Mapbox from retrying during the same browser
  session. Storage access failure is non-fatal and still falls back in memory.
- Failures after the initial style is loaded (for example an overlay/data
  request) do not tear down a working renderer.
- Cleanup clears timers/listeners and ignores late async failures after unmount.
- MapLibre never calls the Mapbox fallback callback and therefore cannot loop.

**Implementation steps**

1. Add one optional `onRendererFailure(error)` callback to `MapStageProps`; do
   not add a second renderer or duplicate map props.
2. In `MapStage`, choose Mapbox only when the rollout gate is enabled and the
   session marker is absent. Memoize the callback that records the marker and
   switches the local renderer state to MapLibre.
3. In `PlannerMapStage`, route only pre-initial-style load/create/error/timeout
   failures through the callback. Guard every async callback with the existing
   disposed flag and preserve the current MapLibre error text when no callback
   exists.
4. Keep the existing `MapboxMapStage` shared-stage wrapper; its props spread
   must forward the callback unchanged.
5. Add a component regression that mocks the two stage entries, triggers a
   Mapbox failure, proves MapLibre is mounted, and proves a second mount in the
   same session starts on MapLibre.

**Tests**

- Red/green loop:
  `npx vitest run tests/components/map-stage-fallback.test.tsx`
- Existing map controls:
  `npx vitest run tests/components/map-stage.test.tsx tests/components/map-stage-fallback.test.tsx tests/components/planner-map-renderer.test.ts`
- Required regression cases: callback-driven fallback, session marker, no
  Mapbox retry after remount, and no fallback path for MapLibre.

**Acceptance criteria**

- A failed Mapbox initial mount visibly replaces the Mapbox stage with the
  existing MapLibre stage without losing planner props.
- The fallback marker is scoped to the current browser session.
- Mapbox failure does not leave an uncaught late promise or a permanent loading
  overlay; MapLibre failure still surfaces the existing map error.
- No production flag, token, provider, or routing behavior is changed.

**Stop conditions**

- The existing renderer-neutral stage cannot distinguish initial style failure
  from a post-load overlay failure without widening the approved contract.
- The fallback requires a new provider interface or a second map implementation.
- A test needs a real paid Mapbox token, production config, or an external
  provider call.

**Proof**

- Record the targeted red failure, green pass count, affected Vitest result,
  `git diff --check`, and commit SHA. The browser proof belongs to T-3.4.

## T-3.3 — Use truthful renderer-specific map labels

**Goal**

Keep canonical preset ids stable while calling the fallback renderer's
`terrain` experience `Outdoors`, because MapLibre does not provide the Mapbox
Standard Terrain experience. Mapbox keeps the `Terrain` label.

**Dependencies**

- T-3.2's renderer selection/fallback contract.
- Existing `MapPresetId` registry; do not change its ids or canonical registry
  labels.

**Existing implementation**

- `src/components/planner/v2/LayersSheet.tsx`: `MAP_PRESETS` labels and the
  `premiumExperiences` filter for the quick surface.
- `src/components/planner/MapStageLayerControl.tsx`: `PRESET_LABELS` and
  `mapPresetChoices(premium)` for Advanced map settings.
- `src/components/planner/PlannerMapStage.tsx`: passes
  `premiumExperiences={renderer.id === "mapbox"}`.
- `tests/components/layers-sheet-v2.test.tsx`: premium and fallback quick
  surface checks.
- `tests/components/map-stage.test.tsx`: MapStage fallback controls.
- `tests/e2e/critical/planner-journeys.spec.ts`: browser quick-layer labels.
- `tests/unit/map-preset-registry.test.ts`: canonical preset ids/registry; this
  test must continue to expect the registry's `Terrain` id label.

**Files expected to change**

- `src/components/planner/v2/LayersSheet.tsx`
- `src/components/planner/MapStageLayerControl.tsx`
- `tests/components/layers-sheet-v2.test.tsx`
- `tests/components/map-stage.test.tsx`
- `tests/e2e/critical/planner-journeys.spec.ts`

**Contract**

- Mapbox: `Road`, `Terrain`, `Satellite`.
- MapLibre: `Road`, `Outdoors`; Satellite remains unavailable.
- The selected values remain `road`, `terrain`, and `satellite` as defined by
  `MapPresetId`; only rider-facing copy changes.
- The label must be derived from the renderer capability already passed by the
  stage, not from a client-only guess or a second map model.

**Implementation steps**

1. Make the quick-sheet terrain label depend on `premiumExperiences`.
2. Make the Advanced preset-choice terrain label use the same boolean.
3. Update component and critical browser assertions for the fallback label and
   retain premium `Terrain` coverage.
4. Run the registry test unchanged to prove ids were not renamed.

**Tests**

- Red/green component loop:
  `npx vitest run tests/components/layers-sheet-v2.test.tsx tests/components/map-stage.test.tsx`
- Registry guard:
  `npx vitest run tests/unit/map-preset-registry.test.ts`
- Browser contract:
  `npx playwright test tests/e2e/critical/planner-journeys.spec.ts --project=critical-chromium`

**Acceptance criteria**

- Both quick and Advanced fallback surfaces expose `Outdoors` and no
  renderer-inaccurate `Terrain` label.
- Premium surfaces retain `Terrain` and `Satellite`.
- Existing preset selection callbacks receive the same ids as before.

**Stop conditions**

- The renderer capability is not available at the label owner.
- A requested copy change would require changing a canonical preset id or
  registry contract.

**Proof**

- Record the focused red/green result, registry result, browser result, and
  exact commit SHA.

## T-3.4 — Browser-prove Mapbox mount and deterministic fallback

**Goal**

Exercise the actual browser Mapbox GL JS path in a controlled critical test,
then abort only its style request and prove the same page falls back to
MapLibre. The test must not contact a paid Mapbox service or require a real
token.

**Dependencies**

- T-3.1 through T-3.3.
- Playwright's existing local web server and critical project conventions.

**Existing implementation**

- `playwright.config.ts`: local server command, critical project definitions,
  and test matching rules.
- `package.json`: `test:e2e:critical` script and project scripts.
- `.github/workflows/quality.yml`: `rider-journeys` job and browser install step.
- `tests/e2e/helpers/planner-fixtures.ts`: `installPlannerServices` and
  `EMPTY_MAP_STYLE` for deterministic local app requests.
- `tests/e2e/critical/planner-journeys.spec.ts`: existing critical browser
  style/control assertions.

**Files expected to change**

- `playwright.config.ts`
- `package.json`
- `.github/workflows/quality.yml`
- `tests/e2e/critical/mapbox-fallback.spec.ts` (new)

**Contract**

- A dedicated critical Playwright project starts the local app with the
  temporary test-only Mapbox rollout flag and a dummy public token.
- The spec fulfills Mapbox style/asset requests with local deterministic
  responses; it never uses a production token or paid network request.
- One test proves a Mapbox canvas mounts and exposes premium controls; another
  aborts the initial Mapbox style request and proves a MapLibre canvas and
  fallback labels appear.
- Normal projects continue to run with the default MapLibre environment. The
  Mapbox project is explicitly named in config and in the quality workflow so
  the spec cannot silently run nowhere.

**Implementation steps**

1. Add a dedicated `critical-mapbox` project/test matcher and an opt-in
   `SWITCHBACK_E2E_MAPBOX=1` server-command prefix in `playwright.config.ts`.
2. Add the narrow `test:e2e:mapbox` package script selecting only the new
   project/spec.
3. Add `mapbox-fallback.spec.ts` using `installPlannerServices`, local style
   fulfillment, a dummy token, and an initial-style abort case. Clear
   `sessionStorage` at test start and assert the renderer-specific canvas and
   labels.
4. Add one workflow step after the existing Chromium critical journeys that
   runs `npm run test:e2e:mapbox`; keep browser install and failure artifact
   handling under the existing rider-journeys job.

**Tests**

- Focused browser run:
  `npm run test:e2e:mapbox`
- Existing critical suite:
  `npm run test:e2e:critical`
- The new spec must cover successful Mapbox mount, style failure fallback,
  session fallback state, premium/fallback labels, and absence of paid requests.

**Acceptance criteria**

- The new spec passes in Chromium against the local app at the exact commit.
- The forced failure proves MapLibre is mounted after Mapbox's initial style
  fails, with controls still usable.
- The normal critical project remains MapLibre by default and its existing
  tests pass.
- The workflow runs the new project explicitly.

**Stop conditions**

- Mapbox cannot be exercised without a real token or paid request.
- The local browser cannot distinguish an initial style failure from an overlay
  failure without changing the approved renderer contract.
- The new project changes the environment of existing critical projects.

**Proof**

- Record the exact `npm run test:e2e:mapbox` output, existing critical result,
  workflow diff, `git diff --check`, and commit SHA. Browser emulation is not
  physical iPhone, PWA, GPS, battery, or production proof.

## T-3.5 — Record the temporary rollout boundary

**Goal**

Make the temporary client rollout flag, its test-only use, and the owner-only
production gate explicit in the execution authority without performing a
production mutation.

**Dependencies**

- T-3.1 through T-3.4 exact-head evidence.
- ADR 0015 and the authority document's T-3.6 owner gate.

**Existing implementation**

- `docs/adr/0015-mapbox-primary-renderer.md`: accepted renderer decision and
  token/rollback consequences.
- `docs/release/ROADMAP-WAVES.md`: Phase 1/2 renderer and map-experience
  sequencing.
- `docs/plans/2026-09-14-cheap-agent-execution-authority.md`: canonical task
  index, production quarantine, and T-3.6 owner-only procedure.
- `src/lib/client/mapbox-config.ts`: temporary rollout flag/token gate.

**Files expected to change**

- `docs/plans/2026-09-14-cheap-agent-execution-authority.md`
- `docs/plans/2026-09-14-pr3-mapbox-phase1-agent-runbook.md`

**Contract**

- Local/CI test flags and dummy tokens are not production activation.
- Production activation remains T-3.6 OWNER OPS and requires the prerequisites,
  verification, rollback, and proof already listed in the authority.
- No `.env.local`, `/etc/switchback/switchback.env`, service, provider
  dashboard, token restriction, or deployed artifact is changed by this task.

**Implementation steps**

1. Link this runbook from the canonical authority's executable-artifact list.
2. Record the exact T-3.1–T-3.4 heads/results and keep T-3.6 explicitly blocked.
3. If the authority and ADR wording differ, preserve the ADR and stop rather
   than silently changing architecture.

**Tests**

- `git diff --check`
- `rg -n "T-3\.6|OWNER OPS|production|Mapbox" docs/plans/2026-09-14-cheap-agent-execution-authority.md docs/plans/2026-09-14-pr3-mapbox-phase1-agent-runbook.md docs/adr/0015-mapbox-primary-renderer.md`

**Acceptance criteria**

- One authority document links this runbook and states the exact status of all
  six PR3 tasks, including the owner-only T-3.6 gate.
- The docs do not claim Phase 1/2 or Phase 7 production completion.

**Stop conditions**

- Updating the record would require claiming an unrun browser or production
  gate.
- An owner-only action is requested or implied.

**Proof**

- Record the exact docs diff, `git diff --check`, and commit SHA. Do not report
  T-3.6 complete from local evidence.

## T-3.6 — OWNER OPS: production rollout (blocked)

This is not an implementation-agent task and must never be run from this
runbook. The owner must first confirm a merged PR3, green exact-head gates,
approval, backed-up production environment, origin-restricted public token, and
known-good MapLibre rollback artifact. The owner then sets the production flag
and deploys through the approved procedure, verifies deployed SHA/capabilities,
Road/Terrain/Satellite, fallback, map-load counter, and health, and records
rollback proof. Rollback restores the backed-up environment and MapLibre build
and repeats health/planner checks. Dependent work cannot proceed without that
evidence. The cheap agent stops before every production command.
