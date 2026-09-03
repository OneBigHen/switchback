import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  atlasIntegrityProblems,
  atlasSourceFingerprint,
} from "./lib/route-atlas-integrity.mjs"

const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")

async function main() {
  const manifestRaw = await readFile(path.join(root, "manifest.json"), "utf8")
  const manifest = JSON.parse(manifestRaw)
  const routeSources = new Map()
  for (const summary of manifest.routes ?? []) {
    routeSources.set(summary.id, await readFile(path.join(root, "routes", `${summary.id}.json`), "utf8"))
  }

  const atlas = JSON.parse(await readFile(path.join(root, "atlas.json"), "utf8"))
  const expectedFingerprint = atlasSourceFingerprint(manifestRaw, manifest.routes ?? [], routeSources)
  const problems = atlasIntegrityProblems({ manifest, atlas, expectedFingerprint })
  if (problems.length > 0) {
    throw new Error(`Route atlas integrity failed:\n- ${problems.join("\n- ")}`)
  }

  console.log(`route atlas: verified ${Object.keys(atlas.routes).length} manifest routes (${atlas.count} distinct shapes)`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
