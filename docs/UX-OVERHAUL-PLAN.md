# Switchback UX/UI Overhaul — Multi-Phase Execution Plan

**Target:** A motorcycle route planner that rivals Google Maps in density, cohesion, and
polish — without becoming Google Maps. Switchback's edge is *road character* (twistiness,
surface, evidence), not POI search. The UI must make that edge legible at a glance.

**Status:** Authored 2026-08-15. Baseline commit `8e7cbdb`. Live at https://ride.henning.rodeo.

---

## 0. How to use this document

This plan is written to be executed by AI coding agents (Sonnet-class and cheaper) working
mostly **one task at a time**. Every task is self-contained: it names the exact files, the
exact change, the acceptance criteria, and the command that proves it.

### Rules every agent must follow

1. **Evidence before "done."** Never claim a task is complete without pasting the output of
   its verification command, or attaching the screenshot it asks for. A task with no evidence
   is not done.
2. **One task per commit.** Commit message format: `<type>: <what> (<TASK-ID>)`.
   Types: `fix`, `refactor`, `feat`, `chore`, `docs`, `test`.
3. **Never break the gate.** Before every commit:
   `npm run lint && npm run typecheck && npm test`
   Full gate before every phase handoff:
   `npm run lint && npm run typecheck && npm test && npm run test:e2e:critical && npm run build`
4. **Visual changes require visual proof.** Screenshot before and after, at BOTH
   desktop (1440×900) and mobile (390×844). A passing test suite does **not** prove a
   visual change worked — the Profile-panel outage (TASK-1.1) passed every test while being
   completely invisible to users.
5. **Do not invent design.** The visual world is already decided (§2). Changes conform to
   the token system. If a task seems to require a new color, spacing value, or font — stop
   and flag it; do not add a one-off hex.
6. **Preserve behavior.** This is a UI overhaul, not a rewrite. Routing logic, offline
   behavior, privacy/redaction rules, and API contracts stay as they are unless a task says
   otherwise explicitly.
7. **Ask before destructive git ops or pushing to origin.**

### Deploy / verify loop (for tasks that need live verification)

```bash
npm run build
sudo systemctl restart switchback-cloudflare
sleep 3
curl -s https://ride.henning.rodeo/api/health   # expect {"ok":true,"degraded":false,...}
```
Then screenshot the live URL with Playwright at both viewports.

### Definition of "rivals Google Maps"

Concretely, measurable, and used as the acceptance bar throughout:

| Dimension | Google Maps behavior | Switchback target |
|---|---|---|
| Map visibility | Map is the product; chrome floats over it | Map never below ~55% of viewport on desktop; panel is content-sized, not viewport-sized |
| Control grouping | Related controls share ONE joined surface | Max 3 floating clusters per viewport corner-system, each a single surface |
| List density | Result rows ~56–72px, scannable | One shared row-height token; no two list types differing by 10px for no reason |
| Progressive disclosure | Search collapses once you have a result | Post-plan, search hero collapses to a one-line summary |
| Chrome-to-content | Almost no decorative labels | Zero decorative eyebrows; headings carry meaning |
| Consistency | One visual system | One token system, one era of CSS |

---

## 1. Baseline: measured state of the codebase

All numbers verified 2026-08-15 on commit `8e7cbdb`. Re-measure after each phase.

### CSS
| Metric | Value | Problem |
|---|---|---|
| Total CSS | **11,512 lines** across 20 files | Very large for 41 components |
| `responsive.css` | **5,113 lines (44% of all CSS)** | Misnamed god-file; contains a whole dead design era |
| Distinct hex colors | **245** (542 occurrences) | Token system exists but is bypassed |
| `!important` | **39** | Specificity war between eras |
| `@media` blocks | **54** (27 in `responsive.css` alone) | Breakpoint logic scattered |

### Components
| File | Lines | Note |
|---|---|---|
| `PlannerShell.tsx` | 1,602 | God component |
| `MapStage.tsx` | 1,560 | God component |
| `PlannerDeck.tsx` | 880 | Too large |
| `RegionDownloadsPanel.tsx` | 735 | Too large |
| `LibraryDrawer.tsx` | 692 | Too large |
| Total | 41 components, 9,902 lines | |

### The core structural problem: two overlapping CSS eras

The app contains **two complete, conflicting visual systems** layered on top of each other:

- **Era A (dead/legacy):** a warm cream + Georgia-serif + italic system, living mostly inside
  `responsive.css`. Largely overridden and invisible, but still shipping to users and still
  fighting for specificity.
- **Era B (active):** the dark "machined instrument" system in `switchback-v1.css` +
  `planner-shell.css` + `design-system.css`, matching `design/DESIGN-CONTRACT.md` v1.1.0
  (Sora display / DM Sans body).

Every layout bug in this plan traces back to this. **Phase 2 is the highest-leverage work in
the document** — most later phases get dramatically cheaper once one era is gone.

### Known "AI slop" tells present (per the project's own installed design skill)

The repo now has the Impeccable design skill installed at `.claude/skills/impeccable/`
(Apache-2.0). Its `reference/craft-floor.md` bans several patterns this codebase uses:

| Tell | Count | Locations |
|---|---|---|
| Decorative eyebrow/kicker above a heading (**explicit ban, no brief earns it back**) | **20** | See TASK-4.1 for the full list |
| Georgia/Times serif as display face | 3 rules | `responsive.css:3895, 4146, 4168` |
| Italic body/input text | 1 rule | `responsive.css:3977` |
| Layout-property transitions (`width`/`height`/`padding`) | 7 rules | See TASK-8.1 |

Run the detector any time: `node .claude/skills/impeccable/scripts/detect.mjs --json src/components src/app`

---

## 2. The visual system (non-negotiable reference)

Source of truth: `design/DESIGN-CONTRACT.md` v1.1.0 and `src/app/styles/design-system.css`.

- **Display / headings:** Sora, weight 600. **Never** Georgia, Times, or any serif.
- **Body / controls / telemetry:** DM Sans, 400/500. Telemetry uses
  `font-variant-numeric: tabular-nums lining-nums`. **Never italic.**
- **Tokens:** spacing `--sb-space-1..10` (4px base), `--sb-touch-target: 44px`,
  radii `--sb-radius-control|card|sheet`, motion `--sb-motion-sheet`.
