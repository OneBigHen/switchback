# Fresh Opus handoff — beta convergence after janitorial audit

Updated: 2026-09-08

This is the recommended entrypoint for a **fresh high-budget Opus/Claude Code session** after PR #86 was opened. It does not replace `AGENTS.md`, ADRs, Astra contracts, `BETA-STATE.md`, `BETA-CONVERGENCE.md`, or `AGENT-TASKS.md`; it gives the new coordinator the current integration order so it does not revive stale work or combine unrelated risk.

## Current GitHub state to reconcile first

- `main` remains at `b53c177c1620098bfa00883257eae245411a6f5c` after PR #83.
- PR #86 `chore/janitorial-audit-20260908` is open and mergeable. It is a very large deletion-only/behavior-neutral cleanup: 51.2 MB and 591 tracked files removed, dead V1 CSS/tests/tooling/history retired, `better-sqlite3` migrated to `node:sqlite`, and retained authorities documented. It was locally verified across lint/typecheck/unit/build/visual/critical/WebKit/road-lock/advisor/PWA and scratch-merged with #82 successfully.
- PR #82 `implement/map-system-phase1` is open and mergeable. It establishes one canonical `road | terrain | satellite` map-presentation model but its Quality `verify` job is blocked by dependency audit.
- PR #85 is this beta convergence control plane and remains draft. Rebase it only after the integration base below settles.
- PRs #66, #80 and #81 are stale/stacked drafts. They are **salvage sources**, not merge candidates.

## Important new sequencing correction

Do **not** merge #86 first just because its local functional gates are green. Its required Quality job inherits the repository's existing supply-chain failure. Do not bypass the audit gate and do not mix a breaking map-library security migration into a 615-file janitorial PR merely to turn CI green.

Recommended sequence:

1. **Security lane first, isolated.**
2. **Rebase/verify/merge #86 janitorial cleanup.**
3. **Rebase/verify/merge #82 canonical map presentation.**
4. **Rebase/update/merge #85 beta control plane.**
5. **Execute the beta truth/debloat/architecture queue from the now-clean main.**
6. **Salvage then close #66/#80/#81 rather than merging them wholesale.**

If exact evidence discovered during execution makes a different order safer, record the reason before changing it.

---

# Phase 0 — inspect before mutating

Start from `/root/Vibe/switchback` and establish facts:

```bash
cd /root/Vibe/switchback
git status --short
git branch --show-current
git fetch --all --prune
git log --oneline --decorate -12 --all
git stash list
find . -maxdepth 3 -type f \( -name '*security*patch*' -o -name '*.patch' \) -print | sort
```

Then read, in this order:

1. `AGENTS.md`
2. `docs/beta/FRESH-OPUS-HANDOFF.md`
3. `docs/beta/BETA-STATE.md`
4. `docs/beta/BETA-CONVERGENCE.md`
5. `docs/beta/DEBLOAT-AUDIT.md`
6. `docs/beta/AGENT-TASKS.md`
7. `docs/superpowers/plans/2026-09-08-beta-convergence.md`
8. ADR 0015 / current map ADRs
9. `docs/COMPATIBILITY.md` and ADR 0024 once #86 is in the local branch being reviewed

Before changing product code, compare live GitHub state with these documents and update stale state rather than silently following it.

## Agent discipline

Use one coordinator. Delegate only bounded independent work to cheaper agents and give each worker:

- exact OWN files;
- READ-only context;
- DO-NOT-CHANGE boundaries;
- rider/problem statement;
- required RED test/evidence;
- exact verification command;
- expected return format.

Writing workers use isolated worktrees/branches. Do not allow parallel writers to overlap `package.json`/lockfile, `PlannerShell`, `PlannerMapStage`, `PlannerDeck`, `PlanComposer`, map renderer files, or canonical RideIntent/store code.

Cheap agents are appropriate for read-only salvage inventories, dependency-tree analysis, CSS dead-rule inventory, focused unit-test RED cases, stale-reference searches, and static accessibility review. The coordinator retains architecture, integration, conflict resolution and final verification.

---

# Phase 1 — resolve dependency/security gate in its own PR

The janitorial session reported local work named `deps/security-advisories-20260908`, but GitHub currently has **no remote branch by that name**. It may exist only in local stash/patch material. Recover and inspect it; do not blindly apply it onto the janitorial branch.

Create/recreate a dedicated security branch from current `main` unless recovered work proves a safer base:

```bash
git switch main
git pull --ff-only
git switch -c deps/security-advisories-20260908
npm ci
npm audit --audit-level=moderate
```

Classify the **current exact audit output**. Known findings from recent runs include:

