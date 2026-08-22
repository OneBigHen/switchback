# Switchback shareability review — 2026-08-14

Scope: make the current product safe to privately share, with no known-broken core paths.
Not a full v0.2 pass — community backend, encrypted sync, passkeys, multi-day planning, and
personal road-learning were touched only where they blocked the core flow.

Core flow tested: open app → search/pin destination → choose profile → route renders → save →
export GPX → ride mode → navigation/HUD, on **https://ride.henning.rodeo** in a real Chromium
browser, desktop (1280×900) and mobile (390×844) viewports.

All commands below were re-run at the end of this session against the final commit
(`2bfbee5`) and passed. Nothing in this report is asserted without command output or a
screenshot behind it.

---

## 1. Verified working — with evidence

| Item | Evidence |
|---|---|
| `npm run lint` | `eslint . --max-warnings=0` — exit 0, no output |
| `npm run typecheck` | `tsc --noEmit` — exit 0, no output |
| `npm test` | vitest — **209 test files, 1307 passed, 1 skipped** |
| `npm run test:e2e:critical` | Playwright, chromium+webkit — **32/32 passed** (3.8m) |
| `npm run build` | Next.js 16.3.0 production build — exit 0, all 30 routes compiled |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| Core flow, live, desktop | Search "New Hope, PA" → Scenic profile → route rendered (9.2 mi/20 min, quality 54) → Save route → Export GPX (valid GPX 1.1, 251 lines) → Start ride → HUD loaded with honest "GPS fix required" state (headless browser has no location) — no console errors beyond a pre-existing third-party CSP block (§4) |
| Core flow, live, mobile (390×844) | Home, planner sheet, and Library all render correctly |
| Live deploy = current HEAD | Confirmed and fixed — see §5 |
| Real public TLS | Google Trust Services cert (`CN=henning.rodeo`), terminated at Cloudflare edge, valid to 2026-09-18 |
| XXE | No server-side XML parsing of untrusted input found — see §4 |
| SSRF | No user-controlled outbound request targets found — see §4 |
| WCAG 2 A/AA (axe-core, home + Library) | 0 violations after fixes (was 2) — see §2 |

Screenshots from this session (desktop + mobile, each core-flow step) were sent as files
during the session rather than embedded here.

---

## 2. Fixes made this session (exact files changed)

All six commits are local, on `main`, not yet pushed (see §6).

### `c771bc6` — **Library tab crashed on every visit in production** (found live, not previously known)
The public `/api/gpx-library` endpoint intentionally redacts `sourceFile`/`sources` (they
contain host filesystem paths — see the comment in `handler.ts`), but
`ProjectGpxRouteSummary` declared both fields required, and
`src/lib/gpx/library-view-model.ts` spread `route.sources` unconditionally. Every one of the
419 routes in the live catalog was missing that field, so opening the Library tab threw
`TypeError: e.sources is not iterable` and fell into the app's error boundary
("This page couldn't load") — reproduced live before the fix, confirmed fixed after.
- `src/lib/gpx/catalog.ts` — `sourceFile`/`sources` now optional, documented why
- `src/lib/gpx/library-view-model.ts` — 3 call sites default to `[]`
- `src/components/planner/LibraryDrawer.tsx` — guard `.sourceFile.split(...)`
- `tests/unit/gpx-library-view-model.test.ts` — added a regression test using routes shaped
  like the real redacted API response (nothing previously exercised that shape)

### `3c96446` — gitignore gap (requested, §7)
`data/*.sqlite-wal` / `data/*.sqlite-shm` were never ignored, only the base `.sqlite`/`.db`
files were. `data/community.sqlite-wal`, `data/sync.sqlite-wal`,
`data/passkey-options-e2e.sqlite-shm`, etc. were live on disk and would have been staged by
`git add -A`. Added scoped and repo-wide `*.sqlite-wal`/`*.sqlite-shm` patterns (plus `.db-wal`/
`.db-shm`), and ignored `.playwright-mcp/`/`live-shots/` (this session's browser-testing
artifacts). Verified with `git check-ignore -v` against the live files.

