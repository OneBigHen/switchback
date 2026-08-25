# Module quality sweep — Community & sharing

**Area:** `src/components/community/`, `src/lib/community/`, `src/lib/share/`
**Date:** 2026-08-24
**Prior docs checked:** `docs/phase-reports/P31-community-backend.md`,
`docs/phase-reports/P32-passkey-privacy.md`, `AUDIT-SUPPLEMENT.md`,
`AUDIT-EVALUATION.md`, `UX-AUDIT.md`, `docs/audit-deepseek-v4-pro.md`,
`docs/audit-mimo-v2.5-pro.md`, `docs/recovery/BASELINE_AUDIT.md`,
`docs/reviews/2026-08-21/*`, `docs/SHAREABILITY-REVIEW-2026-08-14.md`.

## Verdict on the `PLAN_TONIGHT.md` "stub-quality" flag

**Not uniformly true.** This area splits cleanly into two halves:

- **Fully working, end-to-end, with real UI and test coverage:**
  - **Private portable route sharing** (`src/lib/share/route-share.ts` →
    `RouteSharePanel.tsx`): `createPortableShare` builds a privacy-redacted,
    URL-hash-encoded copy; `restorePortableShare` is called on load in
    `PlannerShell.tsx:390` and actually replaces the planner state. Proven by
    `tests/unit/route-share.test.ts` (23 cases) and a passing component test.
  - **Public route publish/browse/view/download/report/unpublish**
    (`src/lib/community/*` → `CommunityPublishPanel.tsx` mounted inside
    `RouteComparison.tsx` → `PlannerComposition.tsx` → `PlannerShell.tsx`,
    and `src/app/routes/page.tsx` / `src/app/routes/[routeId]/page.tsx`).
    Backed by a real SQLite store (`node:sqlite`, WAL mode, FK constraints,
    transactions) behind a WebAuthn passkey + CSRF mutation boundary.
    `tests/e2e/identity/authenticated-community.spec.ts` drives this through
    a real Chromium WebAuthn ceremony (publish → link sync → unpublish, all
    201/200). This is not a stub.
- **Backend-complete, UI-unreachable** (the actual stub-quality substance —
  see finding 1 below): comments, RIG contributions, route-revision editing,
  and artifact-metadata registration. Full server implementations exist,
  fully input-validated and rate-limited, but **no component in the app ever
  calls them.** A rider cannot leave a comment, contribute RIG evidence, or
  edit a previously-published route through any reachable screen today.

---

## Findings

### [community] Four community write-paths are fully implemented server-side but have no UI caller
**File:**
- `src/app/api/community/routes/[routeId]/comments/route.ts` (GET/POST) +
  `src/lib/community/repository.ts:344-361` (`addComment`/`listComments`)
- `src/app/api/community/routes/[routeId]/rig-contributions/route.ts` (POST)
  + `repository.ts:397-406` (`addRigContribution`)
- `src/app/api/community/routes/[routeId]/revisions/route.ts` (POST) +
  `repository.ts:307-326` (`addRevision`) — the only way to edit an already
  -published route's title/description/preview without deleting and
  recreating it
- `src/app/api/community/routes/[routeId]/artifacts/route.ts` (POST) +
  `repository.ts:333-342` (`addArtifact`) — records only `sha256`/`bytes`
  metadata and a placeholder `storage_path`; no code path anywhere writes an
  actual artifact file to that path

**Severity:** medium

**Evidence:** `grep -rn "CommentsPost\|addComment\|rig-contributions\|addRigContribution\|revisions\b\|addRevision\|artifacts/route\|addArtifact" src --include=*.tsx` returns matches only inside `repository.ts` and the route handler itself for each of the four — zero `.tsx` component references. Cross-checked with test coverage:
`tests/unit/community-backend.test.ts` exercises the four repository methods
directly (proving the *data layer* is correct), but
`grep -rln "handleCommunityCommentsPost\|handleRigContributionPost\|handleCommunityRevisionPost\|handleCommunityArtifactPost" tests/` returns nothing — the HTTP route handlers for these four endpoints have **zero** test coverage (unlike every other community route, which has a `community-public-api.test.ts` case). This is consistent with the endpoints never having been wired to a caller: nothing ever exercised them as an HTTP boundary. Next.js's file-based routing still makes these reachable via direct HTTP (so they are not "dead code" by the brief's definition — they're live, authenticated, rate-limited API surface), just orphaned from the product's own UI.

