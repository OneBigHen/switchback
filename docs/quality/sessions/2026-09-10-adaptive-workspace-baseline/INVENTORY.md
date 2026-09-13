# Adaptive Workspace Baseline — Defect Inventory

Captured on current qualified `main` (`c649214e4729c76649b38300422d1c8a4758ba4c`) **before** any adaptive
Compact/Medium/Wide topology work, per issue #115 Task 1.

- Harness: `tests/e2e/adaptive-workspace-baseline.spec.ts`
- Matrix: 9 viewports × Search/Choose/Edit/Prepare = **36 captures, 0 gaps**
- Raw data: `baseline-manifest.json` (per-capture box geometry, overflow, collisions)
- Screenshots: `<viewport>-<state>.png`
- Runner: dedicated Playwright runner (LXC 125). Browser gates must not run on the shared dev container.

`mapFree%` = share of the viewport where the map stage is not covered by the planner deck.
`deckOverMap%` = share of the map stage's own area covered by the planner deck.

## Measured layout truth

| Viewport | search mapFree% | choose | edit | prepare | deck over map (choose/edit/prepare) |
|---|---|---|---|---|---|
| 390x844 phone | 73.4 | 52.1 | **15.6** | 52.1 | 47.9 / **84.4** / 47.9 |
| 667x375 short landscape | 59.8 | 59.8 | 59.8 | 59.8 | 40.2 (all states identical) |
| 700x900 narrow split | 74.6 | 51.1 | **14.0** | 51.1 | 48.9 / **86.0** / 48.9 |
| 768x1024 iPad portrait | 91.3 | 47.4 | 47.4 | 47.4 | 52.6 (all states identical) |
| 820x1180 iPad Air portrait | 92.9 | 50.5 | 50.5 | 50.5 | 49.5 (all states identical) |
| 1024x768 iPad landscape | 89.0 | 61.1 | 61.1 | 61.1 | 38.9 (all states identical) |
| 1180x820 iPad Air landscape | 91.0 | 66.1 | 66.1 | 66.1 | 33.9 (all states identical) |
| 1366x1024 constrained wide | 93.8 | 70.5 | 70.5 | 70.5 | 29.5 (all states identical) |
| 1440x900 desktop | 93.3 | 72.1 | 72.1 | 72.1 | 27.9 (all states identical) |

Zero horizontal document overflow at every capture. Zero measured collisions between attribution,
navigation controls, layer control and notices.

## Findings, sorted by rider impact

1. **Tablet portrait has no deliberate workspace — it is one layout for three different jobs.**
   At both `768x1024` and `820x1180`, Choose, Edit and Prepare produce *byte-identical* geometry
   (47.4 / 47.4 / 47.4 and 50.5 / 50.5 / 50.5). The rider gets the same ~50% map occlusion whether they
   are comparing routes, editing waypoints, or preparing to ride. This is the structural problem #115
   describes, now quantified. **Rider impact: high.**

2. **The map loses its controls during Edit on every compact-width viewport.**
   At `390x844`, `667x375` and `700x900`, Edit hides `navControls` **and** `layerControl` entirely
   (both resolve to no measurable box) while the deck covers up to 86% of the map. The rider cannot
   pan/zoom or change layers while editing — the exact moment map context matters most.
   **Rider impact: high.** (New finding; not stated in #115.)

3. **Phone Edit is effectively a full-screen planner.**
   `390x844` Edit leaves the map **15.6%** unobstructed; `700x900` leaves **14.0%**. #115 requires that
   routine tablet work "must not cover nearly the entire map" — on phone this is arguably intended
   (compact sheet), but `700x900` is a split-window/tablet case and clearly is not.
   **Rider impact: medium-high.**

4. **Short landscape (667x375) does not discriminate by state at all.**
   Search/Choose/Edit/Prepare all measure 59.8 / 40.2 identically. The #112 work made short-landscape
   evidence valid, but the layout still cannot express the rider's task. **Rider impact: medium.**

5. **Wide is a fixed desktop card, not a workspace.**
   At `1366x1024` and `1440x900` the planner consistently occupies 27.9–29.5% of the map with no
   per-state variation, matching #115's "floating fixed card" description. This is the least broken
   mode, but it has no bounded/resizable behaviour and no contextual inspector.
   **Rider impact: low-medium.**

6. **Search state is healthy everywhere** (73–94% map-free). Whatever changes in the adaptive
   workspace, do not regress Search.

## Open measurement questions (must be resolved before acting)

- **`attribution` measured null in all 36 captures.** Either the app does not render MapLibre's default
  attribution control, or the selector used
  (`.maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib`) is wrong for this map integration.
  **Do not treat this as a product defect yet** — it must be verified against the live DOM first. It is
  recorded as a measurement gap, not a finding.
- `.planner-peek-action.is-primary` was dropped from the capture after resolving null in run 1; the
  primary action is not consistently a peek action. Mapping the *actual* primary action element per state
  is required before asserting "exactly one dominant primary action" (#115 / Task 4).

## Method note

Run 1 of this harness (single mega-test) consumed its 15-minute file timeout on the first viewport, so the
harness was restructured to **one test per (viewport, state)** with per-capture manifest writes. That
isolates failures and guarantees partial runs still yield durable evidence. Run 1's partial data was lost
to an `rsync --delete` in the runner script, which has since been removed; the numbers from run 1 were
consistent with run 2.
