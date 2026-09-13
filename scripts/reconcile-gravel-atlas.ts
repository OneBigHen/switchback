import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { CanonicalSegment } from "../src/lib/roads/canonical-segments"
import { parseCanonicalGraphExport } from "../src/lib/roads/gravel-atlas/graph-build"
import { reconcileGravelAtlasSources } from "../src/lib/roads/gravel-atlas/reconciliation"

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

async function atomicJsonWrite(destination: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true })
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${Date.now()}.tmp`
  )
  await rm(temporary, { force: true })
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

async function main() {
  const graphPath = argument("graph") ?? "data/gravel-atlas-graph.json"
  const stagingDatabasePath = path.resolve(argument("staging") ?? "data/gravel-atlas-sources.sqlite")
  const outputPath = path.resolve(argument("output") ?? "data/gravel-atlas-verified.json")
  const graph = parseCanonicalGraphExport(
    JSON.parse(await readFile(path.resolve(graphPath), "utf8")) as unknown,
    argument("graph-fingerprint")
  )

  const result = await reconcileGravelAtlasSources({
    stagingDatabasePath,
    graphFingerprint: graph.graphFingerprint,
    routableSegments: graph.segments as CanonicalSegment[]
  })

  await atomicJsonWrite(outputPath, result)
  console.log(JSON.stringify({
    outputPath,
    graphFingerprint: result.graphFingerprint,
    sourceFingerprint: result.sourceFingerprint,
    corridorCount: result.corridors.length,
    quarantinedCount: result.quarantined.length
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