**Fix:** flagged, not fixed — this needs a product call, not a "small,
reviewable" code change. `NEEDS YOUR DECISION`: for each of the four
(comments, RIG contributions, revision-editing, artifact storage), pick one
of (a) build the minimal UI to reach it, (b) remove the endpoint/table until
there's a UI plan, or (c) leave as explicit backend-only infrastructure and
say so in `P31-community-backend.md`'s boundary section (it currently
documents the operator-moderation gap this way but not this one).
**Recommended default:** leave as-is for now (removing working, tested,
rate-limited backend code destroys real effort for no safety gain) but add
one sentence to `P31-community-backend.md`'s Boundary section stating
comments/RIG-contributions/revisions/artifacts have no UI caller yet — so
the next person doesn't have to re-derive this.

### [share] `RouteSharePanel` privacy radius has no upper bound — a normal typo can silently break private sharing
**File:** `src/components/planner/RouteSharePanel.tsx:19` (pre-fix)
**Severity:** medium

**Evidence:** The sibling component `CommunityPublishPanel.tsx:41` clamps
the same control to `Math.max(0.1, Math.min(10, radiusMiles))`, matching the
input's advertised `min="0.1" max="10"`. `RouteSharePanel.tsx` used
`Math.max(0.1, radiusMiles)` with no upper clamp. Neither component is
wrapped in a `<form>`, so the browser's native min/max validation never
fires — a rider can type e.g. `500` directly into the "Share privacy radius
miles" field and click "Copy private link." Reproduced with a failing test
(`tests/components/route-share-panel.test.tsx`, verified red on the
pre-fix code, green after): a 500mi privacy radius around the start point of
a real (~66mi) route covers the entire route, so
`redactRouteForShare` throws `"Privacy zones remove too much of this route
to create a useful share."` and sharing silently fails — not a privacy leak
(it fails closed), but a real, reachable correctness bug that breaks a
shipped, tested feature on ordinary input.

**Fix:** applied. `src/components/planner/RouteSharePanel.tsx:23` now
clamps identically to `CommunityPublishPanel`:
`Math.max(0.1, Math.min(10, radiusMiles))`. Added
`tests/components/route-share-panel.test.tsx` (previously this component had
*zero* test coverage, unlike `CommunityPublishPanel`) asserting the clamp
holds for an out-of-range typed value.

### [community] Computed instruction-redaction data is never consumed by its only caller
**File:** `src/lib/community/privacy-preview.ts:164-179`
(`publicInstructions`, `redactedInstructionCount` on
`PublishPrivacyPreview`); sole caller
`src/components/planner/CommunityPublishPanel.tsx:50-68` only reads
`publicGeometry`, `publicDistanceMiles`, `publicDurationMinutes`,
`redactedPointCount`.
**Severity:** low

**Evidence:** `grep -rn "publicInstructions\|redactedInstructionCount" src tests` shows both fields are computed with real logic and asserted by
`tests/unit/passkey-privacy.test.ts:37-51`, but never read by
`CommunityPublishPanel`, and the server-side schema
(`parseCommunityPreviewArtifact` in `src/lib/community/contracts.ts:94-111`)
doesn't even accept an `instructions` field — so there's currently no path
for this data to reach either the publish payload or the UI.

**Fix:** flagged, not fixed. Likely intended for a future "show turn-by-turn
on the public route page" feature; removing it would shrink a tested public
function's return shape for no immediate benefit. No action recommended
beyond noting it here so it isn't mistaken for a bug later.

### [community] Operator moderation has no UI — confirmed still true, not a new finding
**File:** `src/app/api/community/reports/route.ts` (`GET`, operator-only),
`src/app/api/community/reports/[reportId]/route.ts` (`PATCH`, operator-only)
**Severity:** low (already an acknowledged, documented boundary)

