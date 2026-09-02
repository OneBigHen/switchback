import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const workflow = readFileSync(".github/workflows/deep-qa.yml", "utf8")

describe("manual Deep QA workflow", () => {
  // The previous file was found binary-corrupted, which fails silently:
  // GitHub simply stops offering the workflow. Keep asserting it is plain text.
  it("is plain-text YAML without binary corruption", () => {
    expect(workflow).not.toContain("\uFFFD")
    expect(workflow).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
  })

  it("keeps release-level checks manual, outside the pull-request gate", () => {
    expect(workflow).toContain("workflow_dispatch:")
    expect(workflow).not.toContain("pull_request:")
    expect(workflow).toContain("--project=critical-webkit-full")
    expect(workflow).toContain("--project=visual")
    expect(workflow).toContain("npm run test:e2e:real-router")
  })

  it("does not rebaseline visual snapshots automatically", () => {
    expect(workflow).not.toContain("--update-snapshots")
  })
})
