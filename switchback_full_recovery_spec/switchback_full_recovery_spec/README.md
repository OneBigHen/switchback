# Switchback Full Recovery and Productization Spec

This package is an execution dossier for bringing the `OneBigHen/switchback` repository from an ambitious post-rework beta into a cohesive, modular, mobile-first motorcycle routing product with a serious desktop editor.

It is designed to be placed in the repository root and handed to DeepSeek or another coding agent. The short master goal tells the agent what to do; the remaining documents are the source of truth for implementation details, sequencing, acceptance criteria, and decisions about what should be removed instead of preserved.

## Start here

1. Read `MASTER_GOAL.txt`.
2. Read `00_EXECUTION_ORDER.md`.
3. Read `01_PRODUCT_DECISIONS.md`.
4. Audit the live repository before changing code.
5. Execute the phases in `15_PHASED_IMPLEMENTATION_PLAN.md`.
6. Treat `16_DEFINITION_OF_DONE.md` and `13_TEST_AND_RELEASE_GATES.md` as release gates.

## Non-negotiable direction

Switchback remains:

- single-user and self-hosted;
- local-first and usable without an account;
- map-first and motorcycle-specific;
- mobile-first for planning and riding;
- capable on desktop for detailed route editing;
- honest about data confidence, legal access, safety, provider availability, and offline readiness;
- modular enough that future routing providers, datasets, scoring models, and UI surfaces can be replaced without another major rewrite.

## What this package does

It provides a full current-state assessment, P0/P1/P2 backlog, architecture, routing and road-requirement redesign, Free Ride redesign, offline/PWA hardening, preference-learning correction, privacy-sharing correction, mobile and desktop UX specifications, migration requirements, semantic tests, release gates, and explicit rules for cutting incoherent features.

## What this package does not authorize

The agent must not:

- preserve a feature solely because code already exists;
- add cloud accounts, social features, community routes, subscriptions, or multi-user infrastructure;
- add more route profiles before existing profiles are operationally distinct and tested;
- label inferred or synthetic data as verified, safe, exact, live, or legal;
- silently weaken constraints to return a route;
- hide incomplete behavior behind polished copy;
- perform a broad visual rewrite before correctness and state architecture are stable.

The goal is not to keep every recent addition. The goal is to keep only what forms a reliable and coherent product.
