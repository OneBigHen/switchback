# Physical iPhone drill

This is the short manual qualification for Safari/PWA behavior that browser
automation cannot prove. Record the result in
[PHYSICAL_DEVICE_RESULTS.md](PHYSICAL_DEVICE_RESULTS.md); do not infer it from
Playwright.

## Preconditions

- A deployed Switchback URL reachable from the iPhone.
- iPhone Safari on the intended release iOS version.
- A clean or deliberately retained installed PWA state.
- One public route inside the configured coverage area.
- The [release evidence](RELEASE_EVIDENCE.md) and quality summary available to
  compare against.

## Drill

1. Open Switchback in Safari and wait for the planner shell and map to settle.
2. Plan a destination route. Confirm the route summary, geometry, distance,
   duration, and route controls are visible.
3. Save the route, reload once online, open Library, and load the saved route.
4. Open Free Ride, wait for a suggestion, accept it, and confirm guided Ride
   controls appear.
5. Enable Airplane Mode while the app is visible. Reload the installed PWA.
6. Confirm the shell and saved Library route remain available. Confirm the UI
   identifies offline state rather than presenting a new provider route.
7. Attempt a new route while offline. Confirm it ends in a clear offline or
   unavailable state and does not show synthetic geometry.
8. Disable Airplane Mode, restore connectivity, reload, and confirm provider
   health and a new route recover.
9. Capture one portrait screenshot and, if relevant, one landscape screenshot.

Record device model, iOS/Safari version, deployment revision, local time,
network state at each step, and any visible error copy. Do not record private
coordinates in the repository.
