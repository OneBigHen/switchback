# TomTom traffic evidence implementation plan

**Goal:** Establish a tested, optional TomTom traffic-evidence boundary that can safely feed later SwitchBack comparison/scoring and map UX.

**Architecture:** The client sends only route geometry to a same-origin API. A server-only TomTom adapter derives bounded corridor boxes, calls Orbis Traffic API v2 with header-based authentication, normalizes and deduplicates incidents, and returns explicit evidence quality (`available`, `degraded`, `unknown`). No route generator or ranker changes in this slice.

**Tech stack:** Next.js App Router, TypeScript, Vitest, existing SwitchBack validation/body-limit/rate-limit utilities.

## Task 1: Lock the domain contract with tests

Files:
- Create `src/lib/traffic/types.ts`
- Create `tests/unit/tomtom-traffic.test.ts`

Tests first:
- corridor box generation is bounded and buffered;
- normal TomTom incidents normalize to SwitchBack kinds;
- road closures set `hasClosure`;
- duplicate incident IDs collapse;
- partial provider failure yields `degraded` and `totalDelaySeconds: null`;
- total provider failure yields `unknown`, not a zero-delay result;
- no API key yields `unknown` without calling fetch.

## Task 2: Implement the TomTom Orbis v2 adapter

File:
- Create `src/lib/traffic/tomtom.ts`

Requirements:
- `TOMTOM_API_KEY` passed only as `TomTom-Api-Key` header;
- Orbis v2 incident-details endpoint;
- request only fields SwitchBack consumes via `Attributes`;
- `Accept-Language: en-US`;
- bounded fan-out;
- robust response-shape checks;
- no provider errors or key material exposed in returned evidence.

## Task 3: Expose the same-origin route traffic API

Files:
- Create `src/app/api/route-traffic/handler.ts`
- Create `src/app/api/route-traffic/route.ts`
- Create `tests/unit/route-traffic-api.test.ts`

Requirements:
- POST only;
- 2-400 validated coordinates;
- bounded JSON body;
- conservative per-IP rate limiting;
- no-store response caching because evidence is live;
- safe `400`, `413`, and `503` envelopes;
- adapter no-key state remains a successful `unknown` evidence response, not a routing failure.

## Task 4: Document deployment configuration

File:
- Update `.env.example`

Add server-only `TOMTOM_API_KEY` documentation, explicitly warning against any `NEXT_PUBLIC_` equivalent and describing the route-traffic boundary.

## Task 5: Verify and open a draft PR

Run/observe repository gates on the final branch head:
- targeted Vitest files;
- `npm run typecheck`;
- `npm run lint`;
- `npm test`;
- `npm run build`;
- required GitHub checks.

Do not claim the implementation is green until those checks actually report success. Keep the PR draft until failures are resolved and live-provider smoke evidence is recorded separately from ordinary CI.
