# Pre-beta QA evidence — 2026-09-07

These artifacts support
[PREBETA_QA_AUDIT_2026-09-07.md](../../PREBETA_QA_AUDIT_2026-09-07.md).

The screenshots were captured during the audit of base
`eb8764c4aeacb52924ce4ca1abf1562907c2a1da` and the explicitly authorized
visual shaping pass.

## Files

- `before-p1-short-landscape-recovery.png` — original clipped/recovery layout
  evidence.
- `before-p2-short-landscape-overlap.png` — original short-landscape map-control
  overlap evidence.
- `test-contract-mobile-safari-minimize.png` — screenshot from the retired V1
  mobile minimize test contract.
- `shaped-idle-320.png` and `shaped-idle-568x320.png` — planner/deck geometry
  after shaping.
- `shaped-draw-568x320.png` — Draw lanes, attribution, and native controls after
  shaping.
- `shaped-advisor-568x320.png` — contained narrow Advisor panel.
- `shaped-ride-mobile.png` — mobile Ride surface after shaping.
- `shaped-free-ride-idle-desktop.png` and
  `shaped-free-ride-suggestion-mobile.png` — opaque Free Ride surfaces.
- `shaped-recording-hud.png` — recording HUD/control separation evidence.
- `mobile-core-webkit-error-context.md` — captured WebKit failure context.

Raw Playwright `.zip` traces and `.webm` recordings were retained in the QA
workspace but not committed because they are large browser artifacts and may
contain request/session metadata. The report records the failure locations and
the durable screenshot/error-context evidence.
