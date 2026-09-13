# OpenGravel Public Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand every normal rider-facing product surface from Switchback to OpenGravel while preserving persisted data, deployment compatibility, current hostnames, WebAuthn identity, and active routing behavior.

**Architecture:** Add one small canonical brand module, make metadata/manifest/shell consume it, replace the old inline shell mark with a production vector OpenGravel mark, and update public documentation without broad subsystem churn. Technical identifiers that are persistence- or deployment-sensitive remain stable unless a compatibility alias is explicitly tested; every intentional legacy identifier is recorded in a migration ledger for the later hard rename.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Vitest 4, Testing Library, SVG, existing V2 CSS/design tokens.

**Spec:** `docs/superpowers/specs/2026-09-12-opengravel-public-rebrand-design.md`

## Global Constraints

- Primary product name: **OpenGravel**.
- Primary line: **Open routes. A wilder tomorrow.**
- Functional short line: **Find routes worth riding.**
- Do not change the production hostname, GitHub repository slug, WebAuthn RP ID/origin contract, or the persisted Dexie database name in PR A.
- Keep current `--sb-*` CSS custom properties in PR A unless a change is proven low-risk and materially useful.
- No AI-SaaS, glassmorphism, gradient, sparkle, card-collage, or decorative-template treatment.
- Core identity assets must be vector-first and production-drawn; generated branding boards are reference direction only.
- Preserve current routing, planner, accessibility, and rider-safety behavior.
- Historical archives and migration history retain historical Switchback references.
- Exact-head protected CI and visual review are required before merge.

---

### Task 1: Canonical OpenGravel Brand Authority

**Files:**
- Create: `src/lib/brand/product-brand.ts`
- Create: `tests/unit/product-brand.test.ts`

**Interfaces:**
- Produces: `PRODUCT_BRAND` readonly object with `name`, `shortName`, `tagline`, `functionalTagline`, `description`, and `applicationDescription` string properties.
- Consumers: `src/app/layout.tsx`, `src/app/manifest.ts`, `src/components/shell/AppNavigation.tsx`, and later public/about surfaces.

- [ ] **Step 1: Write the failing brand contract test**

```ts
import { describe, expect, it } from "vitest"
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"

describe("PRODUCT_BRAND", () => {
  it("exposes the approved OpenGravel rider-facing identity", () => {
    expect(PRODUCT_BRAND).toEqual({
      name: "OpenGravel",
      shortName: "OpenGravel",
      tagline: "Open routes. A wilder tomorrow.",
      functionalTagline: "Find routes worth riding.",
      description: "A motorcycle trip decision engine for gravel, backroads, and roads worth riding.",
      applicationDescription: "Plan, compare, prepare, and ride motorcycle routes with gravel and backroad intelligence."
    })
  })
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run tests/unit/product-brand.test.ts`

Expected: FAIL because `@/lib/brand/product-brand` does not exist.

- [ ] **Step 3: Add the minimal immutable brand module**

```ts
export const PRODUCT_BRAND = {
  name: "OpenGravel",
  shortName: "OpenGravel",
  tagline: "Open routes. A wilder tomorrow.",
  functionalTagline: "Find routes worth riding.",
  description: "A motorcycle trip decision engine for gravel, backroads, and roads worth riding.",
  applicationDescription: "Plan, compare, prepare, and ride motorcycle routes with gravel and backroad intelligence."
} as const
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx vitest run tests/unit/product-brand.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand/product-brand.ts tests/unit/product-brand.test.ts
git commit -m "feat(brand): add OpenGravel product identity"
```

---

### Task 2: Metadata and PWA Identity

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/manifest.ts`
- Create: `tests/unit/app-brand-metadata.test.ts`

**Interfaces:**
- Consumes: `PRODUCT_BRAND` from Task 1.
- Produces: browser/PWA metadata that says OpenGravel while keeping `/manifest.webmanifest` and current icon paths stable.

- [ ] **Step 1: Write metadata/manifest assertions first**

```ts
import { describe, expect, it } from "vitest"
import { metadata } from "@/app/layout"
import manifest from "@/app/manifest"

