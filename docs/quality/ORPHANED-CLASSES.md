# Orphaned class name audit (TASK-1.4)

Static-analysis pass: every `className` literal (or literal segment inside a
template/conditional expression) found under `src/components/**` is checked
against every CSS file under `src/app/styles/*.css` for a matching `.token`
selector anywhere (rule, modifier, or nested).

## Script

`scripts/qa/find-orphaned-classes.mjs`

```bash
node scripts/qa/find-orphaned-classes.mjs
```

## Raw output (2026-08-15, commit `24798a0`)

```
Total distinct className tokens found: 471
Orphaned (no matching CSS rule found): 33

app-shell	src/components/shell/AppShell.tsx
community-publish-panel	src/components/planner/CommunityPublishPanel.tsx
curvature	src/components/planner/MapStageLayerControl.tsx
diagnostics-list	src/components/shell/DiagnosticsPanel.tsx
diagnostics-ok	src/components/shell/DiagnosticsPanel.tsx
diagnostics-panel	src/components/shell/DiagnosticsPanel.tsx
diagnostics-warnings	src/components/shell/DiagnosticsPanel.tsx
download-mode-corridor-option-input	src/components/planner/DownloadModePicker.tsx
free-ride-hud	src/components/shell/FreeRideHud.tsx
gps-	src/components/planner/RideHud.tsx
gps-retry-button	src/components/planner/RideHud.tsx
highway-toggle	src/components/planner/PlannerDeck.tsx
is-	src/components/planner/MapStageLayerControl.tsx, src/components/shell/RecordPanel.tsx
layer-confidence	src/components/planner/MapStageLayerControl.tsx
layer-legend	src/components/planner/MapStageLayerControl.tsx
map-avoid-surface	src/components/planner/MapStage.tsx
map-road-lock-experimental-note	src/components/planner/MapStage.tsx
must	src/components/planner/LibraryDrawer.tsx, src/components/planner/MapStage.tsx
notice-	src/components/planner/PlannerShell.tsx
planner-stage-chip	src/components/planner/PlannerDeck.tsx
prefer	src/components/planner/LibraryDrawer.tsx, src/components/planner/MapStage.tsx
record-panel	src/components/shell/RecordPanel.tsx
recording-pause	src/components/shell/FreeRideHud.tsx, src/components/shell/RideRecordingHud.tsx
recording-resume	src/components/shell/FreeRideHud.tsx, src/components/shell/RideRecordingHud.tsx
region-wifi-confirm	src/components/planner/RegionDownloadsPanel.tsx
region-wifi-confirm-actions	src/components/planner/RegionDownloadsPanel.tsx
ride-continue-cue	src/components/planner/RideHud.tsx
ride-reroute-error	src/components/planner/RideRecoveryActions.tsx
route-fact-list	src/components/planner/RouteComparison.tsx
route-rating-bike	src/components/planner/RouteRating.tsx
style-	src/components/planner/MapStageLayerControl.tsx
unpaved	src/components/planner/MapStageLayerControl.tsx
waypoint-node-	src/components/planner/WaypointField.tsx
```

## Manual triage of all 33

### Script false positives (9) — not orphaned, no action

The extraction heuristic pulls every quoted string out of a `className={...}`
expression, including string literals used in unrelated comparisons/ternaries
within the same expression, and static prefixes of dynamic template classes.
Verified against source; not real orphans.

| Token | Why it's a false positive |
|---|---|
| `curvature`, `unpaved` | String literals compared against `definition.id`, not class names (`MapStageLayerControl.tsx:128,141`) |
| `gps-`, `is-`, `notice-`, `style-`, `waypoint-node-` | Static prefix of a dynamic template class (e.g. `` `gps-${state}` ``); the real runtime class has CSS coverage |
| `must`, `prefer` | String literals from unrelated ternaries inside the same `className={...}` expression |

