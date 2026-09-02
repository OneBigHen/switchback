# Atlas deployment hardening — 2026-09-02

PR #45 made the generated route Atlas part of rider-facing discovery and Near Me behavior, but `data/gpx-library/` is intentionally gitignored. A host could therefore run new code against an old `atlas.json` unless an operator remembered a separate generation command.

This change makes Atlas refresh + verification part of `npm run build` whenever the GPX library manifest exists. Clean CI environments without the generated library skip the prebuild. Data hosts fail closed on missing route sources, stale fingerprints, route-set drift, invalid duplicate references, or malformed bounding boxes.
