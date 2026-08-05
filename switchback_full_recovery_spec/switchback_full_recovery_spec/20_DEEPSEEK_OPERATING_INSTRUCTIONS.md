# DeepSeek Operating Instructions

## Before coding

Read all specs, inspect live repo, do not trust stale docs, search placeholders/TODOs/hardcoded confidence/permissive fallbacks/duplicate state/disabled lint, identify generated files, and preserve user data.

## During coding

- Prefer pure domain functions.
- Explicit state transitions.
- Add failing regression before fix.
- Use real router fixture for routing semantics.
- Keep providers behind adapters.
- Avoid giant mixed commits.
- Share controllers between mobile/desktop.
- Replace optimistic defaults with unavailable states.
- Document deviations.

## Per issue

1. Reproduce.
2. Add regression.
3. Fix.
4. Run focused tests.
5. Run lint/typecheck.
6. Run affected E2E.
7. Record evidence.
8. Commit.

## Prohibited shortcuts

- Removing/weaking tests.
- Unapproved skips.
- Leaving placeholders in normal UI.
- Straight-line fake routes.
- Invented legal/traffic/safety/scenic/confidence data.
- Silent correctness-changing catches.
- Arbitrary timeouts hiding races.
- Unversioned persistence.
- Duplicate settings ownership.
- Viewport emulation as sole mobile qualification.

## Final handoff

Phase summary, commits, architecture changes, removed/deferred features, migrations, commands/results, device results, known limitations, release/rollback.
