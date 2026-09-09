# Candidate deployment attestation

This attestation is for one immutable candidate only.

| Field | Value |
|---|---|
| Git SHA | `c91858479c176119ba633580cfc0902c6863ba8c` |
| Public URL | https://ride.henning.rodeo |
| Build identifier | `build-TfctsWXpff2fKS` |
| Deployment path | host `switchback-cloudflare.service`, Next production server on `0.0.0.0:3100`, Cloudflare public hostname |
| Build start | 2026-09-09 16:01:28Z |
| Service start | 2026-09-09 16:03:33Z (12:03:33 EDT) |
| First public proof | 2026-09-09 16:04:11Z |
| Final public recheck | 2026-09-09 18:46:26Z |
| Next deployment marker | `data-dpl-id="c91858479c176119ba633580cfc0902c6863ba8c"` in raw HTML |
| Sampled asset proof | Next asset URL carried `?dpl=c91858479c176119ba633580cfc0902c6863ba8c`; sampled asset returned HTTP 200 |
| Build-server file hash | `.next/required-server-files.json` SHA-256 `14e6e815721bac744d8fa4640eb9b3a6fbe65c8324855cb25809b08b0b4886cd` |

## Runtime configuration relevant to rider behavior

- GraphHopper: `http://127.0.0.1:8989`, version 11.0, profiles `fastest`,
  `twisty`, `scenic`, and `adventure`; import 2026-08-12; elevation disabled.
- Valhalla route/elevation: `http://127.0.0.1:8002`, version
  `3.8.2-6482ba0b9`.
- Route policy: `pa-nj-route-policy-v1`, with the deployment-time config hash
  recorded as the secret-free prefix `c4e74570...`.
- Curvature/GPX data: `data/segments.db` and `data/gpx-library`.
- Map style: `https://tiles.openfreemap.org/styles/positron`.
- Premium Mapbox is disabled because the public premium capability flag is not
  configured; the deployed browser therefore uses the MapLibre rollback path.
- Advisor capability was enabled by server configuration and advertised the
  `switchback-local`, `switchback-roads`, and `google-maps` sources. Secret
  values are intentionally not recorded.

## Served-runtime verification

At the final recheck the public response was HTTP 200, the raw HTML contained
the exact candidate marker above, and the public health endpoint returned
`ok: true`, `degraded: false`, with GraphHopper and Valhalla both healthy. The
same SHA was checked out locally and on `origin/main`.

The repository's production validation command was also run against the public
URL (`SWITCHBACK_URL=https://ride.henning.rodeo npm run validate:live`) at
2026-09-09 16:04:23Z. It exited 0: all configured route profiles returned
routes, the motorcycle exclusion produced the expected detour, and the
free-form destination returned three GraphHopper candidates.
