#!/usr/bin/env node
// Fails when an installed dependency runs an install-time lifecycle hook that
// nobody reviewed. npm has no built-in allowlist, so the reviewed set lives in
// package.json under "allowScripts" and this check enforces it.
//
// Only preinstall/install/postinstall are enforced: npm does not run a
// registry dependency's "prepare" script, so those are not an install-time
// execution path and listing them would just create noise.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const INSTALL_HOOKS = ["preinstall", "install", "postinstall"]

function collect(dir, found = new Map()) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const full = join(dir, entry.name)
    if (entry.name.startsWith("@")) {
      collect(full, found)
      continue
    }
    if (entry.name === ".bin") continue
    try {
      const manifest = JSON.parse(readFileSync(join(full, "package.json"), "utf8"))
      const hooks = INSTALL_HOOKS.filter((hook) => manifest.scripts?.[hook])
      if (hooks.length > 0) found.set(`${manifest.name}@${manifest.version}`, hooks)
    } catch {
      // Not a package directory; keep walking for nested node_modules.
    }
    collect(join(full, "node_modules"), found)
  }
  return found
}

const reviewed = JSON.parse(readFileSync("package.json", "utf8")).allowScripts ?? {}
const approved = new Set(Object.entries(reviewed).filter(([, ok]) => ok === true).map(([id]) => id))
const installed = collect("node_modules")

const unreviewed = [...installed.keys()].filter((id) => !approved.has(id)).sort()
const stale = [...approved].filter((id) => !installed.has(id)).sort()

for (const [id, hooks] of [...installed].sort()) {
  console.log(`${approved.has(id) ? "reviewed  " : "UNREVIEWED"} ${id} (${hooks.join(", ")})`)
}

if (unreviewed.length > 0) {
  console.error(`\nUnreviewed install scripts: ${unreviewed.join(", ")}`)
  console.error('Review the script, then add "<name>@<version>": true to "allowScripts" in package.json.')
  process.exit(1)
}
if (stale.length > 0) {
  console.error(`\nReviewed entries no longer installed: ${stale.join(", ")}`)
  console.error('Remove them from "allowScripts" so the reviewed set stays exact.')
  process.exit(1)
}
console.log(`\n${installed.size} install script(s), all reviewed.`)
