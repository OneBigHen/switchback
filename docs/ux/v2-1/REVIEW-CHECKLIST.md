# Cheap-Agent UX Review Checklist

Run this after each wave and before exact-head proof.

## Architecture
- No second state/store/storage authority.
- One persistent map still owns the workspace.
- Free Ride did not become `PlanMode`.
- Record did not become a fifth primary destination.
- Rides normalization/source IDs still dispatch correctly.
- PlannerShell did not absorb presentation-local state unnecessarily.
- No new renderer/routing/provider architecture.

## Visual hierarchy
- Primary task obvious within ~2 seconds.
- One dominant CTA maximum per task region.
- Useful content starts early.
- No unexplained large blank region.
- No giant phone hero.
- No nested-card explosion.
- Ember reserved for route/action/selection.
- Warnings use warning semantics rather than brand color.
- Light and dark both intentional.

## Data truth
- No fabricated elevation/difficulty.
- No ADV/Gravel/Twisty/Scenic inferred from prose.
- Missing metric omitted, not shown as zero.
- No fake nearby/location claim.
- Route character derives from existing data/helper.

## Responsive/a11y
- 320×700 usable.
- 390×844 polished.
- 430×932 not merely enlarged.
- 844×390 all nav/actions reachable.
- tablet/desktop compositions intentional.
- targets >=44px.
- phone inputs >=16px.
- focus visible/order sane.
- modal focus/Escape retained.
- selection not color-only.
- reduced motion works.

## Ride safety
- GPS uncertainty not hidden.
- track-only not presented as turn-by-turn.
- off-route stronger than normal guidance.
- recovery actions reachable.
- recording state/finalization clear.
- Free Ride Experimental remains visible.
- recommendation score does not dominate riding state.

## Performance
- no new map instance/card map renderer.
- no unnecessary heavy UI/animation dependency.
- no runtime webfont fetch.
- no giant backdrop blur over map.
- no visible sheet/list/Ride-HUD jank.
- map does not remount for destination/chrome changes.

## Visual QA integrity
- expected/actual/diff inspected.
- bundled fonts confirmed.
- snapshot threshold not loosened.
- no broad masking.
- only intended baselines changed.
- changed baselines explained.

Any P0/P1 failure blocks moving to release proof.