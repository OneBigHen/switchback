# Route Atlas generated-data contract

`data/gpx-library/` is runtime/project data and stays gitignored. The route Atlas is therefore generated on the host from that library rather than committed to Git.

## Build behavior

`npm run build` now runs `scripts/prepare-route-atlas.mjs` first.

- If `data/gpx-library/manifest.json` is absent (normal clean CI), Atlas generation is skipped.
- If the manifest exists (production/development host with the route library), the prebuild regenerates `atlas.json` and verifies it before Next.js is allowed to build.
- Atlas generation fails closed when a manifest route source is missing.
- Verification checks the source fingerprint, manifest/Atlas route IDs, duplicate folding count, and valid geographic bounding boxes required by Near Me sorting.

Manual commands remain available:

```sh
npm run atlas:build
npm run atlas:verify
npm run atlas:refresh
```

A deployment must not bypass `npm run build` and reuse an old `.next` output after route-library changes. The production build is the point where code and generated Atlas data become one release candidate.
