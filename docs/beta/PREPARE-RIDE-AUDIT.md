# DB-1 — `Prepare ride` module audit

Read-only inventory against `main` @ `f501b41`, 2026-09-09. **A report, not a change.**

Produced by a read-only worker; every claim reproduced below was checked against
the working tree by the coordinator before being recorded. Line numbers are
current, not the 2026-09-08 `DEBLOAT-AUDIT.md` baseline, which this supersedes
for section 1 of that document.

Entry point: `src/components/planner/RouteComparison.tsx` (499 lines). Its only
production caller is `src/components/planner/PlannerComposition.tsx:150-155`.

## Module inventory

| # | Module | Render condition | Work on mount | Placement |
|---|---|---|---|---|
| 1 | `RouteDataQualityPanel` | always once open (`:367`) | pure `useMemo` | CONTEXTUAL |
| 2 | `GpxIntelligencePanel` | `selectedRoute.gpxIntelligence` (`:369`) | none | CONTEXTUAL (already gated) |
| 3 | GPX Join (inline `:371-396`) | track-only, unjoined, handlers present | none until "Find entries" | CONTEXTUAL (already gated) |
| 4 | Measured route facts (inline `:398-405`) | `routeFacts.length > 0` | sync compute, **not memoised** | CONTEXTUAL, consolidate |
| 5 | "Why this route" (inline `:407-415`) | `selectedRoute.routeScore` | sync compute | CONTEXTUAL, consolidate |
| 6 | Road-lock satisfaction (`:417-429`) | rows with `skippedReason` | none | **PRIMARY when present** |
| 7 | Must-lock recovery (`:431-445`) | first unsatisfied must-lock | autofocus effect | **PRIMARY when present** |
| 8 | Replay comparison (`:447-456`) | recorded ride selected | none | POST-RIDE |
| 9 | `RouteWeatherPanel` | always once open (`:458`) | **network fetch** | CONTEXTUAL, mount lazily |
| 10 | `RouteEvidencePanel` | always once open (`:460`) | none | CONTEXTUAL, consolidate |
| 11 | `TripStagePanel` | always once open (`:462`) | `buildTripStages` runs even while collapsed | CONTEXTUAL / DEFER |
| 12 | `RouteRating` | always once open (`:464`) | `localStorage` read | **POST-RIDE** |
| 13 | `RouteSharePanel` | always once open (`:466`) | local preview only | CONTEXTUAL action |
| 14 | `CommunityPublishPanel` | always once open (`:468`) | local sanitised preview | CONTEXTUAL secondary |
| 15 | Save (`:470-474`) | always once open | none | PRIMARY (compact) |
| 16 | GPX format select + Export (`:475-491`) | always once open | none | PRIMARY; chooser after "Export" |

`RouteComparison.tsx:189` also calls `loadRiderSettings()` unmemoised in the
component body, so it reads `localStorage` on every render regardless of whether
the disclosure is open.

## Hazard 1 — weather fetches on mount: CONFIRMED, but do not lazy-mount it

**Correction, 2026-09-09.** The first version of this document recommended
mounting weather lazily. That is wrong, and would have traded a safety signal
for a network saving. Recorded here rather than quietly amended, because the
recommendation was acted on as far as being scheduled.

`RouteWeatherPanel` mounts unconditionally at `:458`, and its effect
(`RouteWeatherPanel.tsx:35-38`) calls `requestRouteWeather` immediately, which
POSTs to `/api/route-weather`. Opening `Prepare ride` *is* the trigger; there is
no separate "load weather" action.

**Consequence for the debloat work: reordering or lazily mounting modules changes
network behaviour, not just layout.** Any DB-3 change here has to be treated as a
behavioural change and verified as one.

Failure handling is already honest and must stay that way:
`RouteWeatherPanel.tsx:70-71` renders an explicit error state with a retry, never
a clean "clear" reading, and a test pins that a permanent failure stays visible.

### Why lazy-mounting is the wrong fix

`RouteWeatherPanel.tsx:89-96` renders severe-weather alerts in a `role="alert"`
block **above** the per-sample cards. The panel already implements the hierarchy
this audit asks for: the warning elevates itself, the detail follows.

Mounting the panel lazily would mean the alert is only fetched — and therefore
only seen — if the rider opens the weather section. A rider who skips it would
get no signal that there is a severe-weather alert on their route.

That contradicts the product's own rules:

- `DEBLOAT-AUDIT.md`'s promotion matrix: *"Weather warning | PRIMARY if warning;
  details contextual"* and *"warnings may elevate themselves"*;
- `AGENTS.md`: Switchback answers *"what should I know before committing to
  it?"*;
- the beta HOLD conditions, which keep hard warnings visible.

You cannot know whether there is an alert without fetching. So the network cost
is the price of the warning being primary, and it is the right trade.

### The corrected step

Keep the fetch. The debloat available here is visual only:

- the alert stays where it is, elevated and unconditional;
- the per-sample cards — temperature, conditions, rain chance, wind, per
  location — become a disclosure rather than a wall.