describe("OpenGravel app identity", () => {
  it("uses OpenGravel in document metadata", () => {
    expect(metadata.title).toBe("OpenGravel — Find routes worth riding")
    expect(metadata.applicationName).toBe("OpenGravel")
  })

  it("uses OpenGravel in the install manifest", () => {
    const value = manifest()
    expect(value.name).toBe("OpenGravel Motorcycle Routes")
    expect(value.short_name).toBe("OpenGravel")
    expect(value.description).toBe("Find routes worth riding.")
  })
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run tests/unit/app-brand-metadata.test.ts`

Expected: FAIL on current Switchback metadata/manifest values.

- [ ] **Step 3: Replace hard-coded Switchback metadata with `PRODUCT_BRAND`**

Use:

```ts
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"

export const metadata: Metadata = {
  title: `${PRODUCT_BRAND.name} — Find routes worth riding`,
  description: PRODUCT_BRAND.applicationDescription,
  applicationName: PRODUCT_BRAND.name,
  manifest: "/manifest.webmanifest",
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }]
}
```

And manifest values:

```ts
name: `${PRODUCT_BRAND.name} Motorcycle Routes`,
short_name: PRODUCT_BRAND.shortName,
description: PRODUCT_BRAND.functionalTagline,
```

Keep existing display/orientation/theme/icon path behavior unchanged.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx vitest run tests/unit/app-brand-metadata.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/manifest.ts tests/unit/app-brand-metadata.test.ts
git commit -m "feat(brand): rebrand app metadata to OpenGravel"
```

---

### Task 3: Production OpenGravel Mark and Shell Branding

**Files:**
- Create: `src/components/brand/OpenGravelMark.tsx`
- Modify: `src/components/shell/AppNavigation.tsx`
- Modify: `src/app/styles/shell-v2.css`
- Replace content: `public/icon.svg`
- Modify: `tests/components/app-navigation.test.tsx`
- Create: `tests/components/open-gravel-mark.test.tsx`

**Interfaces:**
- Consumes: `PRODUCT_BRAND` from Task 1 and existing V2 CSS tokens.
- Produces: `OpenGravelMark({ className?, title? })` SVG component; shell brand block using the official mark and OpenGravel text.

- [ ] **Step 1: Add failing shell/mark tests**

Add assertions that navigation renders `OpenGravel`, does not render visible `Switchback`, and exposes the approved functional descriptor. Add a mark test that verifies an accessible SVG title when `title` is supplied and `aria-hidden` behavior when it is omitted.

Example:

```tsx
expect(screen.getByText("OpenGravel")).toBeInTheDocument()
expect(screen.queryByText("Switchback")).not.toBeInTheDocument()
expect(screen.getByText("Gravel & backroad routing")).toBeInTheDocument()
```

- [ ] **Step 2: Run the focused component tests and confirm RED**

Run: `npx vitest run tests/components/app-navigation.test.tsx tests/components/open-gravel-mark.test.tsx`

Expected: FAIL because the shell still renders the old inline Switchback mark/name and the OpenGravel component does not exist.

- [ ] **Step 3: Implement a simplified vector OpenGravel symbol**

Draw a compact original SVG derived from the approved direction, not from a generated raster asset. Required geometry:

- circular/rounded field boundary;
- two restrained mountain ridgelines;
- a single winding gravel-road negative/positive path leading toward the ridge;
- one small copper/ember navigation accent;
- no fine topo detail inside the favicon-size mark;
- no embedded text inside the SVG.

Use current semantic token colors through `currentColor`/CSS where the component is rendered, and explicit production-safe fills in `public/icon.svg` for standalone favicon/PWA use.

- [ ] **Step 4: Replace AppNavigation brand treatment**

Replace the inline `switchback-mark` SVG and literal brand strings with:

