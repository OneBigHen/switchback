#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(new URL(import.meta.url).pathname), "../..")
const outputDirectory = resolve(root, "artifacts/quality/latest")
mkdirSync(outputDirectory, { recursive: true })

const checks = [
  { id: "lint", args: ["run", "lint"] },
  { id: "typecheck", args: ["run", "typecheck"] },
  { id: "unit", args: ["test", "--", "--reporter=dot"] }
]

const results = []
for (const check of checks) {
  const startedAt = Date.now()
  const result = spawnSync("npm", check.args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  writeFileSync(resolve(outputDirectory, `${check.id}.log`), output)
  const status = result.status === 0 && !result.error ? "PASS" : "FAIL"
  results.push({
    id: check.id,
    status,
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    log: `artifacts/quality/latest/${check.id}.log`
  })
  console.log(`${status.padEnd(4)} ${check.id} (${Math.round((Date.now() - startedAt) / 1000)}s)`)
  if (status === "FAIL") break
}

const summary = {
  generatedAt: new Date().toISOString(),
  command: "npm run qa",
  results
}
writeFileSync(resolve(outputDirectory, "results.json"), `${JSON.stringify(summary, null, 2)}\n`)

if (results.some((result) => result.status === "FAIL")) process.exitCode = 1
