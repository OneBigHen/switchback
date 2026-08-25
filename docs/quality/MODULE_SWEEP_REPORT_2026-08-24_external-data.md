# Module quality sweep — External data

**Area:** External data (`src/lib/weather/`, `src/lib/places/`, `src/lib/geocoding/`, `src/lib/map-features/`, `src/lib/ai/`)
**Date:** 2026-08-24
**Scope note:** per-area report per `docs/quality/MODULE_SWEEP_BRIEF.md` — this
file, not the brief's shared filename, to avoid merge conflicts across the 9
parallel sweep branches. A follow-up pass consolidates all per-area files.

## Prior-work check (done before auditing)

Grepped `AUDIT-SUPPLEMENT.md`, `AUDIT-EVALUATION.md`, `UX-AUDIT.md`,
`docs/audit-deepseek-v4-pro.md`, `docs/audit-mimo-v2.5-pro.md`,
`docs/recovery/BASELINE_AUDIT.md`, `docs/reviews/2026-08-21/*`, and
`docs/SHAREABILITY-REVIEW-2026-08-14.md` for this area's paths and for
`hardcod`/`api key`/`secret`/`geocod`/`weather`/`places`/`overpass`/`photon`/
`openrouter`/`you.com` before treating anything as a new discovery. Two prior
items came back **already resolved in the current tree** (see rollup); no
prior item for this area came back still-open.

## Security check (higher bar per brief + `SECURITY.md`)

Ran a live-credential-pattern scan (`sk-…`, `AIza…`, embedded `Bearer …`,
inline `key=`) across all five assigned directories: **zero matches.**
Cross-checked every provider URL/key against `.env.example` and the route
handlers that construct requests:

| Provider | Key env var | URL | Source |
|---|---|---|---|
| Google Places | `GOOGLE_MAPS_API_KEY` | `https://places.googleapis.com/v1/places:*` | hardcoded consts, not a secret (Google's fixed API host) |
| OpenRouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1/chat/completions` | hardcoded const, not a secret |
| You.com Research | `YOU_API_KEY` | `https://api.you.com/v1/research` | hardcoded const, not a secret |
| You.com Search | `YOU_API_KEY` | `https://ydc-index.io/v1/search` | hardcoded const, not a secret |
| Photon geocoder | none (public) | `PHOTON_URL` env, default `https://photon.komoot.io/api/` | public no-key API |
| NWS weather | none (public) | `NWS_USER_AGENT` env for the required contact header; base URL default `https://api.weather.gov` | public no-key API |
| Overpass (OSM) | none (public) | `OVERPASS_URL` env, default `https://overpass-api.de/api/interpreter` | public no-key API |

All four **secrets** are read from `process.env` only, server-side, never
under a `NEXT_PUBLIC_` prefix, and `.env.example` carries them blank (no
placeholder that looks real). The hardcoded strings that exist are all
**provider API endpoints**, not credentials — same conclusion
`docs/audit-deepseek-v4-pro.md` and `docs/audit-mimo-v2.5-pro.md` reached
repo-wide. **No live-looking credential found anywhere in this area — nothing
to escalate as `NEEDS YOUR DECISION`.**

One legitimate hardcoded-URL split that looks like drift but isn't: the two
You.com endpoints above use different hosts/paths by design —
`plans/routing-intelligence-rework/implementation/phase-5-impl.md` documents
that Search moved to `ydc-index.io/v1/search` while Research stays on
`api.you.com/v1/research`. Verified both are still wired to their intended
callers (`ride-research.ts` → Search, `corridor-adviser.ts` → Research). Not
a finding.

## Findings

### [external-data] Dead exported helper `selectFunStopCandidate`
**File:** `src/lib/geocoding/photon.ts:257-264` (pre-fix)
**Severity:** low
**Evidence:** `grep -rn "selectFunStopCandidate" --include=*.ts --include=*.tsx --include=*.md .` (repo-wide, excluding `node_modules`) returned only the function's own definition — no caller in `src/`, no test, no doc reference. Checked for dynamic access (string-keyed dispatch, `React.lazy`, config tables) per the brief's guardrail: none found; it's a plain named export with no registry pattern nearby.
**Fix:** Removed the function. `filterFunStopCandidates` (its only real consumer pattern, `[0]` of the filtered list) remains and is used directly by `src/app/api/geocode/handler.ts` and `src/app/api/place-ideas/route.ts`. `npm test` green after removal (see gate results below).

### [external-data] `parseStrictRideIntent` had no production caller — duplicated inline instead
**File:** `src/lib/ai/ride-intent.ts:72` (definition) and (pre-fix) `:346-353` (duplicate inline logic)
**Severity:** medium
**Evidence:** `parseStrictRideIntent`'s own docstring says "Validate model output at the boundary; callers never route on raw JSON" — implying it *is* the boundary check for model output. `grep -rn "parseStrictRideIntent" src` (pre-fix) showed zero callers outside its own definition; its only production-shaped caller, `interpretRidePrompt` (the function that actually receives OpenRouter's raw JSON), reimplemented the identical two steps by hand instead (`safeParse(rideIntentSchema, …)` then `validateIntent(...)` in a nested try/catch). This is doc/code drift: the function documented as the boundary was not wired to the boundary, and the real boundary carried a second, divergent copy of the same validation that could silently drift out of sync with it over time.
**Fix:** `interpretRidePrompt` now calls `parseStrictRideIntent(JSON.parse(content), "openrouter")` directly inside its existing try/catch (which already falls back to the local parser on any thrown error — behavior is unchanged, verified by the existing `tests/unit/ride-intent.test.ts` and `tests/unit/grounded-ai.test.ts` suites, both still green). Removes ~6 lines of duplicate logic and makes the docstring true.

