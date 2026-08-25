# Module quality sweep — Sync & identity

**Area:** Sync & identity
**Paths audited:** `src/lib/sync/`, `src/lib/identity/`, `src/lib/storage/`
(plus `src/lib/client/sync-controller.ts`, `src/components/shell/ProfilePanel.tsx`,
`src/app/api/sync/*` and `src/app/api/identity/register/options/route.ts` as
call-graph endpoints needed to answer the wiring question below)
**Date:** 2026-08-24
**Companion brief:** `docs/quality/MODULE_SWEEP_BRIEF.md`

This is a per-area file (see brief's parallel-worktree note); it is not the
brief's originally-named shared report.

---

## 0. The specific question: is `sync-controller.ts` / `encrypted-sync.ts` unwired dead code?

**No.** Traced with a full call-graph trace, not a grep:

```
src/app/page.tsx (HomePage, the root route)
  → PlannerShell (src/components/planner/PlannerShell.tsx:112) — always rendered
    → ProfilePanel (src/components/planner/PlannerShell.tsx:1489-1502)
        rendered when navigation.activeTab === "profile"
      → "Profile" is a real bottom-nav tab a rider can tap
        (src/components/shell/AppNavigation.tsx:14, { tab: "profile", label: "Profile" })
    → ProfilePanel.tsx:44  const syncController = useMemo(() => createSyncController(), [])
      → createSyncController (src/lib/client/sync-controller.ts:116)
        → SyncClientStore (src/lib/sync/client-store.ts, Dexie-backed IndexedDB)
        → createSyncRoot / encryptJsonSyncObject / decryptJsonSyncObject / parseSyncEnvelope
          / mergeSyncHeaders (src/lib/sync/encrypted-sync.ts) — AES-256-GCM, HKDF per-object keys
        → createRecoveryKit / parseRecoveryKit (src/lib/sync/recovery-kit.ts)
        → fetch("/api/sync"), fetch("/api/sync/link")
          → src/app/api/sync/route.ts, src/app/api/sync/link/route.ts
            → SyncRepository (src/lib/sync/repository.ts) — real SQLite-backed store
              (data/sync.sqlite), owner-scoped by identity, cursor-paginated
```

ProfilePanel's JSX wires real UI to all of this: "Create Switchback ID" /
"Use existing passkey" (passkey.ts + webauthn.ts), "Export recovery kit"
(QR code + seed), "Authenticate and link device", "Sync now", and "Import
recovery seed" are all live buttons bound to `syncController.*` methods
(`src/components/planner/PlannerShell.tsx` via
`src/components/shell/ProfilePanel.tsx:301-336`).

There is also an automated two-device restore drill —
`tests/unit/sync-restore-drill.test.ts` — that creates two independent
`SyncClientStore`/`RouteLibrary` pairs (simulating two devices), exports a
recovery kit from device 1, imports it on device 2, links both against a real
`SyncRepository` (temp SQLite file), and asserts the saved route and
namespace restore correctly on device 2. This passes today (see §5).

**Conclusion:** the suspicion recorded in `PLAN_TONIGHT.md` ("`sync-controller.ts`
and `encrypted-sync.ts` already exist but aren't proven wired into the UI")
does not match the current tree. The feature is wired end-to-end (UI → client
crypto/store → API → SQLite) and has an automated multi-device round-trip
test. What remains genuinely unproven is a *manual* two-physical-device/browser
drill and real WebAuthn hardware — which `docs/phase-reports/P33-encrypted-sync.md`
and `P32-passkey-privacy.md` already state honestly in their own "Boundary"
sections (not new information). No code was deleted; nothing here needed a
product decision because the "is it dead?" premise didn't hold.

---

## 1. Findings

### [Sync & identity] Region download quota check rejects legitimate resumes near a full device
**File:** `src/lib/storage/region-download-client.ts:173` (pre-fix)
**Severity:** medium
**Evidence:** `checkQuota(manifest.tileByteTotal)` was called with the
manifest's *full* pack size on every call to `download()`, including a resume
of a partially-downloaded pack. Tiles already verified on disk (matched by
sha256+size, skipped later in the same function at what is now line ~199) are
already counted in `navigator.storage.estimate().usage`, so re-requiring
headroom for the *entire* pack again double-counts them. Concrete failure:
a rider pauses/loses connectivity most of the way through a large region
download with little free space left; on resume, the client throws "Not
enough device storage for this offline region" even though only a small
remainder is actually needed and the device has room for it.
Added a regression test proving this: `tests/unit/region-download-client-v2.test.ts`
→ "resumes near-complete downloads without re-checking quota for
already-stored bytes". Verified the test fails on the pre-fix code
(`Error: Not enough device storage for this offline region`, thrown from
`checkQuota`) and passes after the fix, by stashing/unstashing the fix and
re-running.
**Fix:** Added `RegionDownloadClient.alreadyStoredBytes()`, which sums the
byte size of already-verified tiles for the manifest being (re)downloaded,
and changed `download()` to call `checkQuota(manifest.tileByteTotal -
alreadyStoredBytes)` instead of the full total. Fixed in this PR, with the
new test above.

### [Sync & identity] Passkey registration persists an identity before the credential is verified
**File:** `src/app/api/identity/register/options/route.ts:25` (`runtime.store.createIdentity(displayName(body))`, called in the *options* step, before `verify`)
**Severity:** medium
**Evidence:** Documented previously in `docs/audit-deepseek-v4-pro.md`
(finding #5, "Registration creates an identity before the passkey is
verified"): an abandoned registration leaves an orphaned `public_identity`
row with no expiry/cleanup, and repeated calls can mint credential-less
identities (bounded by the route's 5/min rate limit). Re-verified against the
current tree: the code at `src/app/api/identity/register/options/route.ts:25`
is unchanged from what that audit described, and no GC/cleanup pass exists
anywhere in the tree (`grep -rn "credential-less\|pruneIdentit\|cleanup.*identit"`
returns nothing). **Still not fixed** — this is "still not fixed," not a new
discovery.
**Fix:** flagged, not fixed. This is an architecture call, not a safe
mechanical fix: WebAuthn registration ceremonies conventionally need a
user handle before `generateRegistrationOptions`, so "defer identity
creation until verify succeeds" is a real redesign of the registration flow,
not a one-line change. `NEEDS YOUR DECISION`: do you want (a) a periodic GC
pass that deletes credential-less identities older than some TTL, or (b) a
deferred-identity-creation redesign of the registration ceremony? **Recommended
default: (a)** — it's the smaller, lower-risk change and the prior audit
itself suggested it as the pragmatic fix; the abuse surface is already bounded
by the existing 5/min rate limit.

### [Sync & identity] `SWITCHBACK_SESSION_SECRET` — still-documented production gap, unverifiable from this repo
**File:** `src/lib/identity/passkey.ts:100` (`createIdentitySession` throws if `secret.length < 32`), `src/lib/identity/csrf.ts:17,37` (reads `process.env.SWITCHBACK_SESSION_SECRET ?? ""`)
**Severity:** low (from a code standpoint — the code fails closed correctly; this is an ops/deployment gap, not a code bug)
**Evidence:** `docs/SHAREABILITY-REVIEW-2026-08-14.md` §4 and §8 item 1
documented that production was missing `SWITCHBACK_SESSION_SECRET`, causing
passkey registration/login to 500 while leaving session-forgery risk at zero
(fails closed). The code at both cited lines is unchanged since that review.
This repo checkout cannot see the production environment, so whether the
owner has since set the secret is unknown from here.
**Fix:** flagged, not fixed — not something a code sweep can resolve.
`NEEDS YOUR DECISION` only in the sense of: please confirm whether
`SWITCHBACK_SESSION_SECRET` is now set in `/etc/switchback/switchback.env` on
the production host. **Recommended default:** if not yet done, set a 32+
character random value and restart the service, per the prior review's own
recommendation — no code change needed on this repo's side.

### [Sync & identity] In-memory `PasskeyChallengeStore` — single-instance constraint (no action needed)
**File:** `src/lib/identity/passkey.ts:33-70`
**Severity:** low
**Evidence:** `docs/audit-deepseek-v4-pro.md` finding #9 already documented
this (module-level `Map`, lost on restart, not shared across instances) and
explicitly concluded it is "Acceptable for the self-hosted single-instance
model, but worth documenting" — no fix requested. Still true today; no code
change made or needed. Listed here only to close the loop on that audit
item, not as a new or reopened finding.

---

## 2. Everything else audited — no findings

Read in full and cross-referenced for dead exports, correctness, and doc
drift; no issues found beyond the above:

- `src/lib/sync/client-store.ts`, `recovery-kit.ts`, `repository.ts`,
  `encrypted-sync.ts` — all exports have real callers (traced via codegraph
  blast-radius: `createSyncController`, `createSyncRoot`,
  `mergeSyncHeaders`, `parseSyncEnvelope`, `encryptJsonSyncObject` /
  `decryptJsonSyncObject`, `createRecoveryKit` / `parseRecoveryKit`,
  `importRecoveryKit` all resolve to `ProfilePanel.tsx` or
  `sync-controller.ts` on the client side, and `src/app/api/sync/route.ts` /
  `link/route.ts` on the server side). Server repository correctly scopes
  every read/write by `(namespace_id, owner_identity_id)` and validates
  cursors/limits.
- `src/lib/identity/csrf.ts`, `passkey.ts`, `webauthn.ts` — HMAC session
  signing is timing-safe (`timingSafeEqual`), CSRF is double-submit and
  timing-safe, WebAuthn config validates origin/RP-ID hostname relationship
  and enforces HTTPS in production. Matches `docs/audit-mimo-v2.5-pro.md`'s
  positive assessment; nothing regressed.
- `src/lib/storage/route-library.ts`, `trip-plan-library.ts`,
  `rider-preference-library.ts`, `map-pack-library.ts`, `ride-journal.ts`,
  `ride-recovery.ts`, `offline-route-pack.ts`, `offline-contracts.ts` — all
  confirmed to have live callers in `PlannerShell.tsx`,
  `usePlannerLibraries.ts`, or `useNavigationSessionController.ts` (checked
  each Dexie-backed class and each `localStorage`-backed function
  individually; none are orphaned).
- `region-download-client.ts` — otherwise correct (checksum-verified,
  atomic version activation via a single Dexie transaction, previous-version
  cleanup); see the one fix above.

## 3. Prior audit docs — status after this pass

- `PLAN_TONIGHT.md` (untracked, repo root): the specific sync-controller/
  encrypted-sync suspicion is **resolved as a non-issue** — see §0. The
  broader Phase 3 ask (two-device restore drill "has no evidence of ever
  running") is now backed by an automated test
  (`tests/unit/sync-restore-drill.test.ts`), though a literal manual
  two-physical-device drill remains unrun (matches `P33`'s own stated
  boundary — not new information).
- `docs/audit-deepseek-v4-pro.md`: finding #5 (identity-before-verify) is
  **still open**, flagged above with a recommended default. Finding #9
  (in-memory challenge store) is unchanged and was already marked
  no-action — **archivable for this specific item**.
- `docs/SHAREABILITY-REVIEW-2026-08-14.md`: §4's `SWITCHBACK_SESSION_SECRET`
  gap is **still open from the code's point of view** (code unchanged);
  whether it's resolved in production is outside this repo's visibility —
  not archivable without owner confirmation.
- `docs/audit-mimo-v2.5-pro.md`: its positive identity/crypto assessment
  still holds; no regressions found.
- `docs/phase-reports/P32-passkey-privacy.md`, `P33-encrypted-sync.md`: both
  accurately describe current behavior, including their own stated
  boundaries (physical authenticator ceremonies, real multi-device drill).
  No drift found — **not stale, no update needed**.
- `AUDIT-SUPPLEMENT.md`, `AUDIT-EVALUATION.md`, `docs/recovery/BASELINE_AUDIT.md`,
  `UX-AUDIT.md`: no sync/identity/storage-specific content found (checked).
- Noted but out of this area's scope (belongs to "App shell & routes" per
  the brief's module table, since `ProfilePanel.tsx` lives in
  `src/components/shell/`): `docs/SHAREABILITY-REVIEW-2026-08-14.md` §3
  reports the desktop (~1280px) Profile panel layout renders mostly
  off-canvas. Not re-verified or fixed here — flagging for whichever pass
  covers `src/components/shell/`.

---

## 4. Rollup

| Severity | Count | Fixed | Flagged |
|---|---|---|---|
| Blocker | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 2 | 1 (region download quota) | 1 (identity-before-verify) |
| Low | 2 | 0 | 2 (session secret ops gap; in-memory challenge store, no action needed) |
| **Total** | **4** | **1** | **3** |

Plus one resolved suspicion (§0: sync-controller.ts/encrypted-sync.ts wiring
— confirmed wired, not a finding requiring a fix).

**Fully resolved/archivable from this pass:**
- `docs/audit-deepseek-v4-pro.md` finding #9 (in-memory `PasskeyChallengeStore`)
  — was already "no action needed," remains true, safe to consider closed.
- The `PLAN_TONIGHT.md` sync-controller/encrypted-sync wiring suspicion —
  refuted with a full call trace; no further action needed on this specific
  item.

**Still open, needs the owner:**
- `docs/audit-deepseek-v4-pro.md` finding #5 (identity-before-verify) —
  `NEEDS YOUR DECISION`, recommended default: add a GC pass.
- `docs/SHAREABILITY-REVIEW-2026-08-14.md` §4 (`SWITCHBACK_SESSION_SECRET`)
  — needs owner confirmation of current production state, not a code fix.

**Not fully resolved (none of the other listed prior audit docs are made
archivable by this pass beyond the two items above)** — `AUDIT-SUPPLEMENT.md`,
`AUDIT-EVALUATION.md`, `docs/audit-mimo-v2.5-pro.md`,
`docs/recovery/BASELINE_AUDIT.md`, and `UX-AUDIT.md` simply had no
sync/identity/storage content to resolve either way.
