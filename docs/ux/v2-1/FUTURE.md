# Switchback UX — current audit and future backlog

Updated 2026-09-02 after UX V2.1 merged and the Atlas follow-up landed.

This is a **living option backlog**, not permission to reopen architecture decisions. It replaces the temporary `/tmp/.../FUTURE.md` produced during the interrupted agent session and removes items that are already solved on current `main`.

## Current baseline

- UX V2.1 PR #41: merged.
- Atlas / route-library PR #45: merged.
- Housekeeping PR #46: merged.
- Follow-up rider glanceability PR #47: open; requires rendered short-landscape proof before merge.
- Mobile core regression-gate PR #48: open; restores deterministic mobile behavior checks on PRs while keeping the larger screenshot matrix advisory/nightly.

## Audit corrections

Do **not** blindly re-run the old W1–W4 implementation waves. Current code already contains several items that the interrupted FUTURE list still described as missing:

- Rides empty states already provide direct actions (import first ride / clear filters).
- Rides already has pagination, near-me sorting, and location refresh.
- Record map content is already centered and recording motion already respects reduced-motion.
- Atlas browse/detail and planner deep-link work are already on `main`.
- The remaining work should be verified against current code before implementation.

## P1 — finish before calling the current polish cycle complete

### 1. Ride short-landscape glanceability

**Rider decision:** understand route/GPS state and reach pause/exit without topbar wrap at 844×390.

Status: PR #47 open.

Acceptance:
- route identity remains readable/truncated rather than wrapped;
- GPS state is readable at a glance;
- pause/voice/exit remain primary controls;
- record/overnight remain reachable without crowding the primary rail;
- variable-height recovery content cannot push critical controls outside the visual viewport;
- reduced-motion removes non-essential pulse/spinner animation;
- verify Chromium + WebKit at 844×390, not static CSS only.

### 2. Restore deterministic mobile regression gating

**Product decision:** prevent broken mobile behavior from reaching `main` without turning all screenshot inventory into a merge blocker.

Status: PR #48 open.

Acceptance:
- current V2 selectors/accessibility roles only;
- core planner/ride/library/settings behavior runs on pull requests;
- screenshot/layout inventory stays nightly/manual unless deliberately promoted;
- failures upload evidence;
- no stale `.planner-error` selector.

### 3. Production Atlas-data contract

**Rider decision:** Near Me sorting and route geometry must reflect the deployed GPX library.

Current risk: `data/gpx-library/` is intentionally gitignored while `atlas:build` produces derived metadata from host-local route data. A normal repository build cannot guarantee that the host Atlas was regenerated.

Do next:
- document the production deploy sequence as an executable/checkable contract;
- add an `atlas:verify` command that validates `atlas.json` exists, has the expected schema, and that every browseable entry used by Near Me has a usable center/bbox when source geometry exists;
- make the production deploy fail closed on a stale/missing Atlas rather than silently falling back to non-near sorting;
- do **not** put host-local GPX content into git simply to make CI green.

Risk: medium because deployment/runtime ownership is outside normal GitHub Actions.

## P2 — low-risk, high-value UX polish

### Planner / Prepare

1. Raise Trip Shape labels (Destination / Loop / Draw) from the remaining micro-caption tier to a consistent 12px minimum, then visually verify 320px and 390px widths.
2. Give selected-route / Prepare a clear “back to map” or collapse-to-map affordance that preserves the selected route.
3. Verify single-route Prepare does not clip its primary CTA or route identity at 320×568 and 390×844.
4. Keep route identity visible when the sheet is minimized and when returning from map interaction.
5. Review the action dock at long translated/content-stress lengths; primary ride action must not be displaced.

### Ride / Record

6. Raise remaining telemetry micro-labels to a legible caption tier without reducing usable map area.
7. Re-evaluate Record tall-screen composition from rendered evidence. The current map content is centered; only change height if there is still demonstrable dead space.
8. Verify off-route recovery with long road names and every recovery option expanded at 844×390.
9. Verify visible keyboard focus for every Ride/Record control and high-contrast mode where supported.

### Rides / Discover / Atlas

10. Rides filter chip row: add an end-fade/scroll affordance if 320px evidence shows hidden horizontal content.
11. Discover: audit whether cards can reuse real route geometry thumbnails instead of decorative seeded graphics. Only implement when the API already exposes sufficient geometry/fingerprint data.
12. Discover: verify result windowing/loading beyond the initial request size before adding another pagination implementation; reuse the Rides/Atlas pattern if the API supports it.
13. Resolve Discover vs Atlas naming: the user should understand whether each is community content, personal/project GPX, or both. Prefer copy/link changes before another destination.
14. Standardize visually-hidden utility usage (`sr-only` vs feature-local variants) through the design system when touched.
15. Atlas true-empty state: add a direct next action only after deciding whether unauthenticated users should import, publish, or go to Rides.