### `1ee4fb8` — added `docs/phase-reports/P01–P28.md`
These were referenced by the already-committed P29–P36 recovery commit (`5c6edc9`) but were
never committed themselves. Scanned for secrets before staging (none found).

### `7a9cec1` — 2 WCAG 2 A/AA violations (axe-core scan, requested, §…P1)
- `AppNavigation.tsx`: `<div aria-label="Switchback">` — invalid, a `div` with no role can't
  carry an accessible name via `aria-label`; the visible "Switchback" text already names it.
  Removed the attribute.
- `LibraryDrawer.tsx` + `library-drawer.css`: the "Import as lock" control nested a focusable
  `<input type="file">` inside a `<button>` — an invalid nested-interactive pattern (serious
  impact). Moved the input to a sibling of the button, visually hidden, still triggered via
  ref; verified visually unchanged (screenshot) and functionally unchanged (18 component
  tests still pass).
- Verified live: axe-core (`wcag2a`,`wcag2aa` tags) on home and Library: **2 → 0 violations**.
  Scan covered home and Library only, not every screen (see §3).

### `2bfbee5` — offline routing beta/accuracy disclosure (requested, P1)
Offline regional routing measured **89.9% accuracy** against the live GraphHopper oracle
(12/208 comparisons >25% off — `docs/phase-reports/P36-production-release.md`), shipped with
**no disclosure to the rider**. Given the goal's three options (improve / label / disable), a
full accuracy fix is out of scope for this pass (needs regraphing) and full disable removes a
working feature riders may want, so I added an explicit disclosure instead:
- `RegionDownloadsPanel.tsx` — added a "Beta: offline routing has measured accuracy gaps…"
  line where riders opt into downloading offline regions.
- `useNavigationSessionController.ts` — reworded the mid-ride status string from "Offline
  corridor recovery · guidance continues" to "Offline routing (beta) · verify turns, accuracy
  varies", shown at the exact moment a rider's guidance falls back to the offline graph.

This is a disclosure change, not an accuracy fix — the underlying 89.9%/12-outlier number is
unchanged. Rebuilt, redeployed, and re-verified (lint/typecheck/targeted tests) after each fix
above; full lint/typecheck/test/e2e-critical/build chain re-run clean at the end (§ intro).

---

## 3. Still broken or unverified

- **Profile panel desktop layout (~1280px wide)**: navigating to the Profile tab at a
  1280×900 viewport renders most of the panel's content (rider profile card, "Offline
  regions" button, etc.) invisible/off-canvas — only two floating buttons ("Sync now",
  "Import recovery seed") appear directly on the map, with no visible card. No console error;
  this is a CSS/layout issue, not a crash. Not part of the explicit core flow, so I did not
  chase the root cause given remaining time — screenshot evidence captured
  (`live-shots/07-profile-desktop.png`, sent this session). The existing e2e-critical desktop
  layout test only checks the Plan tab, so this gap wasn't caught by CI. **Recommend a
  follow-up pass before wide sharing**, since Profile/Offline-regions is where a new user
  would go to set up offline routing.
- **WCAG scan coverage**: axe-core ran against home and Library only. Ride HUD, route-result
  detail panel, Record, and the (broken) desktop Profile panel were not scanned.
- **Offline routing accuracy itself**: still 89.9%/12-outlier as measured in P36; only the
  *disclosure* was added this session, not a fix.
- **P36 rollback/release-freeze runbook**: confirmed it exists
  (`docs/phase-reports/P36-production-release.md`) but was never exercised, and I did not
  exercise it this session — the runbook's own "open gates" section already documents this
  as aspirational (real authenticated-browser/passkey drills, field rides, and forced
  dependency upgrades all still open). Treat as **unverified**, not passing.

---

## 4. Security findings

