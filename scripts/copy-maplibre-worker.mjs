#!/usr/bin/env node
/**
 * Publishes MapLibre's worker bundle to `public/maplibre/`.
 *
 * MapLibre v6 splits its worker into `maplibre-gl-worker.mjs` plus the
 * `maplibre-gl-shared.mjs` chunk it imports as a relative sibling, and upstream
 * requires bundler consumers to point `setWorkerUrl` at the worker themselves.
 * Turbopack resolves `new URL(...)` by emitting the worker alone as a static
 * asset, which leaves its sibling import unresolvable — the worker then dies on
 * load, and because every GeoJSON source is tiled in the worker the map draws a
 * basemap with no route on it, silently.
 *
 * Copying both files to one served directory is the same remedy upstream
 * documents for esbuild and Rollup. `public/` is the one place Next serves
 * bytes verbatim, so the worker's relative import resolves normally.
 *
 * The copies are generated, never committed: this runs from `postinstall` (so
 * dev servers and CI both have it after `npm ci`) and again from `prebuild`.
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]

function main() {
  let distDir
  try {
    distDir = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"))
  } catch {
    // Dependencies are not installed yet (or MapLibre was retired). Either way
    // this is not a reason to fail an install.
    console.log("maplibre-gl not resolvable; skipping worker copy")
    return
  }

  const outDir = join(process.cwd(), "public", "maplibre")
  mkdirSync(outDir, { recursive: true })
  for (const file of FILES) {
    copyFileSync(join(distDir, file), join(outDir, file))
  }

  // The worker is only usable next to the exact chunk it imports, so guard the
  // assumption rather than shipping a half-copied pair.
  const worker = readFileSync(join(outDir, "maplibre-gl-worker.mjs"), "utf8")
  const imported = [...worker.matchAll(/from"(\.\/[^"]+)"/g)].map((match) => match[1])
  const missing = imported.filter((specifier) => !FILES.includes(specifier.replace("./", "")))
  if (missing.length > 0) {
    throw new Error(
      `MapLibre's worker imports ${missing.join(", ")}, which this copy step does not publish. `
      + "Add the file to FILES in scripts/copy-maplibre-worker.mjs."
    )
  }

  const version = JSON.parse(readFileSync(join(distDir, "..", "package.json"), "utf8")).version
  console.log(`copied maplibre-gl ${version} worker bundle to public/maplibre/`)
}

main()
