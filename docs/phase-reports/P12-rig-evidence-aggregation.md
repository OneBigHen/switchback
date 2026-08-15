# P12 — RIG evidence aggregation

**Phase:** P12 — route roles, bounded contributor evidence, and
confidence/desirability separation
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P12 worktree changes.
**Release gate:** G3

## Before behavior

- `route-data-quality` exposed route-level tag coverage for the UI, but no
  canonical-segment evidence event or aggregate existed.
- Duplicate-family independence, freshness, source priors, route-role weights,
  contributor caps, and preference posterior were not represented.
- Desirability, hard authority, soft current reports, and rider preference
  feedback had no separate aggregate channels.

## After behavior

- `src/lib/roads/rig-evidence.ts` owns geometry-free evidence observations keyed
  only by a SHA-256 canonical segment UID. Provider edge IDs and route geometry
  cannot enter the evidence boundary.
- Source priors, map-match confidence, covered fraction, freshness,
  duplicate-family independence, and calibrated route-role weight produce a
  bounded evidence contribution. Per-contributor/channel contribution is
  capped, and batches above the configured maximum are rejected.
- Route-role inference implements the RIG weighted signals and returns
  `highlight`, `supporting`, `connector`, or explicit `unknown` for middle or
  low-confidence evidence.
- Aggregates retain separate normalized desirability dimensions,
  `evidenceConfidence`, `evidenceStrength`, `accessConfidence`, hard-authority
  weight, soft-current-report weight, surface confidence, and a weak-prior
  preference posterior. Absence does not add negative preference evidence.
- Switchback-generated observations have zero source prior and cannot
  reinforce the RIG.

## Files changed

- `src/lib/roads/rig-evidence.ts` — route-role inference, runtime observation
  validation, weighted bounded aggregation, freshness, duplicate independence,
  contributor caps, confidence, and preference posterior.
- `tests/unit/rig-evidence.test.ts` — role thresholds, trust boundary,
  duplicate/source weighting, separation, caps, generated-route exclusion, and
  absence semantics.
- `docs/recovery/WORKLOG.md`.

## Migrations

None. P12 adds a geometry-free aggregation seam and does not alter persisted
route/library/offline payloads. P13 can consume its segment aggregate without
copying route geometry or changing existing user data.

## Verification

| Command/evidence | Result |
|---|---|
| Focused P12 Vitest suite | 1 file, 5 tests passed locally |
| Megaplex `npm run verify` | lint/typecheck/build passed; 176 test files, 1,195 passed, 1 skipped |
| Megaplex broad Playwright | 24/24 |
| Megaplex critical Chromium/WebKit | 30/30 |
| Megaplex PWA | 2/2 |
| Megaplex real-router fixture | 5/5, including private, motorcycle-closed, and disconnected refusals |
| Megaplex memory soak | 1/1 test; 10/10 planner cycles |
| Local/remote scoped SHA parity | equal for `rig-evidence.ts` and its focused test |
| Router cleanup | PID file absent and port 8998 closed |

## Memory/performance evidence

The aggregation input is bounded by a default maximum of 512 observations per
batch and rejects oversized input. The browser memory soak remained green at
10/10 cycles. No new long-lived worker, listener, cache, or route geometry
store was introduced.

## Routing quality evidence

The real GraphHopper fixture remained green at 5/5, but P12 does not change
routing topology or provider behavior. No live owner-corpus map-match or field
ride evidence is claimed.

## Known limitations

- P12 is the aggregation seam; it does not yet build corridor clusters, attach
  aggregates to offline RIG tiles, or enforce route eligibility. P13/P14 own
  those boundaries.
- Source priors, role weights, half-lives, `kappa`, and diversity constants are
  explicit engineering tunables, not golden-corpus-calibrated probabilities.
- Hard-authority evidence is represented separately but does not itself decide
  legality; the eligibility engine must apply current access precedence.
- Independent contributor identity is an input claim. Duplicate-family
  saturation is enforced within each contributor group; copied artifacts across
  identities need later provenance reconciliation.
- Automated checks do not prove authenticated-browser behavior,
  physical-device behavior, production concurrency, or field/model quality.

## Deferred

- P13 — contiguous high-value corridor clustering and spatial index/tile build.
- P14 — legality, closure, bike compatibility, surface, and coverage gates.
- P27/P29 — live map-match intelligence, canonical graph assignment, and
  offline RIG integration.

## Rollback

Remove `rig-evidence.ts`, its focused tests, and the P12 worklog/report section;
no persisted data migration or user-data deletion is required.

## Next dependency

P13 — RIG corridor clustering.