- **`SWITCHBACK_SESSION_SECRET` is not set in production** (`/etc/switchback/switchback.env`
  has `SPOTIFY_CLIENT_ID`/`SPOTIFY_SESSION_SECRET` — leftovers from the removed Spotify
  integration — but no `SWITCHBACK_SESSION_SECRET`). Effect, traced in code:
  - `createIdentitySession` (`src/lib/identity/passkey.ts:100`) throws if the secret is
    under 32 chars, so **passkey registration/login (`/api/identity/*/verify`) currently
    500s in production**.
  - `readIdentitySession` fails closed (returns `null`, i.e. "not logged in") rather than
    using a weak/empty key — no session-forgery risk from the missing secret.
  - `hasValidMutationCsrf` (community publish CSRF) does **not** depend on this secret —
    unaffected.
  - Net effect: passkey sign-in is broken, not insecure. Passkey testing is explicitly
    out of scope for this pass, but **you should set `SWITCHBACK_SESSION_SECRET` to a
    32+ char random value in `/etc/switchback/switchback.env` before anyone relies on
    passkey sign-in or community publish under an identity.**
  - The stale `SPOTIFY_*` env vars are otherwise inert (the Spotify integration was already
    removed from the code in `5c6edc9`) — safe to delete, your call.
- **TLS**: real public cert (`Google Trust Services`, `CN=henning.rodeo`, valid to
  2026-09-18), terminated at the Cloudflare edge. No `tls internal` anywhere in this path —
  there is no local Caddy for this app; Cloudflare's tunnel daemon (`cloudflared`,
  configured Cloudflare tunnel) proxies `ride.henning.rodeo` directly to
  a private loopback/LAN origin, i.e. origin traffic is plaintext HTTP inside the tunnel, which
  is the standard/expected Cloudflare Tunnel model (the tunnel itself is the encrypted
  transport — there's no separate local Caddy config for this app to inspect).
- **`TRUST_CF_CONNECTING_IP`**: not set in production — `cf-connecting-ip` is **not** trusted
  by the rate limiter (`src/lib/server/rate-limiter.ts:49`), so no client-IP spoofing risk
  from that header. (This does mean rate-limiting currently keys off whatever IP the tunnel
  daemon presents, not the real visitor IP — a rate-limit granularity tradeoff, not a
  security hole.)
- **XXE**: audited every XML/GPX/KML parse path in the current code
  (`src/lib/routing/gpx-import.ts`, `src/workers/route-import.worker.ts`). All GPX/KML/KMZ
  parsing runs **client-side** (browser `DOMParser`, or `linkedom/worker` inside a Web
  Worker) — neither resolves external entities/DTDs by default, and no server-side code path
  parses untrusted XML. The one server GPX endpoint that touches XML
  (`/api/community/routes/[routeId]/gpx`) only *generates* GPX from internal data — no
  parsing of external input. No XXE surface found.
- **SSRF**: audited every outbound `fetch()` server-side
  (`road-matching/handler.ts`, `geocoding/photon.ts`, `geocode/route.ts`,
  `place-ideas/route.ts`, `ride-corridors/route.ts`). Every target host is a
  server-configured constant (`GRAPHHOPPER_URL`, `PHOTON_URL`, or a hardcoded Google Places
  endpoint) — user input only ever populates query parameters, never the host/URL itself.
  `src/proxy.ts` (despite the name) is Next.js middleware that redirects to a fixed
  `PUBLIC_SWITCHBACK_HOST` constant, not a request proxy. No SSRF surface found.
- **Cloudflare beacon CSP block** (cosmetic, not a vulnerability): every page load throws one
  console error — the zone-level Cloudflare Web Analytics beacon
  (`static.cloudflareinsights.com/beacon.min.js`) is blocked by the app's own
  `script-src 'self' 'unsafe-inline'` CSP. This is the CSP working as intended; if you want
  the beacon, it needs an explicit CSP allowance; if you don't, it's already blocked. Left
  as-is.

---

## 5. Live deployment / commit state

- **Before this session**: the running `switchback-cloudflare` process had started
  2026-08-13 00:42:12, but local `main` had advanced 6 commits past that point (through
  `54896d8`, including the P29–P36 Spotify-removal recovery commit) — **the live site was
  running stale code**, silently, with no drift detection. `/api/health` reported healthy
  throughout, which is exactly why this kind of drift is easy to miss.
- **Fixed**: rebuilt (`npm run build`) and `systemctl restart switchback-cloudflare`; verified
  `/api/health` non-degraded immediately after.
- **Final state**: live deploy is `2bfbee5` (this session's last commit), `git rev-parse HEAD`
  matches, service `active (running)`, `/api/health` → `{"ok":true,"degraded":false}`,
  GraphHopper and Valhalla both healthy.
- **Recommendation**: the systemd unit has no post-deploy health check or drift alarm —
  consider a cron/monitor that diffs the running process's start time against the latest
  commit time, since this drift was silent for ~2 days.

---

## 6. Git / worktree state

- Branch `main`, **8 commits ahead of `origin/main`** (was 3 at session start; this session
  added `c771bc6`, `3c96446`, `1ee4fb8`, `7a9cec1`, `2bfbee5`).
- **Not pushed** — awaiting your go-ahead per instructions.
- Working tree still has pre-existing, **unstaged** changes from before this session that I
  did not touch (need your call, not mine):
  - `artifacts/screenshots/*.png` (16 modified, likely e2e visual-baseline drift from test
    runs) and 9 deleted `spotify-*`/`intent-planner-*-spotify-*` screenshots, plus
    `design/generated/v1/mobile/10-spotify.png` deleted and `design/DESIGN-CONTRACT.md` /
    `design/generated/v1/SHA256SUMS` modified. These look like leftover cleanup from the
    Spotify-removal work in `5c6edc9` that never got committed. I left these alone since
    committing/discarding binary assets on your behalf wasn't something I was asked to
    decide.
- **Untracked, left as-is**:
  - `switchback-production-master-spec-2026-08-10.zip` (and 3 sibling ZIPs are already
    tracked in git, unlike this one) — per your instruction, not deleted. **Recommend
    relocating all 4 legacy ZIPs to `docs-legacy/`** if you want them out of repo root; ask
    first since it's a repo-structure change.
  - `AGENTS.md`, `CLAUDE.md` at repo root — both appeared during this session's `npm run
    build` (timestamps match exactly), auto-generated by the Next.js 16 toolchain
    ("agent rules" scaffolding). Never previously tracked. Your call whether to commit,
    gitignore, or delete.
- `data/` (gitignored SQLite DBs, `.osm.pbf` extracts, GraphHopper graph caches) is correctly
  fully untracked after the `.gitignore` fix (§2) — verified with
  `git status --porcelain --ignored=no -uall data/` returning nothing.

---

## 7. Known out-of-scope limitations (per your instructions)

- Physical WebAuthn/passkey testing — not performed. Note §4: passkey sign-in is currently
  broken in production (missing secret), independent of physical-device testing.
- Physical iPhone field rides — not performed.
- Multi-device encrypted-sync recovery — not exercised.
- Community backend completion — untouched beyond the Library crash fix, which was a
  client-side rendering bug, not a backend change.
- Full multi-day planning — untouched.
- Personal road-learning — untouched.
- P36 rollback runbook — not exercised (§3), matches the runbook's own "open gates" section.

---

## 8. Exact actions you still need to perform

1. **Decide on `SWITCHBACK_SESSION_SECRET`**: generate a 32+ char random value and set it in
   `/etc/switchback/switchback.env`, then restart `switchback-cloudflare`, if you want
   passkey sign-in or identified community publishing to work. Optionally delete the stale
   `SPOTIFY_*` vars in the same file.
2. **Review and decide on the pre-existing screenshot/design-asset diffs** in
   `artifacts/screenshots/` and `design/generated/` (§6) — commit, regenerate, or discard;
   I did not touch these.
3. **Decide on the 4 root-level legacy ZIPs** — leave in place, or say the word and I'll move
   them to `docs-legacy/` (not delete).
4. **Decide on `AGENTS.md`/`CLAUDE.md`** at repo root (auto-generated by Next.js 16 this
   session) — commit, gitignore, or delete.
5. **Say go/no-go on pushing** the 8 local commits (3 pre-existing + 5 from this session) to
   `origin/main`. I have not pushed.
6. **Follow up on the Profile-panel desktop layout bug** (§3) before wide sharing —
   screenshot evidence is in the session's sent files.
7. **Decide the offline-routing product call**: this session added a beta/accuracy
   disclosure (§2); the underlying 89.9%-accuracy gap is unresolved. Decide whether that
   disclosure is enough for your bar, or whether you want it disabled or improved before
   sharing.
