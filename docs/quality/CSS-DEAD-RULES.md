# Dead rule audit for `responsive.css` (TASK-2.1)

**Analysis only — nothing in this file has been deleted.** Verdicts below are
the starting hypothesis for TASK-2.2's batched deletion, which is the real
safety net: each batch is deleted then checked against the full visual
suite, and anything that regresses gets restored and re-marked UNCERTAIN.

## Methodology, and why it changed mid-task

The plan's suggested method was Chrome DevTools CSS coverage
(`page.coverage.startCSSCoverage()`) across a scripted walk of all 6 primary
screens at 3 viewports. That was tried first and **produced an unreliable
result on this codebase**: of 151 rules coverage marked as candidate-dead, a
spot check found the overwhelming majority were real, currently-shipping
component styles that the walkthrough fixture simply never reached --
`LibraryDrawer`'s row/filter/organize UI needs a saved route, and the
fixture route list was empty; `RouteRating` returns `null` without an
`onRate` callback; `TripStagePanel` needs a "Stage this trip" click;
`RideHudStatus`'s corridor badge needs a locked-corridor exit event; and so
on. Coverage under-reports state-dependent rules exactly as the plan
warned, but on this component tree that undercount was the majority of the
uncovered set, not the exception -- publishing it as a delete list would
have been actively misleading.

**Replacement method:** static cross-reference of every class name in each
rule's selector against every `.tsx`/`.ts` file under `src/components` and
`src/app` (excluding `styles/`), matching literal `className="..."`,
template-literal fragments, and bare tokens. This is the same technique
TASK-1.4 used in the other direction (JSX → CSS); here it runs CSS → JSX. It
is far more reliable for a *static* dead-code question, but still has two
known false-positive sources, both confirmed present in this codebase:

1. **Interpolated class names** the regex can't reconstruct, e.g.
   `` `style-${style}` `` (style is `"clean"|"explorer"|"night"`),
   `` `is-${layerState}` ``, `` `waypoint-node-${id}` ``. A rule targeting
   `.style-explorer` looks unreferenced because the literal string
   `"style-explorer"` never appears in source -- only the template pattern
   does.
2. **Third-party injected classes.** `.maplibregl-ctrl-*` selectors style
   DOM nodes MapLibre itself creates; they never appear in our JSX at all
   and will always look "unreferenced" by this method.

Every rule the script flagged as DEAD or PARTIAL was individually re-checked
by hand (broader unquoted `grep`, reading the component source) before
being included below. That manual pass reclassified all but 2 of the
original candidates as false positives from the causes above.

## Script

`scripts/qa/find-dead-css-rules.mjs` (parses `responsive.css` into top-level
rule blocks, cross-references each selector's class names against
`src/components/**` and `src/app/**`).

```bash
node scripts/qa/find-dead-css-rules.mjs
```

## Result

Raw output of the command above, 2026-08-15 on commit `8353f37`:

```
{ KEEP: 512, PARTIAL: 11, DEAD: 5 }
```

| Verdict | Count | Meaning |
|---|---|---|
| KEEP | 512 | At least one class in the selector is referenced in JSX literally. |
| PARTIAL | 11 | Some but not all classes in a compound selector matched literally -- always a false positive in this codebase so far (see table below), never delete on a PARTIAL verdict without checking by hand. |
| DEAD | 5 | No class in the selector appears anywhere in `src/components`/`src/app` by literal matching. Only 2 of these 5 survive manual review (below) -- **the script's raw DEAD/PARTIAL output is a prompt to investigate, not a verdict.** |

### DEAD (2 of the script's 5) — confirmed by hand, safe candidates for TASK-2.2

| Line | Selector | Notes |
|---|---|---|
| 1963 | `.engine-status` | Zero references anywhere in `src/components`/`src/app`. **Not just a `responsive.css` duplicate** -- the same dead class also has rules in `planner-shell.css:304,315`, `ride-hud.css:332`, `switchback-v1.css:160`, and `responsive.css:879`. All six should be removed together in TASK-2.2/2.3, not just the `responsive.css` copies, or the class stays dead-but-present in 5 of 6 files. |
| 2049 | `.omnibox-helper` | Zero references anywhere in `src/components`/`src/app`. Single occurrence, `responsive.css` only. |

### False positives ruled out during manual review (for TASK-2.2's reference, not a TODO list)

These looked dead to naive static matching but are confirmed alive by
reading the component source directly:

| Selector | Why it looked dead | Confirmed live at |
|---|---|---|
| `.style-explorer`, `.style-night` | Built via `` `style-${style}` `` | `MapStageLayerControl.tsx` |
| `.waypoint-node-finish` (and other `-{id}` suffixes) | Built via `` `waypoint-node-${id}` `` | `WaypointField.tsx` |
| `.layer-status-badge.is-ready`, `.is-zoom` | Built via `` `is-${layerState}` `` | `MapStageLayerControl.tsx` |
| `.route-slip`, `.route-slip.is-selected` | Built via `` `route-slip${selected ? " is-selected" : ""}` `` | `RouteComparison.tsx` |
| `.ride-map-recenter`, `.is-following` | Same interpolation pattern | `MapStage.tsx` |
| `.road-locks-dock-button`, `.has-must-locks` | Same interpolation pattern | `PlannerDeck.tsx` |
| `.waypoint-field`, `.is-armed` | Same interpolation pattern | `WaypointField.tsx` |
| `.maplibregl-ctrl-*` (multiple rules) | Never appears in our JSX by definition | Injected by the MapLibre library itself, not our code |
| `.library-error` | Real component uses `.road-lock-library-error` (different, more specific class name) in `RoadLockLibraryDrawer.tsx` -- `.library-error` itself genuinely has no user, but it's a **near-miss naming collision**, not proof the underlying empty/error-state UI is dead. Flag for a human look in TASK-2.2 rather than auto-delete. |

## Recommendation for TASK-2.2

Given how small and low-confidence the coverage-only DEAD set turned out to
be, and how much manual verification it took to separate 2 real dead rules
from ~200 false positives, **do not re-run the coverage-based approach for
the rest of `responsive.css`'s Era A cleanup.** Prefer this static
cross-reference method as the first pass, always manually spot-check
anything it flags (the interpolation and third-party-class blind spots are
real and will recur), and lean on the batch-and-visual-verify loop as the
actual authority -- not this document.
