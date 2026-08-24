# AI implementation workflow

Codex is the lead engineer for this repository. Codex owns planning, architecture, shared contracts, integration, code review, and release verification. Codex decides the work-package boundaries and accepts or rejects each result.

GLM, through the project-local `glm-worker` subagent, is a bounded implementation worker only. It makes the smallest approved edits inside one work package and reports its changed files, commands, validation result, assumptions, and blockers. It does not own architecture, integration, runtime operations, deployment, or release decisions.

## Work-package rules

Use one work package at a time and one focused concern per package. Keep packages normally below 10 files. Each package must explicitly provide scope, allowed files, forbidden files, acceptance criteria, validation commands, and non-goals. Missing fields are a stop condition, not an invitation to guess.

NeuralWatt permits up to three concurrent GLM agents. Use that capacity only for independently approved packages in separately isolated worktrees; never run multiple GLM agents against this worktree. The lead must review the complete `git diff` and run relevant validation before accepting each package. GLM must not commit or push; the lead owns any later version-control action.

Runtime verification is manual and happens only when the user requests it. Routine GLM work stays within repository inspection, bounded edits, and targeted existing validation commands.

Paperclip tasks should link to the GitHub PR and evaluate CI evidence against the current head SHA.

## Delegation command

From this repository, invoke:

```text
/glm-work <complete work package containing all six required fields>
```

The command always delegates to `glm-worker`, which uses the configured `neuralwatt/glm-5.2` model. Keep infrastructure, routing-service, environment, CI/release, and runtime concerns out of ordinary packages unless the user explicitly changes that boundary and separately approves the exact paths.
