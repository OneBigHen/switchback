#!/usr/bin/env node
// TASK-1.4: for every className in src/components/**, check a matching CSS
// rule exists anywhere in src/app/styles/*.css. Static-analysis heuristic --
// it extracts literal string segments from className="..." and
// className={...} expressions, so it can mis-flag class names that only
// ever appear as dynamic template fragments; see docs/quality/ORPHANED-CLASSES.md
// for the manually-verified result.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, extname } from "node:path"

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, exts, out)
    else if (exts.includes(extname(full))) out.push(full)
  }
  return out
}

const root = process.cwd()
const componentFiles = walk(join(root, "src/components"), [".tsx", ".ts"])
const cssFiles = walk(join(root, "src/app/styles"), [".css"])

const cssText = cssFiles.map((f) => readFileSync(f, "utf8")).join("\n")
const definedClasses = new Set(
  [...cssText.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map((m) => m[1])
)

const usages = new Map()

function recordClasses(str, file) {
  for (const token of str.split(/\s+/)) {
    const cls = token.trim()
    if (!cls || cls.includes("{") || cls.includes("$")) continue
    if (!usages.has(cls)) usages.set(cls, new Set())
    usages.get(cls).add(file)
  }
}

for (const file of componentFiles) {
  const text = readFileSync(file, "utf8")
  const rel = file.replace(root + "/", "")
  for (const m of text.matchAll(/className="([^"]*)"/g)) recordClasses(m[1], rel)
  for (const m of text.matchAll(/className=\{`([^`]*)`\}/g)) {
    const literalSegments = m[1].split(/\$\{[^}]*\}/)
    for (const seg of literalSegments) recordClasses(seg, rel)
  }
  for (const m of text.matchAll(/className=\{[^}]*\}/g)) {
    for (const s of m[0].matchAll(/"([a-zA-Z][a-zA-Z0-9_-]*(?:\s+[a-zA-Z][a-zA-Z0-9_-]*)*)"/g)) {
      recordClasses(s[1], rel)
    }
  }
}

const orphaned = [...usages.entries()]
  .filter(([cls]) => !definedClasses.has(cls))
  .sort(([a], [b]) => a.localeCompare(b))

console.log(`Total distinct className tokens found: ${usages.size}`)
console.log(`Orphaned (no matching CSS rule found): ${orphaned.length}`)
console.log("")
for (const [cls, files] of orphaned) {
  console.log(`${cls}\t${[...files].join(", ")}`)
}
