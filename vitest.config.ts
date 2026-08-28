import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: [
      ...configDefaults.exclude,
      "artifacts/**",
      ".claude/worktrees/**",
      "**/.claude/worktrees/**",
      "tests/e2e/**",
    ],
    coverage: {
      reporter: ["text", "html"]
    }
  }
})
