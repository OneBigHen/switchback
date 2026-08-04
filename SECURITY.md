# Security Policy

Switchback is self-hosted software: you run the server, you own the data and
the provider keys it uses. This policy covers the app itself and the public
deployment at `ride.henning.rodeo`.

## Reporting a vulnerability

- **Do not** open a public issue for security problems.
- Report privately via [GitHub Security Advisories](https://github.com/OneBigHen/switchback/security/advisories/new)
  ("Report a vulnerability") or email the maintainer directly.

Please include:

1. The affected endpoint, file, and line if known.
2. A minimal reproduction (request, payload, expected vs actual behavior).
3. Impact and any suggested fix.

You will get an acknowledgement within 3 business days and a fix plan
(including whether a coordinated disclosure window is needed).

## Scope

In scope:

- The Next.js app under `src/` (API routes, client code, authentication).
- Deployment config under `infra/` (Caddy, systemd, compose files).
- The routing engines (GraphHopper / Valhalla) only insofar as the app
  misuses them; upstream engines report through their own projects.

Out of scope:

- API keys and credentials in the operator's own environment (these never
  belong in the repo — see below).
- The browser's geolocation / device permissions model.
- Third-party services the app calls (OpenFreeMap, Photon, NWS, Overpass,
  Google Places, OpenRouter, You.com, Spotify).

## Security model notes

- All provider API keys are server-only; `NEXT_PUBLIC_*` contains only the
  non-secret map style URL.
- Every public endpoint is rate-limited per caller IP; the reverse proxy must
  strip and rewrite client-IP headers (see `infra/caddy/Caddyfile.example`).
- Operators should keep the Next origin and router ports firewalled behind
  their proxy and use real TLS certificates for public deployments.