### Modifier classes with a styled base sibling (6) — no visual outage

These always render alongside a second class that already carries the full
visual treatment (`.route-share-panel`, `.ride-hud`, `.destination-panel`,
`.planner-shell`, `.curve-toggle`, `.map-sketch-surface`). The orphaned token
is a semantic/state hook with no CSS of its own — harmless today, but a
one-off rule could be added later if it ever needs separate treatment.

`app-shell`, `community-publish-panel`, `free-ride-hud`, `record-panel`,
`highway-toggle`, `map-avoid-surface`

### Styled via a parent + tag selector, not the class itself (2) — no visual outage

`recording-pause` and `recording-resume` (`FreeRideHud.tsx`,
`RideRecordingHud.tsx`) looked orphaned by the class-selector check, but both
render as `<button>` inside `.recording-controls`, and
`.recording-controls button` (`library-drawer.css:895`) already gives every
button in that group full dark-theme styling, hover, and disabled states.
Verified by reading the compiled rule, not just the selector list — this
was the script's methodology gap, not a real gap in the app. No fix needed.

### Genuine unstyled elements (16) — real gaps, flagged for follow-up

No sibling class provides fallback styling. Severity ranked by how much of
the element is affected.

**Higher severity — a whole interactive surface, not just a label:**

- `region-wifi-confirm` / `region-wifi-confirm-actions` —
  `RegionDownloadsPanel.tsx:531` renders a `role="alertdialog"` confirmation
  ("This update is not provably on Wi-Fi…") with **zero** CSS: no
  surface/border/elevation, and its two buttons carry no class at all. Reads
  as broken plain text, not a dialog.
- `diagnostics-panel` / `diagnostics-list` / `diagnostics-warnings` /
  `diagnostics-ok` — the whole `DiagnosticsPanel.tsx` component (reachable
  from Profile → Diagnostics) has no CSS. It inherits text color and grid
  gap from the now-fixed `.profile-panel` parent (TASK-1.1), so it is not
  invisible like the pre-fix Profile bug, but the `<dl>` renders with
  default browser spacing and the warnings list has no visual treatment.
**Lower severity — a single label, chip, or small-text element:**

`route-fact-list` (`RouteComparison.tsx:357`), `route-rating-bike`
(`RouteRating.tsx:31`), `ride-continue-cue` (`RideHud.tsx:327`),
`ride-reroute-error` (`RideRecoveryActions.tsx:98`), `planner-stage-chip`
(`PlannerDeck.tsx:289,321`), `layer-confidence` / `layer-legend`
(`MapStageLayerControl.tsx:142` — note the sibling `.layer-freshness` on the
same line **is** styled, so this reads as an inconsistent stack, not a
blank one), `map-road-lock-experimental-note` (`MapStage.tsx:1531`),
`download-mode-corridor-option-input` (`DownloadModePicker.tsx:106`),
`gps-retry-button` (`RideHud.tsx:371`).

## Follow-up

- `region-wifi-confirm` and the `DiagnosticsPanel` group were visible-enough
  to warrant a dedicated fix, similar in kind (if not severity) to TASK-1.1.
  Fixed in the same commit as this report:
  - **TASK-1.4a** — `.region-wifi-confirm`/`.region-wifi-confirm-actions` in
    `region-downloads.css`: card treatment matching the sibling
    `.region-downloads-panel` (border/radius/background via the file's
    existing token convention), real button styling for the two actions.
  - **TASK-1.4b** — `.diagnostics-panel`/`.diagnostics-list`/
    `.diagnostics-warnings`/`.diagnostics-ok` added to `profile-panel.css`:
    header layout, a dt/dd row grid, and a bordered warnings list, using the
    same `--sb-*` tokens as the rest of the Profile panel.
- The "lower severity" single-element gaps are candidates to sweep up during
  Phase 7 (screen-by-screen polish), where each screen gets a dedicated pass
  anyway.
