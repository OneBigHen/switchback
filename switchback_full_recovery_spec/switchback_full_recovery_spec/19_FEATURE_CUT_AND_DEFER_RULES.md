# Feature Cut and Defer Rules

## Remove when

- not part of a core journey;
- incomplete backend;
- UI implies nonexistent evidence;
- duplicates another feature;
- creates second settings truth;
- disproportionate complexity;
- blocks modularization;
- cannot be device-qualified;
- creates safety/legal ambiguity.

## Feature-flag when

Domain behavior is real but under-tested, provider data is optional, or experimentation is useful without blocking core routing.

## Defer when

It requires accounts/cloud, multi-user infrastructure, unavailable national datasets, large-scale ranking data, or distracts from route correctness.

## Likely cuts

- Separate Neural top-level profile.
- Separate Avoid Highways profile.
- Generic scenic gallery.
- No-op suite controls.
- No-op highlight controls.
- Duplicate profile/bike fields.
- Unsupported exact/safe labels.
- Unmatched image-road workflow.

Record each cut in `FEATURE_DISPOSITION.md` with current implementation, reason, impact, removal/migration, and replacement.