- `vitest@4.1.10` / `@vitest/mocker`: moderate; patched by the next compatible Vitest patch reported by npm (recent CI reported 4.1.11).
- `maplibre-gl@5.24.0`: critical XSS sanitizer bypass; patched only in the v6 line beyond affected versions, therefore a real migration rather than a lockfile tweak.
- The janitorial session also reported `js-yaml` / `sharp` advisories in its current lockfile. Re-run the audit and prove whether they are direct, transitive, dev-only, reachable, and what patched compatible path exists. Do not rely on the older two-advisory snapshot if npm now reports more.

### Security task boundaries

Prefer separate commits and independently reviewable changes:

1. low-risk patch/minor dependency fixes (Vitest and compatible transitive fixes);
2. MapLibre v6 migration and compatibility tests;
3. any remaining advisory only after dependency-tree evidence.

Do not run `npm audit fix --force` and accept whatever graph it produces.

### MapLibre migration requirements

MapLibre is still the declared rollback/default renderer when premium Mapbox is unavailable. If it stays:

- migrate from v5 to a patched v6+ release deliberately;
- review ESM/bundling and worker behavior under Next.js;
- migrate missing-style-image handling to the v6 contract rather than assuming the old `styleimagemissing` callback behavior remains correct;
- verify WebGL2/platform support against the beta device floor;
- verify `MapStage` fallback selection, style changes, route fitting, map resize, attribution, sketch drawing, layer ordering, PWA and WebKit;
- keep map evidence/route geometry authoritative and unchanged.

If you conclude MapLibre should be removed instead, STOP and treat that as an ADR/rollout decision: prove Mapbox availability, token policy, offline/rollback behavior, production deployment and device coverage before deleting the fallback.

### Security exit gate

At exact security head:

```bash
npm ci
npm run verify:install-scripts
npm audit --audit-level=moderate
npm run lint
npm run typecheck
npm test -- --reporter=dot
rm -rf .next && npm run build
npx playwright test --project=critical-chromium --project=critical-webkit-smoke --project=road-lock
npm run test:e2e:pwa
npx playwright test --project=visual
```

Run real-router/map-specific suites required by the touched renderer contract. Open a focused PR. Do not claim complete until CI is green on the exact head.

---

# Phase 2 — janitorial PR #86

After the security PR lands, rebase `chore/janitorial-audit-20260908` onto secure `main`.

Because both the security work and #86 touch dependency files, **re-resolve the dependency graph** instead of choosing one side of the lockfile textually:

```bash
git switch chore/janitorial-audit-20260908
git fetch origin
git rebase origin/main
npm install
npm ci
npm audit --audit-level=moderate
```

Review the resulting dependency diff intentionally. Re-run all #86 exact-head gates, especially:

- install-script policy;
- offline builder smoke/A-B equivalence if the `node:sqlite` migration changed during rebase;
- full Vitest;
- production build;
- visual 60/60 with **zero baseline moves unless an independently justified product change exists**;
- critical Chromium/WebKit/road-lock/advisor/PWA;
- CI required checks including real-router.

Do not continue deleting CSS in this PR. The remaining 108 candidate dead rules are intentionally deferred because live global CSS requires batch-and-visual verification.

If exact-head GitHub checks are green and the diff still matches the behavior-neutral janitorial manifest, merge #86.

---

# Phase 3 — canonical map PR #82

Rebase `implement/map-system-phase1` onto the now secure + clean `main`.

The MapLibre v6 security migration may alter the renderer seam #82 touches, so this must be a semantic rebase, not just conflict resolution.

Re-check:

- `road | terrain | satellite` is the one basemap authority;
- no duplicate Topo/Terrain/Satellite overlay basemaps return;
- Mapbox Standard config keys remain schema-valid (`show3dObjects`, not invented product-named keys);
- Standard Satellite only receives capabilities it supports;
- legacy map experience IDs stay at storage boundaries only;
- map style switches do not create unintended map remount/load churn;
- sketch/route fit and follow camera measure the actual map viewport;
- `MapStylePreview` stays truthful and does not imply unsupported presentation;
- MapLibre fallback works on the patched version if it remains the fallback.

Run required CI + visual + real-router + mobile gates at exact head. Merge #82 only when green.

---

# Phase 4 — rebase and land the beta control plane #85

Rebase `chore/beta-convergence-control-plane` onto the new `main` after #86/#82.

Update these files so they describe reality rather than the old `b53c177` checkpoint:

- `docs/beta/BETA-STATE.md`
- `docs/beta/BETA-CONVERGENCE.md`
- `docs/beta/AGENT-TASKS.md`
- this handoff

