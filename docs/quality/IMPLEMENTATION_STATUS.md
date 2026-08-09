# Implementation status

**State: READY TO MERGE**

The requested practical-quality work is implemented in the current checkout.
The final automated gates are green; independent standards/spec review is
complete and PR #2 is open.

## Completed

- Added and ran the critical browser matrix across Chromium and WebKit.
- Added real GraphHopper fixture coverage for normal routing, closed loops,
  private roads, `motorcycle=no`, and disconnected roads.
- Added PWA/offline shell and IndexedDB persistence checks.
- Added the owner workflow, release evidence, live smoke, failure policy,
  physical drill, PR template, and GitHub Actions quality workflow.
- Fixed GraphHopper requests against the active older graph: when `smoothness`
  is not encoded, routing retries without only that condition and returns an
  explicit warning. Surface and track/path rules remain active.
- Fixed the road-matching client to accept the API's `{ matched, matchedAt }`
  response envelope.
- Completed independent standards/spec review of the intended diff; findings
  were addressed or explicitly limited to unrelated pre-existing work.
- Fixed stale WebKit test input readiness, road-lock copy expectations, and
  sketch coordinates that landed on mobile map controls.

## Fresh evidence

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Vitest | PASS: 1,213/1,213 |
| Build | PASS |
| Existing E2E matrix | PASS: 24/24 across desktop, WebKit mobile, and both landscape profiles |
| Critical Chromium + WebKit | PASS: 30/30 |
| Real GraphHopper fixture | PASS: 5/5 |
| PWA/offline | PASS: 2/2 |
| Live providers | PASS: 9/9, including the 1-hour loop; see `LIVE_PROVIDER_RESULTS.md` |
| Live quick ideas | PASS: 3/3 routed; zero `Route unavailable` states |
| Physical iPhone | NOT PERFORMED; see `PHYSICAL_DEVICE_RESULTS.md` |

The live service is healthy after deployment. Its current graph still lacks
smoothness data, so routed responses expose the explicit degradation warning
until the graph is safely reimported and swapped.

## Remaining before handoff

- The owner must run the physical iPhone airplane-mode drill and record it in
  `PHYSICAL_DEVICE_RESULTS.md`; automation does not substitute for that proof.
- Merge PR #2 after that physical-only check is reviewed.