**Evidence:** `docs/phase-reports/P31-community-backend.md`'s own Boundary
section already states: *"The repository is ready for a real WebAuthn
verifier and operator moderation workflow... no... operator moderation
workflow... is claimed."* `find src/app -iname "*moderat*" -o -iname
"*operator*" -o -iname "*admin*"` returns nothing — confirmed still true
today. Test coverage for the operator path exists only at the API level
(`tests/unit/community-public-api.test.ts:89-114`, calling the handlers
directly with a manually-set `SWITCHBACK_COMMUNITY_OPERATOR_IDS`), not via
any UI.

**Fix:** not fixed — matches the brief's "still not fixed, not discovered"
guidance. No new action; restating here only for completeness of this
area's report.

### [share] Prior audit finding on redaction completeness — RESOLVED, not reproducible
**File:** `docs/recovery/BASELINE_AUDIT.md:24` (2026-08-05, item #5): *"Privacy
sharing redacts geometry/waypoints only; instructions and street names leak;
metrics/interval indices not rebased"* citing `src/lib/share/route-share.ts:72-85`.

**Status:** **Fully fixed since 2026-08-05.** The current
`redactRouteForShare` (`src/lib/share/route-share.ts:189-236`) filters out
any instruction whose interval touches a removed zone range (lines
200-207), rebases surviving interval indices onto the redacted geometry via
an explicit index map (lines 195-216, `newIndexForOriginal`), and
recalculates `distanceMiles`/`durationMinutes` from the visible geometry's
length ratio (lines 218-227) while nulling elevation fields that can't be
attributed to a partial route. This is proven by a dedicated test group,
`tests/unit/route-share.test.ts:243-339` ("privacy redaction completeness
(SB-008)"), with explicit assertions that a protected street name
(`Main St`) never survives (`:312-322`), surviving instructions are
correctly rebased (`:298-310`), and distance/duration shrink to match the
visible line (`:289-296`). I could not reproduce the original defect on the
current tree. **This specific item in `BASELINE_AUDIT.md` should be marked
resolved/archivable** — the rest of that document covers routing/planning/
offline modules outside this sweep's assignment and is not addressed here.

### [share] Production config gap noted in a prior audit could still make the working features non-functional live — could not independently verify
**File:** `docs/SHAREABILITY-REVIEW-2026-08-14.md:126-141` (§4): production
was reported missing `SWITCHBACK_SESSION_SECRET`, which makes
`createIdentitySession` throw — breaking passkey sign-in and therefore any
identity-gated mutation (`requireMutationIdentity`), including
`CommunityPublishPanel`'s publish flow and `CommunityReportForm`'s report
flow that this sweep confirmed are otherwise code-complete and tested.
**Severity:** medium (only if still true in production; unverifiable from
this sandboxed worktree, which has no access to the live deployment)

**Evidence:** cited doc only; dated 10 days before this sweep, with its own
action item ("generate a 32+ char random value... before anyone relies on
passkey sign-in or community publish"). Not re-verified here — no
production access from this environment.

**Fix:** not fixed (out of scope — infra/env, not code).
`NEEDS YOUR DECISION`: confirm whether `SWITCHBACK_SESSION_SECRET` is set in
the live environment; if it's still missing, the code-level "fully working"
verdict above for publish/report is true in the repo but not in production.
Recommended default: verify via `/api/health` or a real publish attempt
against the live site; set the secret if missing.

---

## Rollup

| Severity | Count | Fixed | Flagged |
|---|---|---|---|
| Blocker | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 3 | 1 | 2 |
| Low | 2 | 0 | 2 |
| **Total** | **5** | **1** | **4** |

Plus one prior-audit item independently confirmed **resolved** (not counted
above as a new finding): `docs/recovery/BASELINE_AUDIT.md` item #5.

**Fixed this sweep:**
- `src/components/planner/RouteSharePanel.tsx` — added the missing upper
  privacy-radius clamp (matches `CommunityPublishPanel`'s existing clamp),
  plus a new regression test
  (`tests/components/route-share-panel.test.tsx`) verified to fail on the
  pre-fix code and pass on the fix.

**Flagged, needs a decision:**
1. Comments / RIG contributions / revision-editing / artifact-metadata:
   real backend, zero UI path — decide finish-minimally / remove / label
   explicit-WIP (recommended default: leave code, document the gap).
2. `SWITCHBACK_SESSION_SECRET` production status — reconfirm; if missing,
   publish/report are broken live despite being code-complete.

**Not new, still true (no action taken, restated for completeness):**
- Operator moderation has no UI (`P31-community-backend.md`'s own
  documented boundary).

**Archivable as of this report:**
- `docs/recovery/BASELINE_AUDIT.md` item #5 (route-share privacy redaction)
  — resolved and test-proven. The document as a whole is **not** fully
  archivable; its other 10 items belong to routing/planning/offline/UI
  modules outside this sweep's assignment.

## Verification

- `npx vitest run tests/unit/community-backend.test.ts tests/unit/community-public-api.test.ts tests/unit/route-share.test.ts tests/components/community-publish-panel.test.tsx tests/components/route-share-panel.test.tsx` — all passing.
- Full gate: `npm run verify` (lint + typecheck + unit tests + build) — see
  commit/PR for the run this report was finalized against.
