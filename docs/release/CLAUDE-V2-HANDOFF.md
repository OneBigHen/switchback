# Switchback V2 — Claude release handoff

Updated: 2026-08-31

## Authoritative integration

- Branch: `ux/v2-final-integration`
- PR: #35
- Base: `main`
- Do not independently merge stacked V2 PRs #29-#34, #36, or #37.
- Fetch before acting; the branch may have advanced beyond the SHA recorded in any chat transcript.

## What is already integrated

The current branch contains the accumulated V2 UX work through the presentation-quality pass:

- compact Plan composer
- Destination / Loop / Draw planning
- inferred sketch endpoints and near-closed loop intent
- Draw Undo / Clear / Done / Cancel controls
- V2 Route Decision rail/cards
- Quick Layers with advanced map settings disclosure
- Rides as a primary destination
- in-memory normalization across saved routes, recordings, trips, imported rides, and project GPX while retaining original storage IDs/handlers
- GPX/KML/KMZ import with Open / Prefer roads / Require roads semantics
- Settings as a primary destination
- V1 -> V2 rider-settings migration
- active motorcycle, range, route defaults, units, voice, learning, theme, curated UI customization
- advanced identity/sync/recovery/offline/data/diagnostics separated from everyday rider settings
- generated route/topographic graphics
- four-destination phone navigation
- mobile Safari input zoom prevention in Rides/Settings
- consistent focus-ring treatment in the new destination surfaces

## CI: important repository quirk

Routine PR CI is intentionally consolidated to three jobs:

- `verify`: lint + typecheck + Vitest + production build
- `rider-journeys`: Chromium critical journeys + small WebKit smoke + road-lock regression
- `pwa-smoke`: production PWA/offline behavior

`main` branch protection still requires the historical contexts:

- typecheck
- lint
- vitest
- build
- critical-e2e
- pwa
- road-lock
- real-router
- visual

Until repository branch protection is updated, `quality.yml` emits lightweight compatibility aliases for those names. Do not remove the aliases first or PR #35 can become impossible to merge even when the consolidated gates are green.

Long-term cleanup: update branch protection to require `verify`, `rider-journeys`, and `pwa-smoke`, then delete the compatibility aliases.

## Deep QA

`.github/workflows/deep-qa.yml` is manual-only and was repaired after the previous file was found corrupted.

It contains deliberate release-level jobs for:

- full critical WebKit
- visual regression without automatic snapshot updates
- pinned GraphHopper real-router browser verification

Run Deep QA once on the final candidate before merge/deploy. Do not move these expensive jobs back into routine PR CI merely to make the matrix larger.

## UX priorities for the final pass

The current design authority remains `design/DESIGN-CONTRACT.md` then `DESIGN.md`.

Keep the app:

- map-first
- motorcycle-specific
- compact
- rugged/premium rather than generic SaaS
- calm, high-information and progressively disclosed
- >=44 px for primary touch controls
- genuinely desktop-capable rather than stretched phone UI

Highest-value visual review surfaces before release:

1. Plan idle / options / route-choice transitions
2. Rides rows, management expansion, import and empty states
3. Settings active-bike hero, edit controls, advanced handoff and small-phone behavior
4. Ride Focus / off-route recovery / Recenter geometry
5. Free Ride HUD and escape/recording behavior
6. Quick Layers vs Advanced map settings
7. 320px, 390x844, phone landscape, tablet portrait/landscape, 1440x900

Look for:

- horizontal overflow
- <44px controls
- clipped safe areas
- giant/stacked cards
- duplicated actions
- weak selected states
- tiny body/input text
- map obscured by chrome
- multiple active aria-modal dialogs
- desktop layouts that are only enlarged phone layouts
- V1 CSS overriding V2 components

## Answers to likely release questions

### Which branch should I continue on?

`ux/v2-final-integration` only.

### Should I merge the stacked phase PRs?

No. They are history/scaffolding. PR #35 is authoritative.

### Should I rebuild Rides or Settings again?

No. Improve/fix the current integrated implementations. Preserve existing storage/handler authorities.

### Can I create a second store to simplify the new UI?

No unless a real missing domain requirement proves one is necessary. Presentation adapters should resolve back to existing IDs and handlers.

### Should I restore the old giant CI matrix?

No. Keep routine CI behavior-focused. Use Deep QA for full WebKit, visual, and real-router release checks.

### Should I blindly update visual snapshots?

No. Inspect changed screens and only rebaseline deliberate accepted V2 output.

### Can Mapbox premium become the default automatically?

Not solely because this branch merges. Earlier architecture explicitly retained the rollout gate pending real-device/iPhone validation. Preserve that gate unless the current release work supplies that evidence and intentionally changes the rollout decision.

### What counts as a real blocker?

A reproduced rider-facing regression, data/storage compatibility issue, routing/import failure, accessibility/reachability defect, failing meaningful final gate, deployment mismatch, or production smoke failure.

Old selector assumptions and superseded V1 presentation are not reasons to restore V1 UI.

### What should happen before merge?

- fetch current main and integration branch
- ensure clean working tree
- normal Quality green on exact final SHA
- Deep QA executed and reviewed
- final responsive/adversarial UX pass
- fix real Critical/High and reasonable Medium findings
- make PR #35 ready
- merge PR #35 only

### What should happen after merge?

- record resulting `main` SHA
- inspect existing production service authority
- record previous production SHA
- deploy exact tested `main` SHA
- smoke-test `https://ride.henning.rodeo`
- verify phone and desktop plus PWA/cache behavior
- rollback if materially broken
- after production is healthy, close superseded stacked V2 PRs and remove branches only when fully contained in main

## Do not regress these contracts

- newest route request wins / stale results cannot overwrite current intent
- reroute cancellation semantics
- Draw does not invent final road geometry; router remains authoritative
- Prefer / Require road-lock meanings remain `prefer` / `must`
- existing settings migration preserves bikes/preferences field-by-field
- encrypted sync snapshots current RiderSettings before upload
- Rides actions dispatch using original source identity
- recording finalization and recorded geometry remain intact
- Free Ride does not become a fake destination-route recording
- off-route recovery preserves remain-on-current-route behavior

## Final report expected

When release work is complete, report exact evidence:

- final PR #35 head SHA
- normal Quality run
- Deep QA results
- final `main` SHA / merge SHA
- previous production SHA
- deployed production SHA
- public smoke results
- any intentionally deferred issue and why
