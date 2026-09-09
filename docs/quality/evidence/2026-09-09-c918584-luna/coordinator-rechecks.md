# Coordinator rechecks

These checks were black-box interactions against the already attested public
candidate. They did not inspect or modify production data.

## Save route recheck

The Mission 7 worker's apparent save failure was not reproducible using the
visible control. At desktop 1366x768, the coordinator opened the route details
workspace and activated the actual visible `Save route` button. The app showed
`Route saved on this device.`; the local IndexedDB library contained one saved
route and the Rides surface showed `Planned 1`. The worker interaction had
activated a hidden/stale accessibility target while the visible button was
below the viewport. This is classified as a test/automation problem, not a
confirmed product defect.

## Recording permission-denial recheck

At mobile Chromium emulation 390x844, the coordinator opened Record and
activated the visible `Start recording` control. With browser geolocation
denied, the app transitioned to a map-only surface: no recording HUD, pause,
finish, or recovery controls were present in the DOM. Reloading restored the
recording HUD, matching the Mission 8 report. This is a confirmed product
defect; the environment explains the denied permission, but not the loss of
the controls after the denial.
