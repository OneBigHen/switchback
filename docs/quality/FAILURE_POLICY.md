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
