# Implementation Notes: What Not To Overengineer

This branch deliberately does **not** need:

- a new design-system component package;
- Storybook if the repo does not already rely on it;
- a new animation library;
- a new state machine library;
- a new responsive-hook abstraction;
- a new theme provider;
- a separate mobile shell;
- a mini-map component for every route card;
- a task runner for these four waves;
- a custom screenshot dashboard;
- a dedicated performance benchmark service;
- new API fields merely to decorate cards;
- broad refactors of PlannerShell or routing code.

Prefer ordinary React composition, existing CSS ownership, existing tokens, current Playwright fixtures, current stores/view models, and small display-only helpers.

The desired implementation should look more sophisticated than the code needed to produce it.