### Settings

16. Rendered pass at 320×568, 390×844, and desktop for Active Bike, identity/sync, diagnostics and advanced settings handoff.
17. Make advanced/diagnostic rows clearly secondary to ride-critical settings; avoid another dashboard of equal-weight cards.
18. Confirm destructive/account actions are separated from ordinary preferences and have explicit confirmation where needed.

## P2 — quality and maintainability

19. Caption token audit: replace scattered 8–10px user-facing labels with semantic caption tokens instead of a global search/replace. Ride-critical text gets priority.
20. Phosphor icon deprecations: migrate bare deprecated exports to `*Icon` forms only in a mechanical PR with typecheck/lint proof. Avoid mixing this with visual work.
21. `.gitattributes`: verify that `merge=ours` for `next-env.d.ts` is actually backed by repository/developer Git configuration. If not, replace it with a deterministic normalization/check rather than relying on a non-portable merge driver name.
22. Remove feature-local dead CSS/selectors only when code search + behavior tests prove they have no live owner.
23. Keep `qa:pr` and required Quality jobs exact-head. Any post-proof commit invalidates the previous release evidence.

## P3 — product opportunities

### Better route decisions

24. Lead comparison cards with “why this ride” (curve density, surface, traffic/friction, elevation/climb, scenic signal) rather than just distance/time.
25. Add explicit trade-off language: “12 min slower, much twistier”, “mostly pavement, 8 mi unpaved”, “fewer towns / fuel stops”.
26. Bring curve/elevation summaries into the selected-route Prepare surface before adding more charts.
27. Add confidence/source age for route intelligence where data is inferred or externally sourced.

### Free Ride

28. Make freehand drawing behave like drawing: start point = first stroke point, finish = last stroke point; do not require a separately entered destination.
29. Editable avoid areas: select, move/reshape where feasible, and delete after creation.
30. Preserve a doodle-like workflow while snapping the resulting ride to roads only when the rider asks for road-following output.
31. Add obvious undo/redo for drawing and avoid-area edits.
32. Give the rider a clear distinction between “sketch”, “must-use road”, and “avoid area” rather than overloading one gesture.

### Map / navigation parity

33. Improve map hierarchy before adding more overlays: route line, active maneuver, road labels, traffic/closures, POIs, then decorative terrain.
34. Add lane/turn guidance only when source data is reliable enough to avoid false confidence.
35. Surface fuel/range-aware stops for ADV/dual-sport rides as an optional rider constraint.
36. Better offline-state visibility: exactly what route/maps/guidance remain available when signal disappears.
37. Consider downloadable region packs around a route corridor before broad “download the state” flows.

### Community

38. Shared GPX/route publishing should preserve source/provenance, revision, surface notes, bike fit and moderation state.
39. Comments/notes should be attached to route/version or road segment deliberately; avoid an unstructured social feed.
40. Add “ridden recently” / recency signals only when backed by actual activity rather than synthetic freshness.

## Architecture boundaries — do not reopen casually

- Keep one persistent map authority.
- Do not turn Free Ride into another planner mode.
- Do not turn Record into another persistent destination.
- Do not create a second ride library/store for presentation convenience.
- Preserve current routing/provider policy unless a routing-specific change is explicitly scoped.
- Preserve source IDs and existing sync/community/storage semantics.
- Do not make Mapbox premium-provider rollout decisions as part of UX polish.

## Suggested sequence

1. Merge only verified #47 and #48.
2. Make Atlas deploy state explicit and fail-closed.
3. Planner/Prepare 320–390px rendered pass + Trip Shape legibility.
4. Settings 320px/dark/accessibility pass.
5. Discover ↔ Atlas coherence and geometry-thumbnail feasibility.
6. Free Ride drawing/avoid-area interaction project as a separate, testable feature slice.
7. Route-decision intelligence enhancements after the core surfaces are stable.

## Definition of done for any future UX PR

A UX change is not complete because it compiles or because a screenshot “looks better.” For the touched surface require:

- lint + typecheck + focused unit/component tests;
- deterministic behavior E2E for the changed interaction;
- rendered evidence at the relevant phone portrait and 844×390 landscape sizes;
- dark mode where the surface supports it;
- no new horizontal/vertical viewport overflow;
- visible focus + reduced-motion behavior;
- no architecture/store/provider authority duplicated for presentation convenience;
- exact-head CI evidence before merge.