```tsx
<OpenGravelMark className="open-gravel-mark" />
<span>
  <strong>{PRODUCT_BRAND.name}</strong>
  <small>Gravel & backroad routing</small>
</span>
```

Update the component comment to say OpenGravel. Do not rename unrelated navigation classes or destination contracts.

- [ ] **Step 5: Polish only the brand block in `shell-v2.css`**

Keep the current shell geometry. Adjust mark sizing, wordmark weight/tracking, and secondary line contrast only as needed so the new identity looks deliberate at wide/medium/mobile widths. Do not introduce gradients, glass, oversized marketing type, or extra decorative containers.

- [ ] **Step 6: Replace `public/icon.svg` with the simplified OpenGravel icon**

Requirements: 512×512 viewBox, existing rounded-square app-icon field retained, accessible label `OpenGravel`, high legibility at 32 px, no text.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run: `npx vitest run tests/components/app-navigation.test.tsx tests/components/open-gravel-mark.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/brand/OpenGravelMark.tsx src/components/shell/AppNavigation.tsx src/app/styles/shell-v2.css public/icon.svg tests/components/app-navigation.test.tsx tests/components/open-gravel-mark.test.tsx
git commit -m "feat(brand): add OpenGravel shell identity"
```

---

### Task 4: Rider-Facing Copy and Active Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `design/DESIGN-CONTRACT.md`
- Modify only where rider-facing branding is found: `src/components/discover/DiscoverDestination.tsx`, `src/components/settings/SettingsDestination.tsx`, `src/components/shell/ProfilePanel.tsx`, `src/components/planner/RouteSharePanel.tsx`, and other current user-facing files discovered by the audit.
- Modify relevant existing tests next to each changed component.

**Interfaces:**
- Consumes: `PRODUCT_BRAND` for reusable application strings where importing it is sensible.
- Produces: no new runtime interface; removes accidental normal-use Switchback branding while preserving historical and compatibility references.

- [ ] **Step 1: Inventory rider-facing literals before editing**

Run:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' '\bSwitchback\b|switchback-mark' src README.md AGENTS.md design docs
```

Classify each hit as `rider-facing`, `active-doc product name`, `historical`, or `technical compatibility` before changing it.

- [ ] **Step 2: Add/adjust tests for each rider-facing surface selected for change**

For component surfaces, assert `OpenGravel` where the brand is visible and assert the legacy name is absent from normal rendered copy. Do not create snapshot-only coverage for text behavior.

- [ ] **Step 3: Run the selected tests and confirm RED**

Run only the component/unit files touched by the selected surfaces.

Expected: FAIL on old visible branding.

- [ ] **Step 4: Update current product copy**

Rules:

- Replace the product name with OpenGravel.
- Preserve motorcycle-first functional accuracy.
- Use the primary tagline only on launch/about/public brand surfaces.
- Use `Find routes worth riding.` when a short functional line is needed.
- Do not add marketing copy inside dense planning controls.
- Do not rewrite historical ADR/archive evidence merely to remove the old name.

- [ ] **Step 5: Update authoritative docs carefully**

README opening should become:

```md
# OpenGravel

OpenGravel is a **motorcycle trip decision engine**. Google Maps answers "what is the practical route?" OpenGravel answers "which route will I actually want to ride, and what should I know before committing to it?"
```

Update `AGENTS.md` current product guardrail language and the active `design/DESIGN-CONTRACT.md` title/body from Switchback to OpenGravel. Preserve technical identifiers such as `NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX` when describing current compatibility behavior.

- [ ] **Step 6: Run selected tests and confirm GREEN**

Run focused changed-surface tests, then `npm test` if local resources allow.

- [ ] **Step 7: Commit**

```bash
git add README.md AGENTS.md design/DESIGN-CONTRACT.md src tests
git commit -m "docs(brand): transition active product language to OpenGravel"
```

---

### Task 5: Compatibility Ledger and Safe Alias Audit

**Files:**
- Create: `docs/operations/OPENGRAVEL_RENAME_COMPATIBILITY.md`
- Modify only if fully testable and low-risk: runtime env readers corresponding to `SWITCHBACK_*` variables.
- Add focused unit tests for any alias resolver introduced.

**Interfaces:**
- Produces: migration ledger with four explicit classes: safe-now, alias-required, migration-required, infrastructure-deferred.
- Optional if implemented: a narrowly scoped env resolver that prefers `OPENGRAVEL_*` and falls back to the legacy `SWITCHBACK_*` name without behavior change.

- [ ] **Step 1: Inventory all remaining technical legacy identifiers**

Run:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' 'SWITCHBACK_|switchback:|switchback-moto|\bswitchback\b' .
```

