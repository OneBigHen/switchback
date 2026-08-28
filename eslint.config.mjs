import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    ".claude/worktrees/**",
    ".omo/evidence/**",
    "artifacts/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".claude/skills/**",
    ".github/skills/**",
    ".opencode/skills/**"
  ])
])
