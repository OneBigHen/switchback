#!/usr/bin/env node
// TASK-2.1: static dead-rule audit, originally for responsive.css. See
// docs/quality/CSS-DEAD-RULES.md for why this replaced the coverage-based
// approach the plan originally suggested, and for its own known blind spots
// (interpolated class names, third-party-injected classes) -- always
// spot-check anything this flags before deleting it.
//
// TASK-2.3 (2026-08-16) split responsive.css into per-component stylesheets
// and deleted the god-file, so this now scans every *.css file directly
// under src/app/styles/ rather than a single hardcoded target.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, extname, relative } from "node:path"

const root = process.cwd()

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, exts, out)
    else if (exts.includes(extname(full))) out.push(full)
  }
  return out
}

function parseTopLevelRules(text) {
  const rules = []
  let i = 0
  const n = text.length
  let depth = 0
  let ruleStart = -1
  let inComment = false
  let inString = null
  while (i < n) {
    const c = text[i]
    const c2 = text[i + 1]
    if (inComment) {
      if (c === "*" && c2 === "/") { inComment = false; i += 2; continue }
      i++; continue
    }
    if (inString) {
      if (c === "\\") { i += 2; continue }
      if (c === inString) inString = null
      i++; continue
    }
    if (c === "/" && c2 === "*") { inComment = true; i += 2; continue }
    if (c === '"' || c === "'") { inString = c; i++; continue }
    if (c === "{") {
      depth++
      i++; continue
    }
    if (c === "}") {
      depth--
      if (depth === 0 && ruleStart !== -1) {
        rules.push({ start: ruleStart, end: i + 1 })
        ruleStart = -1
      }
      i++; continue
    }
    if (depth === 0 && ruleStart === -1 && !/\s/.test(c)) ruleStart = i
    i++
  }
  return rules
}

function extractClasses(selector) {
  return [...selector.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map((m) => m[1])
}

const componentFiles = walk(join(root, "src/components"), [".tsx", ".ts"])
const appFiles = walk(join(root, "src/app"), [".tsx", ".ts"]).filter((f) => !f.includes("/styles/"))
const allSourceText = [...componentFiles, ...appFiles].map((f) => readFileSync(f, "utf8")).join("\n")

function isReferenced(cls) {
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp("[`\"' {]" + escaped + "[`\"' }$]")
  return re.test(allSourceText)
}

const stylesDir = join(root, "src/app/styles")
const targetFiles = readdirSync(stylesDir)
  .filter((f) => extname(f) === ".css")
  .map((f) => join(stylesDir, f))
  .sort()

const counts = {}
const flagged = []

for (const targetFile of targetFiles) {
  const sourceText = readFileSync(targetFile, "utf8")
  const lineStarts = [0]
  for (let i = 0; i < sourceText.length; i++) if (sourceText[i] === "\n") lineStarts.push(i + 1)
  function lineOf(offset) {
    let lo = 0, hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1
    }
    return lo + 1
  }

  const topLevelRules = parseTopLevelRules(sourceText)
  const results = topLevelRules
    .map((r) => ({
      file: relative(root, targetFile),
      line: lineOf(r.start),
      selector: sourceText.slice(r.start, sourceText.indexOf("{", r.start) + 1).trim()
    }))
    .filter((r) => !r.selector.startsWith("@media") && !r.selector.startsWith("@keyframes") && !r.selector.startsWith(":root"))
    .map((r) => {
      const classes = extractClasses(r.selector)
      if (classes.length === 0) return { ...r, verdict: "SKIP (no class selector)" }
      const referenced = classes.filter((c) => isReferenced(c))
      if (referenced.length === classes.length) return { ...r, verdict: "KEEP" }
      if (referenced.length === 0) return { ...r, verdict: "DEAD", unreferencedClasses: classes }
      return { ...r, verdict: "PARTIAL", unreferencedClasses: classes.filter((c) => !referenced.includes(c)) }
    })

  for (const r of results) {
    counts[r.verdict] = (counts[r.verdict] ?? 0) + 1
    if (r.verdict === "DEAD" || r.verdict === "PARTIAL") flagged.push(r)
  }
}

console.log(counts)
console.log("")
for (const r of flagged) {
  console.log(`${r.verdict}\t${r.file}:${r.line}\t${r.selector.replace(/\n/g, " ").slice(0, 100)}`)
}
