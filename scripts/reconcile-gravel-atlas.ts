import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { CanonicalSegment } from "../src/lib/roads/canonical-segments"
import { reconcileGravelAtlasSources } from "../src/lib/roads/gravel-atlas/reconciliation"

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

function canonicalGraph(value: unknown): { graphFingerprint?: string; segments: CanonicalSegment[] } {
  if (Array.isArray(value)) return { segments: value as CanonicalSegment[] }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const payload = value as { graphFingerprint?: unknown; segments?: unknown }
    if (Array.isArray(payload.segments)) {
      return {
        ...(typeof payload.graphFingerprint === "string" ? { graphFingerprint: payload.graphFingerprint.trim() } : {}),
        segments: payload.segments as CanonicalSegment[]
      }
    }
  }
  throw new Error("Canonical graph JSON must be an array or an object with a segments array")
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
  const graph = canonicalGraph(JSON.parse(await readFile(path.resolve(graphPath), "utf8")) as unknown)
  const requestedFingerprint = argument("graph-fingerprint")?.trim()
  if (requestedFingerprint && graph.graphFingerprint && requestedFingerprint !== graph.graphFingerprint) {
    throw new Error("Requested graph fingerprint does not match the canonical graph export")
  }
  const graphFingerprint = requestedFingerprint || graph.graphFingerprint
  if (!graphFingerprint) throw new Error("Canonical graph export does not contain graphFingerprint")

  const result = await reconcileGravelAtlasSources({
    stagingDatabasePath,
    graphFingerprint,
    routableSegments: graph.segments
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
