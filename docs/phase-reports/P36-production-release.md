# P36 — Production release

**Status:** release package and rollback runbook prepared; automated gates green, tag/field gates open

## Result

- Added a release freeze manifest and a self-host deployment runbook with
  migration ordering, health checks, graph/manifest rollback, database
  restore, and explicit no-traffic conditions.
- The release checklist keeps app, data, provider, policy, and artifact
  versions explicit. No Git tag or public deployment is created by this local
  work.

## Open gates

- Megaplex final automated acceptance after deployment hardening: green
  (202 test files / 1,285 passed / 1 skipped; lint, typecheck, build; the
  production Compose/Caddy stack is stable, `/api/health` is non-degraded,
  all eight profiles return live routes, and Caddy validates). Final
  production-container gates are standard 32/32, critical 30/30, PWA 2/2,
  memory soak 10/10, and real-router 5/5 after the deployment-only changes as
  well.
- `npm audit --omit=dev --audit-level=high` remains an open dependency gate:
  four high advisories were reported; no forced upgrade was applied.
- Regional offline parity is an open release gate: the corrected 208-pair
  generated-tile audit (204 random plus four golden) passed legality but only
  187/208 (89.9%) distance/outcome comparisons against the full-bbox
  GraphHopper oracle; it recorded zero oracle errors and 12 comparisons above
  25%.
- Real authenticated-browser/passkey and encrypted-recovery drills.
- Five field rides, including weak/no signal and a two-hour ride, plus three
  unassisted external riders.
- Physical iPhone/native decision and production provider checks.
