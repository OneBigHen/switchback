You are taking over an in-flight feature branch and finishing it. Work autonomously; ask me only
genuine product decisions, one question at a time, with your recommended default.

# Repo and branch

- Repository: `OneBigHen/switchback` (Next.js 16 / React 19 / MapLibre GL / TypeScript / zustand)
- Branch: `hermes/opengravel-recon-v1-planning-package-20260913-173838-03a74beb`
- Base: `origin/main` @ `44393de8` — branch is 13 commits ahead, never merged
- Draft PR: this PR. **Never merge it. Do not push to main.**
- Plan (authoritative, follow it): `docs/superpowers/plans/2026-09-13-opengravel-recon-v1.md`

# What is being built

**OpenGravel Recon** — a new, self-contained Labs experience at `/labs/recon` that makes the rides
and routes OpenGravel already owns feel extraordinary to explore. Four connected experiences:

1. **Explorer** — pitched, terrain-aware map of recorded rides + saved/catalog routes + known-gravel
   evidence + new-to-you portions. Default experience.
2. **Replay** — pick a real recorded ride, press play: real recorded GPS sequence animates, camera
   follows, HUD updates, scrub + camera modes.
3. **X-Ray** — synchronized factual breakdown of the selected ride (elevation, speed, curvature, GPS
   gaps, route-match confidence, surface evidence, photo/note events, new-to-you vs previously ridden).
   Visual, not a spreadsheet.
4. **Cinematic** — an art-directed, rider-following camera experience; Ultra comes only if it can be
   lazy-loaded without threatening the baseline.

The target reaction is *"Holy shit, that's my ride."* — not *"this is a useful GPX visualization."*
It is **not** a route planner, not a road-database admin UI, not an analytics dashboard.

# Current state — 2 of 8 phases accepted

Accepted head `3736237b` (the tip of this branch). Phase 1 (truth model + adapters) and Phase 2
(Gorgeous Explorer: pitched terrain map, layers, picker, HUD) are done:

`src/features/recon/` contains `types.ts`, `data/{recorded-ride-adapter,catalog-route-adapter,recon-track}.ts`,
`replay/replay-sampler.ts`, `map/{factory,style,terrain,ReconMap}`, `layers/{selected route, ride
history, gravel evidence}`, `ui/{Shell,HUD,Picker,picker-groups,format}`, `recon.css`,
`app/labs/recon/page.tsx`, `app/labs/recon/replay/[rideId]/page.tsx`, `tests/e2e/critical/recon.spec.ts`,
and 34 unit tests across `tests/unit/recon-data-adapter.test.ts` and `tests/unit/recon-replay-timeline.test.ts`.

**Remaining: phases 3–8.** Phase 3 is Replay (deck.gl), 4 New-to-you, 5 X-Ray, 6 baseline Cinematic,
7 Ultra (optional, lazy), 8 integration / a11y / memory-soak / final gates. Read the plan doc for the
task-level breakdown and gates per phase.

**Un-gated scaffolding to consider:** branch `wip/recon-phase3-scaffold` (`2aff8a94`) contains ~35
minutes of phase-3 Replay work that was interrupted: `replay/replay-timeline.ts`,
`replay/camera-director.ts`, `replay/exploration.ts`, `layers/create-replay-overlay.ts`,
`tests/unit/recon-camera-director.test.ts`, deck.gl added to `package.json`/`package-lock.json`, and
the removal of the old `replay-sampler.ts`. **None of it has passed a gate** — cherry-pick it if it
looks sound, otherwise start phase 3 fresh. Your call; say which you did.

# Non-negotiable boundaries

Recon consumes existing trusted data and presents it. Do **not**:

- add Recon state, animation loops, deck.gl objects, Three scenes, replay state or exploration state
  to `PlannerMapStage.tsx`, or turn `PlannerMapStage.tsx` into the Recon renderer
- create a second route-planning authority, another GPX parsing/intelligence pipeline, or reinterpret
  saved-route ownership
- modify route geometry in Recon
- disturb current routing, recording, planner, ownership, offline or advisor authorities

Renderer: **stay on MapLibre GL**, with map/style construction isolated behind a single factory.
The 3D stack (`three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`,
`3d-tiles-renderer`) is deliberately out of scope for V1; keep deck.gl. Record new decisions as a
**new** ADR — never edit an accepted one.

# How to verify (do this, don't assume)

Deterministic gates, in-repo:

```bash
npm run lint
npm run typecheck
npm run build
npx vitest run tests/unit/<relevant>.test.ts     # full: npm test
```

**Browser gate — run it on LXC 125, not locally.** Playwright hangs on the dev host (empty
`PLAYWRIGHT_BROWSERS_PATH`) and Next 16/Turbopack aborts the webServer if `node_modules` is a symlink:

```bash
# materialise the exact commit (an archive, not a live worktree), hardlink deps, then:
ssh root@192.168.1.236 "cp -al /root/Vibe/switchback/node_modules <worktree>/node_modules"
ssh root@192.168.1.236 "bash /root/og-verify/gates.sh <worktree> /root/og-verify/logs/<ts> build critical"
```

`gates.sh` gates: `install-scripts audit lint typecheck vitest build critical advisor webkit
roadlock pwa visual realrouter mobile`. Each writes `<gate>.log` and appends `rc=N <secs>s` to
`summary.txt`. `critical` needs `build` first. Current baseline on accepted head: **71/71 pass**.

Known repo traps: `PLAYWRIGHT_BROWSERS_PATH=0` is exported in root's profile on the dev host
(override it or use 125); the `visual` project boots a dev server on :3110 and a stale server breaks
it; never `--update-snapshots` the visual baselines locally (they are environment-sensitive — take
CI's actual instead).

Also keep an eye on the "new-to-you" truth rules when you reach phase 4: a reverse-direction historic
ride counts as previously ridden; a nearby but separate parallel road outside tolerance does not
count; no prior history must produce 100% new-to-you; identical history must produce ~0%; and source
geometry must be unchanged.

# Working agreement

- One commit per phase, RED → GREEN evidence (failing test first, then passing).
- All deterministic gates green before you call a phase done; run the browser gate per phase.
- Report in exactly three states: **AGENT WORKING / NEEDS YOUR DECISION / READY TO MERGE.**
- Keep the PR a draft. Zac merges, not you.
- When you finish a phase, comment on the PR with: phase number, commit, gate results, browser-gate
  result, and anything you deliberately deferred.

Start by reading the plan doc, then `src/features/recon/` as it exists, then tell me in one short
message: which phase you're starting, whether you're taking the `wip/recon-phase3-scaffold` work, and
anything in the plan you think is wrong.
