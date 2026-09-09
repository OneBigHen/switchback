# Luna Mission 5 — Recovery / PWA behavior

## Run metadata

- Target: `https://ride.henning.rodeo`
- Candidate SHA: `c91858479c176119ba633580cfc0902c6863ba8c`
- Fresh isolated browser session: `luna-m5-c918584-r2`
- Primary viewport: desktop `1366x768`
- Date: `2026-09-09`
- Mission status: **completed to the highest-value recovery slice; browser closed**

## Deployment gate correction

The initial run in session `luna-m5-c918584` stopped because hydration removed
`data-dpl-id` from the live DOM. Root independently verified the raw public
HTML contained the exact candidate marker and that public Next asset URLs
carried `?dpl=c91858479c176119ba633580cfc0902c6863ba8c`. That raw-response /
asset proof is accepted for this run; the initial empty live-DOM result was a
hydration observation, not a deployment mismatch.

Our fresh session also observed the exact SHA on loaded script URLs, including:

```text
/_next/static/chunks/3s6nzrbk-8mnv.js?dpl=c91858479c176119ba633580cfc0902c6863ba8c
/_next/static/chunks/19mx3mg6lkumu.js?dpl=c91858479c176119ba633580cfc0902c6863ba8c
```

See [identity-check.json](identity-check.json) and the initial captures
`00-initial-desktop.png` (the false-stop run) and `01-r2-initial-desktop.png`
(the accepted run).

## Recovery journey exercised

### 1. Normal plan

1. At `1366x768`, entered: `Plan a scenic 2 hour loop near Morgantown WV
   with twisty roads and a coffee stop`.
2. Selected **Find ride options**.
3. The app reached **Your ride → 90-minute backroads** with `90 min · No
   highways · Mixed surfaces` and a ready status.
4. Network evidence showed successful advisor, ride-intent, geocoding,
   curvature, and unpaved-road requests (HTTP 200).

Evidence: `02-normal-before-input.png`, `03-normal-input-entered.png`,
`04-normal-requested.png`, `05-normal-result.png`, and
`videos/normal-ride-flow.webm`.

### 2. Refresh / route recovery

1. Refreshed while the ride was selected.
2. The **Your ride → 90-minute backroads** card persisted after refresh.
3. The `Ride request` field was empty after refresh, so the original rider
   intent text was not restored. Selecting the ride card restored its controls
   and showed **Ride restored**.
4. The page also showed a map-coverage alert: **Map region ends here**.

Classification: **confusing UX, medium** (not data loss of the route itself).
The route is recoverable, but the rider cannot see the request that produced it
after interruption. A direct workaround is to select the restored ride card;
the improvement would be to restore or summarize the original request.

Evidence: `06-before-refresh-planned.png`, `07-after-refresh.png`,
`08-after-refresh-open-ride.png`.

### 3. Offline / restore

1. Enabled browser offline mode while the restored ride was visible.
2. The app immediately showed **You're offline. Provider status will update
   when you're back online.** The existing route remained visible.
3. Reloaded while offline. The app booted from the saved state and showed
   **Ride restored**, while also showing **Route unavailable** and
   **Provider status could not be checked. Planning may still work.**
4. Restored network, reloaded, and confirmed the ride remained ready with
   **Ride restored**.

Classification: **confusing UX, medium**. Offline recovery works and preserves
the route, but the simultaneous **Route unavailable** alert and **Ride
restored** state are contradictory to a rider. This was not treated as data
loss or a crash. The map-coverage alert remained after network restoration.

Evidence: `09-offline-before.png`, `10-offline-active.png`,
`11-offline-reload.png`, `12-online-restored.png`.

### 4. Invalid/impossible input attempt

Entered `Plan a route from Atlantis to the Moon with zero roads`; the input was
accepted as text and the submit arrow remained visible. Evidence is
`13-invalid-input-entered.png` and `videos/invalid-input-retry.webm`.

The host became resource constrained (only about 66 MiB free RAM and swap
full) before a reliable submit/result observation. Therefore there is **no
product verdict** for invalid-input validation; classify this attempt as an
**environment problem / unassessed**, not a defect.

## Not proven in this constrained run

- Cancel/retry was not submitted as a separate journey. The loading state did
  expose **Cancel ride change** in `04-normal-requested.png`.
- Back/forward navigation was not exercised after route recovery.
- Mobile emulation and installed/PWA browser chrome were not run. No in-app
  install affordance was visible in the captured desktop UI; headless browser
  chrome cannot prove installability.

No source, tests, repository docs, GitHub, runtime, or code were inspected or
modified. Both browser sessions owned by this worker were closed.