- **Color:** semantic tokens only (`--sb-canvas`, `--sb-surface`, `--sb-surface-raised`,
  `--sb-text`, `--sb-text-muted`, `--sb-border`, `--sb-action`, `--sb-focus-fill`,
  `--sb-shadow`), light + dark defined.
- **Product character:** an instrument for riders, not a dashboard. Dense, legible at a
  glance, honest about data confidence. Brand lives in precise details, not decoration.

**Mode:** every screen here is **Operate** (the visitor completes a task). Per the design
skill: scanability, consistency, and the real usage scene (gloved hands, sunlight, motion)
outrank expression.

---

## PHASE 0 — Safety net (do this first)

**Goal:** Make it impossible to repeat the Profile-panel class of failure, where a feature is
100% broken while every automated test passes.

**Why first:** Phases 2–3 move thousands of lines of CSS. Without visual regression coverage,
that work is uninsurable.

### TASK-0.1 — Visual regression harness for all primary screens [DONE 2026-08-15, commit 7a3b706]

**Execution notes (diverges from plan prose, not from intent):**
- Prerequisite fix landed first (commit 2dcd733): `npm run lint` was already
  broken on main before this plan started -- the Impeccable skill's vendored
  scripts under `.claude/.github/.opencode/skills/` weren't excluded from
  ESLint, producing 304 warnings against `--max-warnings=0`. Fixed via
  `eslint.config.mjs` `globalIgnores`.
- Heavy Playwright/build work moved to the routing test LXC (LXC 143 on
  a private validation host, reached via `ssh <validation-host> "pct exec 143 -- ..."`) at the user's
  request, to avoid loading the coding session's own host. A clean sibling
  clone lives at `/path/to/switchback-ux` on that LXC (kept separate from
  its existing `/path/to/switchback` checkout, which has unrelated
  uncommitted WIP from a different workstream on the backend routing spec).
  Baselines are generated/verified there, then pulled back into this repo.

- **Files:** `tests/e2e/visual/` (new), `playwright.config.ts`
- **Do:** Add a Playwright project `visual` that, for each primary screen — Plan (empty),
  Plan (route result), Library, Record, Profile, Ride HUD — captures a screenshot at
  1440×900 and 390×844 and asserts against a committed baseline
  (`toHaveScreenshot`, `maxDiffPixelRatio: 0.02`).
- **Critical:** each spec must **also** assert the screen's root panel is actually visible and
  non-zero-size, e.g.
  `await expect(page.locator('.profile-panel')).toBeVisible()` plus a bounding-box height > 200.
  This is the check that would have caught TASK-1.1.
- **Accept:** `npx playwright test --project=visual` passes; 12 baseline images committed.
- **Verify:** `npx playwright test --project=visual` (paste summary line)
- **Risk:** Low. New tests only.

### TASK-0.2 — Add the visual project to CI [DONE 2026-08-15, commit 4c228cc]
- **Files:** `.github/workflows/quality.yml`
- **Do:** Add a `visual` job mirroring the public browser jobs (checkout, node 24, `npm ci`,
  `npx playwright install --with-deps chromium`, run `--project=visual`), uploading diffs on
  failure. The current workflow keeps visual evidence separate from the deterministic
  required-check set; see `docs/CI-ARCHITECTURE.md`.
- **Accept:** Workflow YAML valid; job appears in `needs`.
- **Verify:** `npx yaml-lint .github/workflows/quality.yml` or `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/quality.yml'))"`
- **Risk:** Low.

### TASK-0.3 — Record the CSS baseline metrics [DONE 2026-08-15, commit f7aea97]
- **Files:** `docs/quality/CSS-BASELINE.md` (new)
- **Do:** Commit the §1 metrics table with the commands that produced each number, so later
  phases can prove reduction.
- **Accept:** File exists with reproducible commands.
- **Risk:** None.

---

## PHASE 1 — P0 outages (user-facing breakage)

### TASK-1.1 — Profile/Settings screen has NO stylesheet (complete feature outage) [DONE 2026-08-15, commit b54b1b3]
- **Severity:** **P0 — the entire Profile/Settings feature is unusable.**
- **Evidence:** `src/components/shell/ProfilePanel.tsx:179` renders
  `<section className="profile-panel">`, but **no CSS rule for `.profile-panel` exists
  anywhere** (`find src/app/styles -iname "*profile*"` returns only the unrelated
  `bike-profile-picker.css`). Computed style is `position: static; z-index: auto`, so the
  panel flows in normal document order and is painted *under* the map canvas.
  - Desktop 1440×900: only two buttons visible floating on the map (they carry their own
    background from shared button classes); the whole card is invisible.
  - Mobile 390×844: **screen renders completely empty** — bare map + nav.
  - No console error. A11y tree contains all content. Invisible to every existing test.
- **Files:** `src/app/styles/profile-panel.css` (new), `src/app/layout.tsx`
- **Do:**
  1. Create `profile-panel.css` giving `.profile-panel` the same base treatment as the other
     sheet panels (compare `.planner-deck` in `planner-shell.css:208` and `.library-drawer`
     in `library-drawer.css:1`): `position: absolute` with top/right/bottom insets, width,
     `background: var(--sb-surface)`, `border: 1px solid var(--sb-border)`,
     `border-radius: var(--sb-radius-card)`, `box-shadow: var(--sb-shadow)`,
     `overflow-y: auto`, `z-index` above the map.
  2. Add a mobile bottom-sheet variant matching the `.sb-bottom-sheet` pattern in
     `design-system.css:143`.
  3. Also add the missing rules for `.profile-theme`, `.profile-diagnostics-toggle`,
     `.profile-recovery-kit` (partial coverage for `.profile-identity`, `.profile-actions`,
     `.profile-notice` already exists in `switchback-v1.css`).
  4. Import it in `src/app/layout.tsx` alongside the other panel stylesheets (lines 4–17).
- **Accept:** Profile content fully visible and scrollable at 1440×900 AND 390×844; all form
  fields, "Offline regions", identity, and sync sections reachable.
- **Verify:** Deploy, then screenshot both viewports. Attach both. Then run TASK-0.1's
  visual spec.
