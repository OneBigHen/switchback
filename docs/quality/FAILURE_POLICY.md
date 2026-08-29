# Failure policy

- Critical browser tests have one retry in CI and no infinite retries.
- The first failure's screenshot, trace, video, browser result JSON, and
  relevant app/router logs are retained for seven days.
- A flaky required test remains a defect; assertions are not weakened solely
  to make CI green.
- Provider failures must end loading and show typed, actionable user copy.
- Missing provider geometry is an error, never a synthetic line.
- `NOT CONFIGURED` is valid for an intentionally absent optional provider and
  is recorded rather than treated as a pass.
- Every confirmed defect gets a permanent regression at the earliest useful
  layer: unit, API, browser, or real-router fixture.
- Physical device results are recorded only after the device drill actually
  runs.
- Level A mobile QA is a Linux emulation gate. WebKit/iPhone is the primary
  signal and Chromium is a comparison; neither is iOS Safari or installed-PWA
  proof. See [LEVEL_A_MOBILE_QA.md](LEVEL_A_MOBILE_QA.md) for projects,
  scenario IDs, state matrix, and commands. The fast gate covers critical
  workflows, failure states, and the honest offline boundary; the separate
  Prepare gate covers seven WebKit-primary planner states, and the expanded
  gate covers the selective release viewport matrix.
- Level A retains final screenshots plus failure screenshots, traces, videos,
  and HTML/Markdown reports under `artifacts/mobile-qa/`. The GitHub mobile
  workflow uploads that directory for 14 days. Keep and inspect the relevant
  captures after significant UI changes; do not overwrite failed evidence
  with a later pass. Trace and video retention is failure-only.
- `PASS` means the named boundary ran and its assertions and evidence were
  reviewed; `FAIL` means a required assertion or evidence review failed;
  `NOT RUN` means it was not exercised and is never a pass. The four release
  confidence lines remain separate: mobile responsive emulation, WebKit mobile
  approximation, real iOS Safari, and installed iOS PWA behavior.
- Level B real iOS Safari/BrowserStack uses the same `core-state`,
  `layout-containment`, and `visual-state` IDs. Missing credentials or device
  access is recorded as `NOT RUN`; secrets and SDKs are not added to this
  repository. A macOS/Xcode simulator is optional targeted Level C work, never
  the normal loop.
