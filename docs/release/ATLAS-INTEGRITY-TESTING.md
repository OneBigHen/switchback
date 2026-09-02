# Atlas integrity test coverage

The repository tests two layers:

- pure integrity/fingerprint tests exercise stale data, route drift, duplicate folding and bounding-box validation;
- a package-script contract test prevents production builds from silently dropping the Atlas prebuild hook.

The clean GitHub runner does not contain `data/gpx-library/`, so the production-data generation path is intentionally verified structurally in CI and executed against real data on the deployment host during `npm run build`.