- **Risk:** Medium — new CSS could collide. Mitigate by scoping every rule under
  `.profile-panel`.

### TASK-1.2 — Two panels never re-skinned for the dark theme [DONE 2026-08-15, commit 1bdf18a]
- **Severity:** **P0 — visually broken.** The most jarring finding in the whole audit.
- **Evidence:** `RouteSharePanel` and `CommunityPublishPanel` render in a hardcoded light
  cream theme while every sibling panel around them is dark:
  `responsive.css:1336–1367` — `.route-share-panel { background: linear-gradient(135deg,
  #fbf7f2, #fff); border: 1px solid #e5e0d8; }`, text `#2c2a27` / `#706c65`. These two
  components were left behind when the app moved to its dark system, so they read as bright
  white cards sitting mid-scroll inside an otherwise all-dark panel.
- **Files:** `src/app/styles/responsive.css:1336–1367`,
  `src/components/planner/RouteSharePanel.tsx`, `src/components/planner/CommunityPublishPanel.tsx`
- **Do:** Re-skin both to the semantic tokens (`--sb-surface`/`--sb-surface-raised`,
  `--sb-text`, `--sb-text-muted`, `--sb-border`). Remove the gradient entirely — flat token
  surfaces, consistent with siblings.
- **Accept:** Both panels visually indistinguishable in treatment from the neighbouring
  detail panels; screenshot of the expanded detail scroll proves no light card remains.
- **Risk:** Low.

### TASK-1.3 — Weather panel text is near-invisible [DONE 2026-08-15, commit 886d5d1]
- **Severity:** **P0 — unreadable content.**
- **Evidence:** Temperature values in `RouteWeatherPanel` render at very low contrast against
  their card background (screenshot `live-shots/audit-route-details-2.png`). Additionally the
  "Ride weather" icon renders as an unstyled tan blob rather than a real icon — it reads as
  broken, not decorative.
- **Files:** `src/components/planner/RouteWeatherPanel.tsx` and its CSS
- **Do:** Fix the text color to a token meeting ≥4.5:1 against its actual background; replace
  or correctly style the icon (real icon from the Phosphor set already in use, consistent
  stroke/weight with siblings).
- **Accept:** Measured contrast ≥4.5:1; icon renders correctly; screenshot attached.
- **Risk:** Low.

### TASK-1.4 — Audit for other unstyled/orphaned class names
- **Do:** For every `className="x"` in `src/components/**`, check a matching CSS rule exists.
  Script it: extract class names, grep `src/app/styles/*.css`, report unmatched.
- **Accept:** A list of orphaned classes in `docs/quality/ORPHANED-CLASSES.md`; any that
  represent a *visible* outage get a follow-up task.
- **Verify:** Paste the script and its output.
- **Risk:** Low (read-only investigation).

---

## PHASE 2 — Collapse the two CSS eras (highest leverage)

**Goal:** One era. Delete Era A. Target: **11,512 → under 7,000 lines** with zero visual
regression.

**Order matters.** Do not start until Phase 0 is green — this phase is only safe with
visual baselines in place.

### TASK-2.1 — Map dead rules in `responsive.css` [DONE 2026-08-15, commit 2095966]