Exclude generated build artifacts. Record every intentional remaining class in the ledger.

- [ ] **Step 2: Prove persisted storage remains untouched**

Inspect `src/lib/storage/route-library.ts` and tests. The default Dexie name must remain exactly:

```ts
constructor(readonly name = "switchback")
```

Add a regression assertion to the existing route-library test suite if one does not already pin the default database name/data continuity.

- [ ] **Step 3: Decide env aliases by evidence, not aesthetics**

Only introduce an OpenGravel alias when the exact runtime read path is localized and can be tested. The resolver contract is:

```ts
function readRenamedEnv(env: NodeJS.ProcessEnv, currentName: string, legacyName: string): string | undefined {
  return env[currentName] ?? env[legacyName]
}
```

For each migrated variable, canonical OpenGravel name wins when both exist; legacy-only deployments continue working. If the read path is spread across scripts/shell/CI or lacks practical focused coverage, defer it and document why.

- [ ] **Step 4: Run storage and any alias tests**

Expected: PASS with old persisted names/config still accepted.

- [ ] **Step 5: Commit**

```bash
git add docs/operations/OPENGRAVEL_RENAME_COMPATIBILITY.md src tests
git commit -m "docs(brand): map OpenGravel compatibility migration"
```

---

### Task 6: Full Verification, Visual Review, and Draft PR

**Files:**
- Modify only if required by verified test failures or intentionally accepted visual baselines.
- Update PR body with exact verification evidence.

**Interfaces:**
- Consumes: all tasks above.
- Produces: a reviewable draft PR with exact-head evidence and no hidden compatibility cutover.

- [ ] **Step 1: Run repository quality gates**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:critical
npm run test:e2e:pwa
```

Then run repository-specific protected lanes available in the environment, including visual, real-router, road-lock, and Mobile Core equivalents.

- [ ] **Step 2: Inspect visual diffs rather than auto-accepting them**

Expected intentional visual differences are limited to logo/wordmark/icon branding and any copy-width shifts. Navigation geometry, planner hierarchy, ride HUD behavior, route controls, and map interaction must not move without an explicit defect fix.

- [ ] **Step 3: Re-run the legacy-brand audit**

Run:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' '\bSwitchback\b|SWITCHBACK_|switchback:|switchback-moto' .
```

Every remaining hit must be historical or listed in `docs/operations/OPENGRAVEL_RENAME_COMPATIBILITY.md`.

- [ ] **Step 4: Verify branch cleanliness and exact head**

Run:

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

Expected: clean tree; record exact head/base SHAs.

- [ ] **Step 5: Open/update the draft PR**

Title:

```text
rebrand: introduce OpenGravel compatibility-first public transition
```

Body must state:

- all rider-facing normal-use branding now says OpenGravel;
- current hostname/repository slug remain unchanged;
- persisted `switchback` storage namespace remains intentionally stable;
- legacy env names are either aliased with tests or explicitly deferred;
- exact-head test/visual evidence;
- PR B hard-rename work is mapped but not silently included.

- [ ] **Step 6: Do not mark ready until exact-head protected checks and visual review are green**

If a check fails, fix the cause and re-run rather than weakening the gate.
