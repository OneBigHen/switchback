# Luna Human Exploratory QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a lightweight, repeatable human-style exploratory QA protocol that one Luna/coworker coordinator can delegate across bounded rider missions and feed into the existing GitHub + deterministic test workflow.

**Architecture:** Documentation defines the coordinator, missions, evidence contract, severity model, and GitHub handoff. Existing Vitest/Playwright/visual/mobile/PWA/real-router/live-provider systems remain the deterministic layer; no new runner or dependency is introduced.

**Tech Stack:** Markdown, GitHub issues/PRs, existing browser tools and test suites.

**Spec:** `docs/superpowers/specs/2026-09-06-luna-human-qa-design.md`

## Global Constraints

- No new runtime dependencies or orchestration service.
- Black-box mission first; source/test inspection only after exploration.
- Record exact tested URL and application SHA/build identifier when available.
- Emulation must never be reported as physical-device evidence.
- Findings are bugs, UX friction, or product questions; agents do not silently redesign product behavior.
- Confirmed repeatable correctness defects should become deterministic regressions when fixed.
- No automatic mass issue creation.

---

### Task 1: Publish the exploratory QA playbook

**Files:**
- Create: `docs/quality/LUNA-HUMAN-QA.md`
- Create: `docs/quality/HUMAN-QA-MISSIONS.md`

**Interfaces:**
- Consumes: `PRODUCT.md`, `DESIGN.md`, `design/DESIGN-CONTRACT.md`, `AGENTS.md`
- Produces: the stable behavior/evidence contract and six worker missions

- [ ] **Step 1:** Write the short authoritative playbook with the deterministic-vs-exploratory boundary, finding classes, severity, evidence, and GitHub lifecycle.
- [ ] **Step 2:** Write six goal-based rider missions without click scripts.
- [ ] **Step 3:** Self-review for duplicated rules, stale campaign references, fabricated physical evidence, and accidental new product requirements.

### Task 2: Publish the coordinator and report contract

**Files:**
- Create: `docs/quality/LUNA-QA-COORDINATOR.md`
- Create: `docs/quality/EXPLORATORY-SESSION-TEMPLATE.md`

**Interfaces:**
- Consumes: Task 1 playbook and missions
- Produces: copy/paste coordinator prompt and normalized session output

- [ ] **Step 1:** Write a single max-session coordinator prompt that resolves the target build, delegates bounded missions, prevents worker overlap, and synthesizes findings.
- [ ] **Step 2:** Require workers to return only their top evidence-backed findings plus successful-but-confusing observations.
- [ ] **Step 3:** Require the coordinator to dedupe, rank, and propose deterministic regression ownership without modifying application code during discovery.

### Task 3: Add the GitHub handoff and agent entrypoint

**Files:**
- Create: `.github/ISSUE_TEMPLATE/exploratory-qa.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 1 finding contract
- Produces: consistent confirmed-defect issue format and discoverable agent guidance

- [ ] **Step 1:** Add a compact issue template with rider goal, tested SHA/build, expected/actual, repro, evidence, impact, and candidate regression.
- [ ] **Step 2:** Add a short AGENTS.md pointer saying human exploratory QA uses the Luna playbook and never replaces deterministic or physical-device gates.
- [ ] **Step 3:** Verify no application/runtime files changed.

### Task 4: Review and publish

**Files:**
- Review: all files above

**Interfaces:**
- Consumes: Tasks 1-3
- Produces: reviewable GitHub PR based on current main

- [ ] **Step 1:** Compare branch to its main base and confirm changes are docs/issue-template/AGENTS only.
- [ ] **Step 2:** Check all referenced paths exist and all current-state claims match repository history.
- [ ] **Step 3:** Open a PR describing the framework, its non-goals, and how to launch the first Luna max session.