**Execution note (material divergence from plan assumption):** coverage-based
bulk classification (the plan's suggested method) proved unreliable on this
codebase -- see docs/quality/CSS-DEAD-RULES.md. Replaced with a static
CSS<->JSX cross-reference, manually verified. Result: only 2 of ~550
top-level rules in responsive.css are genuinely dead. The document's
assumption that most of responsive.css's 5,113 lines are an inert Era A
layer waiting to be bulk-deleted does not hold -- the bulk of it is real,
active styling, just organized as a god-file. Confirmed with the user:
Phase 2 pivots from "delete the dead layer" to "reorganize the live one"
(TASK-2.3/2.4) rather than continuing to hunt for a large dead-code set
that the evidence says isn't there.

### TASK-2.1 — Map dead rules in `responsive.css`
- **Files:** `src/app/styles/responsive.css` (5,113 lines)
- **Do:** For each rule, determine whether it currently wins for any element on any of the 6
  primary screens at 3 viewports (1440, 760, 390). Use Chrome DevTools coverage via Playwright
  (`page.coverage.startCSSCoverage()`) across a scripted walk of all screens, plus manual
  reasoning for state-dependent rules (`:hover`, `.is-selected`, error states) which coverage
  will under-report.
- **Accept:** `docs/quality/CSS-DEAD-RULES.md` listing every rule as KEEP / DEAD /
  UNCERTAIN with evidence.
- **Verify:** Paste the coverage summary.
- **Risk:** Low (analysis only). **Do not delete anything in this task.**

### TASK-2.2 — Delete confirmed-dead Era A rules in batches [DONE 2026-08-15, commit f07ea57 -- 2 rules, not the anticipated ~200-line batches; see TASK-2.1's note]
- **Files:** `src/app/styles/responsive.css`
- **Do:** Delete only rules marked DEAD in TASK-2.1, in batches of ~200 lines. After **each
  batch**: run the visual suite. If any diff appears, restore that batch and re-mark the rule
  UNCERTAIN.
- **Accept:** All DEAD rules gone; visual suite green at every batch.
- **Verify:** `npx playwright test --project=visual` after each batch (paste final summary);
  `wc -l src/app/styles/responsive.css` before/after.
- **Risk:** **High** — this is the riskiest task in the plan. Batching + visual suite is the
  control. One commit per batch so any batch can be reverted alone.

### TASK-2.3 — Split what survives into feature files
- **Do:** `responsive.css` should not exist as a god-file. Move surviving rules to the
  feature file that owns them (`planner-shell.css`, `route-comparison.css`, `ride-hud.css`,
  …). Genuinely cross-cutting responsive rules go in a new `breakpoints.css` with the
  standard breakpoints documented at the top (390 / 760 / 761+ / landscape-short).
- **Accept:** `responsive.css` deleted; no file over ~800 lines; import list in `layout.tsx`
  updated; visual suite green.
- **Verify:** `wc -l src/app/styles/*.css`; visual suite.
- **Risk:** Medium. Pure moves — no rule content changes in this task.

### TASK-2.4 — Eliminate `!important`
- **Do:** Remove all 39 `!important` declarations, fixing the underlying specificity conflict
  instead (usually a leftover Era A rule that should have died in TASK-2.2).
- **Accept:** `grep -c '!important' src/app/styles/*.css` returns 0 for every file (or a
  documented, justified exception list of ≤3).
- **Verify:** Paste the grep; visual suite green.
- **Risk:** Medium.

**[DONE — commit `fix: eliminate !important outside two documented exceptions (TASK-2.4)`]**
Diagnosed all 39 declarations individually (competing-selector check, specificity comparison,
CSS import order in `layout.tsx`, and for MapLibre controls, direct inspection of
`node_modules/maplibre-gl/dist/maplibre-gl.css` to confirm no third-party `!important`/
higher-specificity rule required countering). Removed 27 across `planner-shell.css`,
`switchback-v1.css`, `community.css`, `ride-hud.css`, `responsive.css` — every one was dead
weight left over from Era A, not a real cascade conflict. Kept 12, both in `responsive.css`,
as documented exceptions (comments added at each site):
  - The global `@media (prefers-reduced-motion: reduce)` reset (4 declarations) — by design
    must win over any component's own specificity, that's the standard pattern for this rule.
  - `.sr-only` (8 declarations) — the conventional visually-hidden utility (matches
    Bootstrap/Tailwind's `.sr-only`), must reliably override whatever display/position rules
    the host component sets.
- **Verify:** `grep -c '!important' src/app/styles/*.css` → 0 for every file except
  `responsive.css` (12, both exceptions above — within the "≤3 files" allowance, single file).
  Full 12-test visual suite green on the canonical LXC baseline (desktop + mobile × 6 screens),
  including Ride HUD and Plan/route-result screens where the MapLibre control theming changes
  are visible. Full gate green: lint (`--max-warnings=0`), typecheck, 209 test files / 1307
  tests passed.

---

## PHASE 3 — Real token system

**Goal:** 245 distinct hex colors → under 30, all semantic.

### TASK-3.1 — Build the color inventory
- **Do:** Extract all 245 hex values with usage counts and locations. Cluster them into
  semantic roles (surface, raised surface, text, muted text, border, action, success, warning,
  danger, and the road-character accents: twisty / scenic / gravel / unpaved). Many will be
  near-duplicates of each other (e.g. `#fffdf9` / `#fffdf8` / `#faf8f4`) — collapse them.
- **Accept:** `docs/quality/COLOR-INVENTORY.md` mapping every hex → target token.
- **Verify:** Paste the inventory summary counts.
- **Risk:** None (analysis).

### TASK-3.2 — Extend `design-system.css` with the full token set
- **Files:** `src/app/styles/design-system.css`
- **Do:** Add any missing semantic tokens identified in 3.1 (light + dark). Do not remove
  existing tokens. Every token must be defined for both themes.
- **Accept:** Token set covers every role in the inventory; both themes complete.
- **Risk:** Low (additive).

### TASK-3.3 — Replace hardcoded hex with tokens, file by file
- **Do:** One CSS file per commit. Replace each hex with its mapped token.
- **Accept:** `grep -rhoE "#[0-9a-fA-F]{3,8}\b" src/app/styles/*.css | sort -u | wc -l`
  under 30 (remaining ones only inside `design-system.css` token definitions).
- **Verify:** Paste that count; visual suite green after each file.
- **Risk:** Medium — near-duplicate collapsing shifts colors by a hair. That is desirable
  (it is what "cohesive" means), but keep `maxDiffPixelRatio` at 0.02 to allow it while still
  catching structural breaks.

### TASK-3.4 — Spacing and radius tokens
- **Do:** Same treatment for arbitrary px values. Snap spacing to the `--sb-space-*` 4px
  scale; snap radii to `--sb-radius-*`. Values that are deliberately optical (a 1px nudge to
  align a glyph) may stay, with a comment saying why.
- **Accept:** No arbitrary spacing values outside the scale except commented optical fixes.
- **Risk:** Medium.

---

## PHASE 4 — Remove the AI tells

These are cheap, high-signal, and independent — good candidates for the cheapest agents.
Each can be its own commit.

### TASK-4.1 — Delete all 20 decorative eyebrows [DONE 2026-08-15, commit e4f740e]
- **Severity:** The design skill calls this an outright ban: *"no brief earns it back. The
  heading carries its own weight; delete the label and let the heading speak."*
- **Do:** **Delete** the `<span className="eyebrow">` element (do not restyle, do not
  relocate). Where the eyebrow carries information the heading genuinely lacks, fold that
  information into the heading text instead of keeping a second line.
- **Full list:**

  | File | Eyebrow text |
  |---|---|
  | `planner/RouteComparison.tsx` | "Your options" |
  | `planner/RouteRating.tsx` | "Your road taste" |
  | `planner/GpxIntelligencePanel.tsx` | "GPX intelligence" |
  | `planner/RoadLockLibraryDrawer.tsx` | "Saved on this device" |
  | `planner/RouteEvidencePanel.tsx` | "Decision evidence" |
  | `planner/LibraryDrawer.tsx:337` | "Saved on this device" |
  | `planner/RouteSharePanel.tsx` | "Privacy before sharing" |
  | `planner/MustLockUnresolvedPanel.tsx` | "Must-use road lock could not be included" |
  | `planner/CommunityPublishPanel.tsx` | "Privacy preview first" |
  | `planner/PlannerDeck.tsx` ×3 | "Road character", "Time-boxed explorer"/"Route builder", "Offline pack" |
  | `planner/BikeProfilePicker.tsx` | "Bike profile" |
  | `planner/RideHudStatus.tsx` | dynamic `{eyebrow}` |
  | `planner/RouteDataQualityPanel.tsx` | "Data quality" |
  | `shell/FreeRideHud.tsx` | "Experimental road idea ahead" |
  | `shell/ProfilePanel.tsx:183,299,313` | "Rider profile", "Optional account", "Encrypted device sync" |
  | `shell/DiagnosticsPanel.tsx` | "Diagnostics" |

  **Judgment calls:** `MustLockUnresolvedPanel` and `FreeRideHud` eyebrows carry *warning
  semantics*, not decoration — those two should become part of the panel's actual status
  treatment (real alert styling), not simply deleted. `RideHudStatus`'s is dynamic — check
  what it renders before deciding.
- **Two more aliases of the same banned pattern** (found by later audits — purge in this task
  too, they are the same idea under different class names):
  - `src/components/shell/RecordPanel.tsx:29` — `<span className="destination-kicker">Private by default</span>`
  - `src/components/planner/RideHud.tsx` ~line 182 — `<small>{headerLabel}</small>` (e.g. "ROUTE PREVIEW")
- **Then:** delete the now-unused `.eyebrow` CSS (`planner-shell.css:355`,
  `responsive.css:2225`) and the `.destination-kicker` rule.
- **Accept:** `grep -rn 'className="eyebrow"\|destination-kicker' --include="*.tsx" src/ | wc -l` returns 0.
- **Verify:** Paste the grep; screenshots of 3 affected panels; visual suite.
- **Risk:** Low-medium — headings may need rewording. Update any test asserting eyebrow text.

### TASK-4.2 — Kill the serif display font [DONE 2026-08-15, commit 3f6d500]
- **Files:** `src/app/styles/responsive.css:3895, 4146, 4168`
- **Do:** Remove `font-family: Georgia, "Times New Roman", serif`. These elements should use
  `var(--font-display)` (Sora) per the design contract. (Likely dies with Phase 2 anyway —
  if TASK-2.2 already deleted them, mark this done with the grep as evidence.)
- **Accept:** `grep -rn "Georgia" src/app/styles/` returns nothing.
- **Risk:** Low.

### TASK-4.3 — Remove italic input text [DONE 2026-08-15, commit c7c26c2]
- **Files:** `src/app/styles/responsive.css:3977` (`.ride-omnibox input { font-style: italic }`)
- **Do:** Delete. Italic body/input text is an AI tell and hurts legibility — especially for
  the single most important input in the app.
- **Accept:** `grep -rn "font-style: italic" src/app/styles/` returns nothing.
- **Risk:** Low.

### TASK-4.4 — Fix the double "01" confusion [DONE 2026-08-15, commit 8a5b8a3]
- **Files:** `src/components/planner/RouteComparison.tsx:199` (`route-count`),
  `:217` (`route-slip-index`)
- **Do:** Two different zero-padded numbers sit inches apart meaning different things — a
  total count ("01" = one route exists) and a per-row index ("01" = first route). The design
  skill also bans decorative section numbering. **Remove `route-count`** (the heading plus the
  list length already communicate it) and **remove `route-slip-index`** unless the ordinal is
  genuinely load-bearing; if it is, render it as `1.` not `01`.
- **Accept:** No two adjacent numeric badges with different meanings; screenshot proves it.
- **Risk:** Low.

---

## PHASE 5 — Density and dead space (the user's main complaint)

**Goal:** The panel is content-sized. The map gets the screen. Nothing is stated twice.

### TASK-5.1 — Content-sized planner panel (root cause of "lots of dead space")
- **Files:** `src/app/styles/planner-shell.css:208`, `switchback-v1.css:123`
- **Root cause:** `.planner-deck { position:absolute; top:16px; bottom:16px; }` pins the panel
  to **full viewport height regardless of content**. In the empty search state its content
  occupies roughly the top half, leaving a large measured void above the action dock.
- **Do:** Replace the `top`+`bottom` pin with `top: 16px; max-height: calc(100dvh - 32px);`
  and let height be driven by content. The action dock (currently `position:absolute;bottom:0`
  in `responsive.css:328`) must become a flex/grid footer of the panel so it sits directly
  under the content instead of being pinned to the panel's bottom edge.
- **Accept:** In the empty Plan state at 1440×900, no gap taller than ~24px between the last
  content element and the action dock. Panel still scrolls correctly when content is tall
  (route result with details expanded).
- **Verify:** Screenshots of empty state AND full-detail state, both viewports. Confirm the
  dock never detaches or overlaps.
- **Risk:** **High** — this interacts with ~14 `.planner-scroll` height rules across 4 files
  (`switchback-v1.css:136,685,689,744`; `planner-shell.css:234`;
  `responsive.css:225,251,378,854,863,925,1943,3759,4195`; `ride-hud.css:315`), several of
  which hardcode `height: calc(100% - 88px)` style offsets. **Do TASK-2.2/2.3 first** so
  there are far fewer of these to reconcile.

### TASK-5.1b — Same dead-space bug in the Record panel (second instance)
- **Files:** `src/app/styles/switchback-v1.css:406–418` (`.destination-panel`),
  `src/components/shell/RecordPanel.tsx`
- **Problem:** `.destination-panel { position:absolute; top:16px; bottom:16px; }` — the
  **identical** full-viewport-height pin as `.planner-deck`, in a second, unrelated component.
  With no active recording, only a status row + placeholder + 3 stats + one button render,
  leaving ~300px of dead space to the panel's bottom edge. Two independent copies of the same
  bug means this was copy-pasted rather than shared.
- **Do:** Apply the same content-aware height fix as TASK-5.1. **Then extract the shared
  behavior into one layout primitive** (e.g. a `.sb-panel` base class or a shared
  `PanelSheet` component) so a third copy cannot appear. `.library-drawer:1–14` has the same
  pin and should adopt it too.
- **Accept:** No panel taller than its content; one shared primitive used by all three.
- **Verify:** Screenshots of Record (idle), Plan (empty), Library — all viewports.
- **Risk:** Medium-high — same interaction surface as 5.1. Do them together.

### TASK-5.1c — Shrink the Record empty state
- **Files:** `src/app/styles/switchback-v1.css:488` (`.record-map { min-height: 210px }`)
- **Do:** The "waiting for GPS" box (one pin icon + one sentence) reserves 210px next to a
  compact stats row. Reduce to fit its content.
- **Risk:** Low.

### TASK-5.2 — Collapse the search hero after a route exists
- **Files:** `src/components/planner/PlannerDeck.tsx:330–400`
- **Problem:** The hero (`Ride` label + `Where do you want to ride?` h1 + omnibox + 3 quick
  intents + 2 examples) stays **fully expanded through the entire flow**, including after a
  route is chosen. Google Maps collapses search to a compact bar the moment you have a result.
  This is the single biggest contributor to "the result screen feels like a wall."
- **Do:** When `selectedRoute` exists (or `planningStage !== "Search"`), collapse the hero to
  a single-line summary: `📍 Harrisburg → New Hope, PA` with an edit affordance. Hide the h1,
  the quick intents, and the examples. Expanding is one tap.
- **Accept:** Route-result state shows route options within the first viewport, no scrolling.
- **Verify:** Before/after screenshots of the result state, both viewports.
- **Risk:** Medium — check `planningStage` logic at `PlannerDeck.tsx:162` and don't break the
  re-plan flow. Existing e2e tests reference these controls; update selectors as needed.

### TASK-5.3 — Unify list row heights
- **Files:** `src/app/styles/library-drawer.css:185` (`.library-load`, 88px),
  `src/app/styles/route-comparison.css:16` (`.route-slip`, 78px)
- **Do:** Introduce `--sb-row-height: 64px` (and a `--sb-row-height-lg` if a genuinely denser
  row needs more). Apply to both. 88px for a title+metrics+chevron row is well above the
  56–72px norm for scannable lists.
- **Accept:** One shared token; both lists use it; ~15–20% more rows visible per screen.
- **Verify:** Screenshots of Library and route options, both viewports, with row counts.
- **Risk:** Low-medium — check text truncation at the reduced height.

### TASK-5.4 — Tighten the Library filter chrome
- **Files:** `src/components/planner/LibraryDrawer.tsx:461–524`
- **Problem:** 6 native `<select>` dropdowns + a checkbox across 3 rows sit above the first
  real content, pushing a single saved route below the fold.
- **Do:** Group into one bordered toolbar (two rows of three), or collapse secondary filters
  behind a "Filters" disclosure showing an active-filter count. Search stays always-visible.
- **Accept:** First content row visible without scrolling at 390×844.
- **Risk:** Low.

---

## PHASE 6 — Map chrome cohesion

**Goal:** Max 3 floating clusters, each ONE surface, on a single coordinated margin system.

### TASK-6.1 — Join the top-right toolbar into one surface [DONE 2026-08-15, commit a49ae3e]
- **Files:** `src/app/styles/responsive.css:3170` (`.map-layer-control`),
  `:3180` (`.map-tool-row`), `:3185–3200` (`.map-layers-button`),
  `src/components/planner/MapStageLayerControl.tsx:87–97`
- **Problem:** Sketch route / Avoid area / Layers *are* one DOM group, but each button carries
  its **own** `border-radius: 13px`, own `background`, own `box-shadow`, separated by an 8px
  gap — so they read as three unrelated chips. Proximity without a shared surface.
- **Do:** Strip per-button background/border/shadow/radius. Move them **once** onto
  `.map-tool-row` as a single joined pill (Google Maps' pattern). Separate the segments with a
  1px internal divider instead of an 8px gap. Keep 44px touch targets.
- **Accept:** One visually continuous toolbar; screenshot proves it; targets still ≥44px.
- **Risk:** Low-medium. **Apply the same fix to the mobile breakpoint rules**
  (`responsive.css:3782+`, `4241+`) — they inherit the same per-button chip styling.

### TASK-6.2 — Same joined treatment for zoom + locate (bottom-right)
- **Do:** Zoom in/out (MapLibre-native `.maplibregl-ctrl-bottom-right`) and locate-me are
  separately-owned floating elements in the same corner. Give them one shared surface and one
  margin.
- **Accept:** Bottom-right reads as a single control stack.
- **Risk:** Medium — overriding library-owned MapLibre CSS; check all breakpoints
  (`responsive.css:47,221,1878,3778,3824`).

### TASK-6.3 — Unify corner margins [DONE 2026-08-15, commit 523c33d]
- **Files:** `src/app/styles/map-stage-road-locks.css:23–26` (`top:16px; right:16px`) vs
  `responsive.css:3170` (`top:20px; right:20px`)
- **Do:** "Lock a road" sits 4px off from the layer toolbar in the same corner — an
  unintentional near-miss that reads as sloppiness. Pick one inset (recommend 16px) and apply
  to every floating cluster. Consider folding "Lock a road" into the TASK-6.1 toolbar as a 4th
  segment if usage justifies it; keep separate only if meaningfully rarer.
- **Accept:** All floating clusters share one inset value.
- **Verify:** `grep -rn "top: 16px\|top: 20px" src/app/styles/*.css` on the map controls.
- **Risk:** Low.

---

## PHASE 7 — Screen-by-screen polish

Run `/impeccable critique <target>` (installed at `.claude/skills/impeccable/`) before and
after each screen for a scored Nielsen-heuristic read.

### TASK-7.1 — Plan screen (post-Phase-5 pass)
- Re-critique after 5.1/5.2 land. Focus: does the route-character data (twistiness, surface,
  score) lead the visual hierarchy? That is the product's entire differentiator and currently
  it is small text in a metrics row.

### TASK-7.2 — Route detail sections
- **Files:** `RouteComparison.tsx:319–453` and the panels it stacks —
  `RouteDataQualityPanel`, `GpxIntelligencePanel`, `RouteWeatherPanel`, `RouteEvidencePanel`,
  `TripStagePanel`, `RouteRating`, `RouteSharePanel`, `CommunityPublishPanel`.
- **Problem (measured):** the expanded detail view is **3,880px of scroll for a single
  route**. Data Quality, Measured Route Facts, "Why this route," Ride Weather, Multi-day trip,
  Rating, Private Sharing, and Community Publish each render as their own bordered/tinted box
  stacked with gaps — a pile of unrelated cards, which is exactly the craft-floor's banned
  "same-size cards as page structure."
- **Do:** Convert to a flat, grouped structure (shared rhythm + hairline dividers, not 8
  boxes). Use tabs or an accordion so the rider sees one thing at a time. Order by what a
  rider needs before departure: weather → data quality → evidence → trip staging →
  rating/sharing/publishing (rarest last, collapsed by default).
- **Accept:** Expanded detail under ~1,200px scroll at desktop with the top group open.
- **Depends on:** TASK-1.2 (the two light panels must be re-skinned first, or the grouping
  work will be done against broken styling).
- **Risk:** Medium — many child components; behavior must not change.

### TASK-7.3 — Ride HUD
- **Files:** `src/components/planner/RideHud.tsx`, `src/app/styles/ride-hud.css`
- **Note on conflicting evidence:** two independent audits disagreed on this screen. One found
  the *route-preview* state badly scattered; the other found the *active-guidance* state
  "comparatively solid." Both are probably right — they inspected different states. **Verify
  each finding in both states before acting.**

- **[P0] Scattered top bar.** `RideHud.tsx:178` — `<header className="ride-topbar">` holds 7
  children (brand/status, GPS status, voice, pause, bookmark/overnight, Record, exit-X), but
  it is styled by a *shared* rule at `planner-shell.css:244–253`
  (`display:flex; justify-content:space-between; gap:16px`, shared with `.deck-header` and
  `.section-heading`). At 1440px `space-between` spreads all 7 items across the full bar with
  ~100–150px voids between icon buttons.
  **Fix:** give `.ride-topbar` its own rule — left group = brand + GPS status, right group =
  the 5 action buttons in one toolbar cluster with a fixed gap. Do not keep sharing
  `.deck-header`'s rule.

- **[P0] Bottom dead void.** `ride-hud.css:105–117` — `.ride-telemetry` is
  `position:absolute; right:24px; bottom:24px`, while the GPS-status card is a separate
  absolutely-positioned block at bottom-left. At 1440px that leaves ~850px of bare map between
  two floating islands. **Fix:** unify into one bottom dock (full-width or max-width-centered,
  Google Maps pattern) instead of two independent islands.

- **[P1] Icon/text inconsistency.** `RideHud.tsx:192–255` — voice, pause, bookmark, and exit
  are icon-only (aria-label only); "Record" is the lone labeled button in the same row.
  **Fix:** label all five, or icon+tooltip all five.

- **[P1] Banned eyebrow.** `RideHud.tsx` ~line 182, `<small>{headerLabel}</small>`
  (e.g. "ROUTE PREVIEW") — redundant with the route name and GPS status already visible.
  **Fix:** delete; convey state via the existing colored status dot.

- **Risk:** Medium — safety-relevant surface. Never reduce touch targets below 44px; the
  rider is wearing gloves.

### TASK-7.4 — Record screen
- **Files:** `src/components/shell/RecordPanel.tsx`, `src/app/styles/switchback-v1.css:406–488`
- **Layout bugs:** covered by TASK-5.1b (full-height panel) and TASK-5.1c (oversized empty
  state) — do those first.
- **[P1] Third name for the banned eyebrow:** `RecordPanel.tsx:29` —
  `<span className="destination-kicker">Private by default</span>`. Note this is the **third
  distinct class name** for the same banned idea (`eyebrow`, `destination-kicker`, and the
  `<small>` in RideHud). Purge all three; the privacy statement, if it must stay, belongs in
  the panel's body copy, not as a kicker.
- **Do after those:** run `/impeccable critique` on the Record tab for the remaining pass.
- **Risk:** Low.

### TASK-7.5 — Profile screen layout (after TASK-1.1 makes it visible)
- **Do:** The panel has apparently never been visually reviewed. Once visible: form field
  spacing, section grouping, and the identity/sync sections' honest-state messaging.
- **Risk:** Low.

---

## PHASE 8 — Motion and performance

### TASK-8.1 — Replace layout-property transitions
- **Detected by:** `node .claude/skills/impeccable/scripts/detect.mjs --json src/components src/app`
- **Locations (7):** `design-system.css:87` (height,width), `region-downloads.css:405` (width),
  `responsive.css:444` (height,width), `ride-hud.css:197` (width),
  `route-comparison.css:30` (padding), `route-data-quality-panel.css:144` (width),
  `storage-quota-meter.css:44` (width)
- **Do:** Animating width/height/padding causes layout thrash. Use `transform`/`opacity`, or
  `grid-template-rows: 0fr → 1fr` for height. **Exception:** progress-style meters
  (`storage-quota-meter`, `route-data-quality-panel`, `region-downloads`) legitimately animate
  `width` for a fill bar — convert those to `transform: scaleX()` with a
  `transform-origin: left`.
- **Accept:** Detector returns 0 findings (exit 0).
- **Verify:** Paste detector output.
- **Risk:** Low-medium — scaleX on a bar can distort child text; ensure bars have no text
  children.

### TASK-8.2 — One authored motion moment
- **Do:** Per craft-floor: motion should be *one authored moment*, not scattered effects, and
  must respect `prefers-reduced-motion` (already partially handled at `design-system.css:186`).
  Audit every transition; keep the sheet/panel motion as the signature moment; remove
  incidental hover transitions that add nothing.
- **Risk:** Low.

---

## PHASE 9 — Accessibility (beyond the two already fixed)

Two WCAG A/AA violations were already fixed this session (invalid `aria-label` on a `div`;
nested interactive controls in the Library import button). Remaining work:

### TASK-9.1 — Full-app axe scan
- **Do:** Extend the axe scan (pattern established this session using
  `node_modules/axe-core/axe.min.js` injected via Playwright) to **all 6 primary screens** at
  both viewports, including expanded/modal states.
- **Accept:** `docs/quality/A11Y-SCAN.md` with results; 0 serious/critical violations.
- **Verify:** Paste per-screen violation counts.
- **Risk:** Low.

### TASK-9.2 — Contrast audit against the craft floor
- **Do:** Body/placeholder text ≥4.5:1, large text ≥3:1. Check especially muted text
  (`--sb-text-muted`) on raised surfaces, and any secondary text sitting on a colored
  surface — per craft-floor, tint from the surface hue, never flat gray.
- **Accept:** All text passes; documented.
- **Risk:** Low-medium — may force token changes; coordinate with Phase 3.

### TASK-9.3 — Keyboard + focus pass
- **Do:** Full primary flow keyboard-only (plan → select → save → export → ride). Visible
  focus everywhere (`design-system.css:81` defines the ring — verify it is never clipped by
  `overflow: hidden` on the panels).
- **Accept:** Flow completable keyboard-only; focus always visible.
- **Risk:** Low.

### TASK-9.4 — Theme the browser surfaces
- **Do:** Per craft-floor, the cheapest "built not assembled" signal: theme text selection,
  caret color, scrollbars, focus rings, and enforce `tabular-nums` on all telemetry numerals
  (speed, distance, ETA) so digits stop jittering as they change.
- **Risk:** Low. High polish-per-effort.

---

## PHASE 10 — Component decomposition (structural debt)

Do this **after** the visual work. It is invisible to users and only pays off in future
velocity — but it is why every UI change is currently expensive.

### TASK-10.1 — `PlannerShell.tsx` (1,602 lines)
- **Do:** Extract cohesive hooks/components. Candidate seams already exist:
  `usePlannerRideIntent`, `usePlannerRideResearch`, `useNavigationSessionController`,
  `PlannerDeckViewModel`. Target under 400 lines.
- **Accept:** All tests pass; no behavior change.
- **Risk:** Medium-high. Pure refactor — no behavior change in the same commit.

### TASK-10.2 — `MapStage.tsx` (1,560 lines)
- **Do:** Separate map lifecycle, layer management, interaction handlers, and overlay
  rendering. Target under 400 lines.
- **Risk:** Medium-high — map lifecycle bugs are subtle. Lean on the visual suite.

### TASK-10.3 — `PlannerDeck.tsx` (880), `RegionDownloadsPanel.tsx` (735), `LibraryDrawer.tsx` (692)
- **Do:** Same treatment, target under 400 each.
- **Risk:** Medium.

---

## PHASE 11 — Release verification

### TASK-11.1 — Full gate
```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e:critical && npm run build
npm audit --omit=dev
npx playwright test --project=visual
node .claude/skills/impeccable/scripts/detect.mjs --json src/components src/app
```
All must pass; detector exit 0.

### TASK-11.2 — Metrics delta
- **Do:** Re-measure §1 and record before/after in `docs/quality/CSS-BASELINE.md`.
- **Targets:** CSS under 7,000 lines; distinct hex under 30; `!important` 0; eyebrows 0;
  serif 0; italic 0; detector findings 0.

### TASK-11.3 — Live verification
- **Do:** Deploy; walk the full core flow on the live URL at both viewports; screenshot every
  step; confirm zero console errors (the Cloudflare beacon CSP message is pre-existing and
  expected — it is the CSP correctly blocking a third-party script).

### TASK-11.4 — Re-run the design critique
- **Do:** `/impeccable critique` on each primary screen. Record the Nielsen score delta.
- **Target:** every primary screen ≥32/40.

---

## Appendix A — Task dependency graph

```
PHASE 0 (safety net) ─────────────┐
                                   ├──> PHASE 2 (CSS eras) ──> PHASE 3 (tokens) ─┐
PHASE 1 (P0 outage) ──────────────┘                                              │
                                                                                  ├──> PHASE 5 (density)
PHASE 4 (slop removal) ── independent, any time after Phase 0 ───────────────────┘
PHASE 6 (map chrome) ── independent, any time after Phase 0
PHASE 7 (screens) ──── after 5
PHASE 8 (motion) ───── after 2
PHASE 9 (a11y) ─────── after 3 (contrast depends on tokens)
PHASE 10 (components) ─ after 7
PHASE 11 (release) ──── last
```

**Critical path:** 0 → 2 → 3 → 5 → 7 → 11.
**Parallelizable now:** Phase 1, Phase 4, Phase 6 (independent, cheap, high visible payoff).

### Recommended first sprint (highest visible payoff per unit of risk)

If you only run a handful of tasks, run these — they are all low-risk, independent, and
directly address "it kinda sucks / dead space / looks like slop":

| Order | Task | Why |
|---|---|---|
| 1 | **TASK-1.1** Profile stylesheet | An entire feature is invisible on every viewport |
| 2 | **TASK-1.2** Re-skin the two light panels | Most jarring visual break in the app |
| 3 | **TASK-1.3** Weather contrast + broken icon | Unreadable content, looks broken |
| 4 | **TASK-0.1** Visual regression harness | Everything after this is uninsurable without it |
| 5 | **TASK-4.1–4.4** Slop removal | 20 eyebrows, serif, italic, double "01" — cheap, high signal |
| 6 | **TASK-6.1/6.3** Join the map toolbar | Directly fixes "scattered" feel |
| 7 | **TASK-5.1/5.1b/5.1c** Content-sized panels | Directly fixes "lots of dead space" |

Phases 2–3 (the CSS-era collapse) are the big structural win but are also the riskiest —
do them only once TASK-0.1's baselines exist.

## Appendix B — Cheap-agent task template

```markdown
## <TASK-ID> — <title>
**Phase:** <n>   **Risk:** low|medium|high   **Depends on:** <task ids or none>
**Files:** <exact paths, with line numbers where known>
**Problem:** <what is wrong, with evidence>
**Do:** <numbered, unambiguous steps>
**Do NOT:** <explicit out-of-scope>
**Accept:** <observable criteria>
**Verify:** <exact command(s) to run, or screenshots to attach>
**Commit:** `<type>: <what> (<TASK-ID>)`
```

## Appendix C — Files an agent should read before starting

| Purpose | Path |
|---|---|
| Visual system contract | `design/DESIGN-CONTRACT.md` |
| Live tokens | `src/app/styles/design-system.css` |
| Quality floor / banned patterns | `.claude/skills/impeccable/reference/craft-floor.md` |
| Layout method | `.claude/skills/impeccable/reference/layout.md` |
| Operate-mode guidance | `.claude/skills/impeccable/reference/operate.md` |
| Current known state | `docs/SHAREABILITY-REVIEW-2026-08-14.md` |
| CI gates | `.github/workflows/quality.yml` |

## Appendix D — Known constraints and out of scope

- **Out of scope:** community backend completion, encrypted-sync recovery, passkey/WebAuthn
  flows, multi-day trip planning, personal road-learning. Do not "improve" these; leave
  behavior as-is.
- **Offline routing is labeled Beta** (measured ~89.9% accuracy vs the live router). Keep the
  beta disclosure visible in any redesign of the offline panels — it is a safety statement,
  not decoration.
- **`SWITCHBACK_SESSION_SECRET` is unset in production**, so passkey sign-in currently 500s.
  Do not design around identity flows working until the owner sets it.
- **Physical-device testing (iPhone field rides, real passkeys) cannot be simulated.** Never
  claim these were tested.
