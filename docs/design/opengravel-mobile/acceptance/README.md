# Acceptance captures — OpenGravel mobile redesign

The four approved states, captured from the running application at the target
phone viewport (390×844, 2× device pixel ratio) on the 537-route production
catalog.

Regenerate with the app running:

```bash
npx next dev --hostname 127.0.0.1 --port 3210
node scripts/qa/capture-opengravel-mobile.mjs
```

The script writes PNGs to `artifacts/opengravel-mobile/` (untracked); these are
WebP copies kept for review beside `../reference/`.

| State | Capture |
| --- | --- |
| Planner — normal `To` planning | [`01-planner.webp`](./01-planner.webp) |
| Explore — map mode, route selected | [`02-explore-map.webp`](./02-explore-map.webp) |
| GPX Library — list mode | [`03-gpx-library-list.webp`](./03-gpx-library-list.webp) |
| Route details — geographic hero | [`04-route-details.webp`](./04-route-details.webp) |

## Measured composition

| Target | Spec | Measured |
| --- | --- | --- |
| Planner map visible in normal planning | 45–50% | **50%** (sheet top at y=424) |
| Explore map share of the workspace above the rail and bar | 65–70% | **64%** (header 166, map 293, rail 303, nav 68) |
| Route-detail hero | 35–40% | **36%** |
| GPX Library card preview-to-content split | 44–48% | **45%** |

## Known gap

The reference WebPs in `../reference/` cannot be decoded — each is ~15 KB of
data with no RIFF/WebP header, identical on origin. These captures were
therefore built against the UX spec's written transcription of those
references, not against the images. A visual side-by-side is still outstanding
and needs the reference images restored.
