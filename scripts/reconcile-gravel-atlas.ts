import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { CanonicalSegment } from "../src/lib/roads/canonical-segments"
import { reconcileGravelAtlasSources } from "../src/lib/roads/gravel-atlas/reconciliation"

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

function canonicalSegments(value: unknown): CanonicalSegment[] {
  if (Array.isArray(value)) return value as CanonicalSegment[]
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const segments = (value as { segments?: unknown }).segments
    if (Array.isArray(segments)) return segments as CanonicalSegment[]
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
  const graphPath = argument("graph")
  const graphFingerprint = argument("graph-fingerprint")?.trim()
  if (!graphPath) throw new Error("Use --graph=<canonical-routable-segments.json>")
  if (!graphFingerprint) throw new Error("Use --graph-fingerprint=<active-routing-graph-fingerprint>")

  const stagingDatabasePath = path.resolve(argument("staging") ?? "data/gravel-atlas-sources.sqlite")
  const outputPath = path.resolve(argument("output") ?? "data/gravel-atlas-verified.json")
  const graphPayload = JSON.parse(await readFile(path.resolve(graphPath), "utf8")) as unknown
  const result = await reconcileGravelAtlasSources({
    stagingDatabasePath,
    graphFingerprint,
    routableSegments: canonicalSegments(graphPayload)
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