Mark security, janitorial and map integration with exact merged SHAs/workflow evidence. Keep the beta verdict **HOLD** until the product/physical gates are genuinely complete.

Then merge #85; from that point `docs/beta/` is the current execution control plane rather than an isolated draft.

---

# Phase 5 — execute beta convergence, not another feature wave

After integration, work from current `main` in small PRs. Re-rank after each merge.

## First product-truth queue

Execute the existing BETA tasks in priority order, starting with RED tests:

1. **BETA-010 toll-policy coherence** — natural-language request, canonical RideIntent, request builder, visible control and Undo agree.
2. **BETA-011 segment-profile stale-state attack** — fresh topology cannot inherit incompatible per-leg styles.
3. **BETA-012 `Best Ride` truth** — labels follow deterministic selection/evidence, never profile heuristics.
4. **BETA-013 recorded-duration provenance** — planned duration is never represented as actual recorded elapsed time.
5. **BETA-014 truthful route imagery** — specific rides use actual stored geometry or explicit unavailable fallback, never seeded/procedural fake lines.

## Debloat/product hierarchy queue

Do not delete useful backend capability just because the current surface is crowded. Simplify the rider journey:

- `Prepare ride` should not remain a junk drawer.
- hard conflicts/warnings + Start remain primary;
- concise route readiness stays near the decision;
- detailed evidence/weather/offline become contextual;
- GPX join appears only for applicable tracks;
- multi-day staging becomes an explicit subflow;
- rating moves post-ride;
- private share + public publish become one intentional Share flow with one privacy setup;
- export format appears after choosing Export;
- arbitrary route-detail ordering/hiding is a beta defer/hide candidate until the default hierarchy is stable.

Preserve data/evidence semantics while changing prominence.

## Architecture queue

Do not assign broad `refactor PlannerShell` or `refactor PlannerMapStage` tasks.

Use behavior-neutral seams:

1. extract one planning/replan/cancel lifecycle from `PlannerShell`;
2. group `PlanComposer` model/command props around existing typed view-model boundaries;
3. extract Free Ride orchestration only before changing Free Ride behavior;
4. give `PlannerMapStage` one exclusive interaction owner/state machine for idle/place-start/place-finish/add-stop/sketch/avoid-area/road-lock/route-sculpt;
5. retire additional global CSS only in small visual-verified batches.

No second planner, second route authority, model-authored geometry, model-authored raw GraphHopper policy, second AI gateway, vector DB, LangGraph or generic framework layer.

---

# Phase 6 — salvage stale drafts, then close them

Use cheap/read-only workers in parallel to inventory #66, #80 and #81. Produce a KEEP / PORT / REWRITE / DROP ledger by capability/commit.

### #66 Rides intelligence

Likely salvage candidates:

- geometry-derived region/facts;
- deterministic road-name extraction;
- density-invariant route measurements;
- focused tests.

Do not automatically port:

- separate Goblin search UI;
- route generation inside Rides;
- invented route imagery;
- permanently PA-specific product taxonomy.

### #80 ride preference vector

Keep only if its `Curves / Scenery / Gravel / Technicality / Elevation / Highway aversion` abstraction becomes a bounded typed adapter to canonical RideIntent/commands. It may not become another planner authority.

### #81 route memory

Salvage deterministic fingerprints/search/confidence/support semantics after Rides facts settle. Do not inherit the whole stacked UI/model-slot architecture automatically.

Port useful slices onto fresh branches from current `main`; do not rebase and merge the old PR wholesale. Close stale drafts once every retained capability has a destination or explicit rejection rationale.

---

# Final beta gate

Do not call Switchback beta-ready solely from automated tests.

The exact deployed candidate must also prove at minimum:

- build/deployed SHA identity;
- real iPhone installed-PWA behavior;
- safe-area + short-landscape layout;
- keyboard/accessibility alternatives for editing flows;
- background/foreground GPS/session continuity;
- weak/no-network recovery;
- real off-route/reroute recovery;
- Free Ride → suggestion acceptance → Head Home without losing recording or hard constraints;
- daylight/mounted/glove glanceability where practical;
- one real safe road ride;
- one fresh black-box Luna human QA run against the **same deployed SHA**.

Keep verdict HOLD until those claims have actual evidence.

## Coordinator return format after each meaningful PR

Return:

1. exact base/head SHA;
2. rider problem solved;
3. authority/complexity removed or added;
4. RED evidence;
5. implementation summary;
6. adversarial findings;
7. exact verification results;
8. physical evidence status if relevant;
9. branch/PR action taken;
10. **one recommended next task**.

Do not start five next tasks at once. The goal is convergence, not activity.