The audit's original goal, *"ordinary route selection should not trigger weather
work"*, is not reachable while warnings are primary, unless a cheaper
alerts-only request is introduced. That would be new capability and needs its
own decision under the integration gate; it is not a debloat task.

## Hazard 2 — pre-ride rating trains preference: CONFIRMED, and worse than assumed

The star control writes through `PlannerShell.tsx:1756-1766` into
`RiderPreferenceLibrary.record`, stored in IndexedDB keyed by `bikeId::profile`
(`rider-preference-library.ts:26-27`) — **not by route**, so the signal blends
into the whole bike+profile model.

The weighting is the problem. From `rider-preferences.ts:66-79`:

```ts
case "rating":         return signal.rating - 3   // 5★ = +2
case "completed-ride": return 0.5
```

**A 5★ rating on a route nobody has ridden carries four times the weight of
actually completing a ride.** The model learns more from a guess than from
experience.

It is not inert. `PlannerShell.tsx:333-345` reads the stored preference on every
plan with two or more candidates, ranks with `rankRoutesForRider`, and calls
`applyAutomaticRouteSelection` — so a pre-ride rating measurably changes which
route Switchback picks for the rider next time.

Moving `RouteRating` post-ride is therefore a **data-semantics change**, not a
layout move, and DB-5 should own it. The weighting asymmetry deserves its own
decision regardless of where the control lives.

## The legacy route chooser is dead in production

`showRouteChoices` defaults to `true` (`RouteComparison.tsx:174`) and gates the
whole `route-slips` "Choose a route" implementation (`:246-300`).

- The only production caller passes `false` (`PlannerComposition.tsx:155`).
- `RouteDecisionRail` is the real V2 chooser.
- **No production caller passes `true`.**

But retiring it is not free, because of the finding below.

## Coverage gap: the tests describe a configuration production never ships

`tests/components/route-comparison.test.tsx` renders `RouteComparison` directly
about fifteen times and passes `showRouteChoices` **zero** times — so every one
of those renders exercises the default `true` branch, while production always
ships `false`.

Every DOM assertion in that file therefore describes the dead branch. Retiring
`showRouteChoices` (DB-7) means rewriting those tests against the shipped
configuration first — and that rewrite is worth doing on its own merits, since
right now the shipped configuration has no component-level coverage at all.

Other blocks with no test that actually renders them:

- GPX Join inline block (`:371-396`) — join *logic* is unit-tested, the UI is not;
- Replay comparison inline block (`:447-456`) — same shape;
- Road-lock satisfaction and must-lock wiring (`:417-445`) — the child components
  are unit-tested standalone, but `RouteComparison`'s own filtering and dismissal
  logic is not, and no fixture ever sets `lockSatisfaction`;
- Measured route facts (`:398-405`) — `explainRouteFacts` is unit-tested, the
  rendered list is not.

## Duplicate information

- **Surface and road mix are generated three times** from the same
  `route.surfaceMix`/`route.roadMix`: measured facts (`:398-405`), "Why this
  route" (`:407-415`), and `RouteEvidencePanel` (`RouteEvidencePanel.tsx:32-40`).
  Three prose generators over one source can drift apart.
- **Privacy controls are duplicated exactly** — hide start, hide finish, privacy
  radius — in `RouteSharePanel.tsx:57-62` and `CommunityPublishPanel.tsx:145-150`,
  each with its own state and its own identical clamp. A comment in the former
  already notes it is matching the latter.
- Route score appears both in the slip character line and again as "Route quality
  N/100" at `:412`.

## Recommended hierarchy

The smallest change that makes the surface answer *"is this the ride I want, and
is there anything I must know before starting?"*:

**Stay primary:** Start, Save, Export (format chooser only after Export is
invoked), and — whenever unresolved — road-lock satisfaction and must-lock
recovery. Those are hard conflicts and are never contextual.

**Become contextual, collapsed:** data quality (compact caveat first), the three
explanation generators consolidated into one read model, evidence, weather
(**mounted lazily**, per Hazard 1), trip staging (behind an explicit "Plan
multi-day trip" so `buildTripStages` stops running on every open), and share plus
publish behind one `Share` action with one privacy configuration.

**Move post-ride:** rating — sequenced with DB-5, and with the weighting question
answered.

**Retire after test rewrite:** the `showRouteChoices=true` branch.

Nothing here proposes deleting backend capability, stored rider data, or evidence
semantics. It is entirely about prominence in the rider journey.

## Suggested order

1. **DB-7 test rewrite** — point `route-comparison.test.tsx` at the shipped
   `showRouteChoices={false}` configuration. Everything else is safer once the
   production surface actually has coverage.
2. **Retire the dead chooser branch**, now that its tests do not depend on it.
3. **Collapse the weather sample cards** behind a disclosure, keeping the fetch
   and the elevated alert. Do **not** lazy-mount the panel — see the correction
   under Hazard 1.
4. **Consolidate the three explanation generators** into one read model.
5. **One Share flow** with one privacy configuration.
6. **DB-5 rating relocation**, with the `rating` versus `completed-ride`
   weighting decided explicitly rather than carried along.