### [external-data] `getRiderMapFeatures` returns a false "confirmed empty" on partial provider failure
**File:** `src/lib/map-features/osm.ts:216-249` (pre-fix)
**Severity:** high
**Evidence:** When a request asks for multiple layers spanning both providers (e.g. `layers=fuel,weather`), `getRiderMapFeatures` fans out to Overpass (OSM POIs) and NWS (active weather alerts) via `Promise.allSettled`, then only threw if **every** provider failed (`if (!collections.some(r => r.status === "fulfilled")) throw ...`). If exactly one provider failed — say Overpass times out while NWS succeeds — the function returned a normal `200`-shaped `RiderFeatureCollection` containing only the surviving provider's features, with no indication anything was missing. A rider requesting the `weather` layer during an Overpass outage, or vice versa, would see an empty/partial layer that reads identically to "confirmed no matches in this area," which is a concrete wrong-output failure (input: two-layer request with one dead provider → output: silently-incomplete "success"). This is the same failure shape `src/lib/weather/nws.ts` (in the very same area) already guards against — that module returns an explicit `status: "degraded"` and `unavailable: [...]` per sample precisely so callers can't confuse "no data" with "provider down" (see `tests/unit/route-weather.test.ts`). `osm.ts` had no equivalent signal.
**Fix:** Added an optional `unavailable?: Array<"osm" | "weather">` field to `RiderFeatureCollection`, populated only when at least one requested provider's fetch rejected (absent — not `[]` — when every provider succeeds, so existing consumers that ignore the field see byte-identical responses to before). Added two tests in `tests/unit/map-features.test.ts` covering the partial-failure case and the all-success case. This only touches `src/lib/map-features/osm.ts`; I did not touch `src/app/api/map-features/*` (that's the "App shell & routes" sweep row's territory) or any UI consumer — the field is additive/optional so nothing downstream breaks by not reading it yet. Wiring a "layer degraded" indicator into the map UI is a follow-up for whichever area owns `src/components/planner/MapStage.tsx`, not this one.

## Checked, found already resolved (not new findings)

### `AUDIT-SUPPLEMENT.md` §4.7 — Google Places silent-empty on missing/failed key
That audit recommended surfacing "Google Places not configured" instead of silently returning empty. The current `src/app/api/place-ideas/route.ts` (outside this area's paths, read for context only) already does better than the suggested fix: it falls back to Photon on any Google error/empty result *and* returns `provider: "google" | "photon"` in the response body, so the caller always knows which provider actually served the result, without erroring the request. `src/lib/places/google-places.ts`'s `searchGooglePopularPlaces` returning `[]` on a missing key (line 244) is the correct low-level contract for that fallback to work. **Resolved by design change since the audit was written; archivable for this specific item.**

### `AUDIT-SUPPLEMENT.md` §4.8 — Photon geocoder hardcoded Pennsylvania bias
The audit found `photon.ts:138-149` with hardcoded PA bounds always promoted PA results regardless of deployer region. The current `src/lib/geocoding/photon.ts:31-84` reads `SWITCHBACK_GEOCODER_BBOX` / `SWITCHBACK_GEOCODER_REGION` env vars (documented in `.env.example:24-28`) and only falls back to the PA/NJ default when unset — matching this deployment's actual region rather than being permanently hardcoded. Covered by `tests/unit/geocoder.test.ts` ("treats New Jersey as first-class default routing coverage", PA-vs-NJ preference tests). **Resolved; archivable for this specific item.**

Neither audit doc is *fully* archivable — both cover areas well outside this sweep row (UI/UX, other modules) — but these two specific line items are closed and can be struck from any follow-up tracking of `AUDIT-SUPPLEMENT.md`.

## Verification gate

`npm run verify` (lint + typecheck + unit tests + build) run in full after all
three fixes above; see command output captured during this session — lint
clean at `--max-warnings=0`, typecheck clean, full unit suite green
(including the two new `map-features.test.ts` cases), production build
succeeded.

## Rollup

| Severity | Count | Fixed | Flagged |
|---|---|---|---|
| Blocker | 0 | 0 | 0 |
| High | 1 | 1 | 0 |
| Medium | 1 | 1 | 0 |
| Low | 1 | 1 | 0 |
| **Total** | **3** | **3** | **0** |

- No hardcoded live secret/credential found anywhere in this area's assigned
  paths — nothing required a `NEEDS YOUR DECISION` escalation.
- All 3 findings were small, safely fixable, reviewable changes made directly
  on this branch; none required a product/architecture call, so nothing is
  outstanding as `NEEDS YOUR DECISION` for this area. Status: **READY TO
  MERGE** pending review.
- Two specific line-items in `AUDIT-SUPPLEMENT.md` (§4.7, §4.8) are now
  resolved and can be struck from that document; the document as a whole is
  not archivable (it covers other modules with open items).
