import path from "node:path"
import { collectOfficialSourceSnapshot } from "../src/lib/roads/gravel-atlas/source-snapshot"
import { writeOfficialSourceSnapshots } from "../src/lib/roads/gravel-atlas/source-store"
import type { GravelAtlasOfficialSourceId } from "../src/lib/roads/gravel-atlas/sources"

const KNOWN_SOURCES = new Set<GravelAtlasOfficialSourceId>(["pa-pasda-2012", "njgin-ng911"])

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`)
}

function requestedSources(): GravelAtlasOfficialSourceId[] {
  const raw = argument("sources") ?? "njgin-ng911"
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean)
  if (values.length === 0) throw new Error("At least one Gravel Atlas source is required")
  const unique: GravelAtlasOfficialSourceId[] = []
  for (const value of values) {
    if (!KNOWN_SOURCES.has(value as GravelAtlasOfficialSourceId)) {
      throw new Error(`Unknown Gravel Atlas source: ${value}`)
    }
    const source = value as GravelAtlasOfficialSourceId
    if (!unique.includes(source)) unique.push(source)
  }
  return unique
}

async function main() {
  const sources = requestedSources()
  const databasePath = path.resolve(argument("database") ?? "data/gravel-atlas-sources.sqlite")
  const acceptPasdaTerms = hasFlag("accept-pasda-terms")
  if (sources.includes("pa-pasda-2012") && !acceptPasdaTerms) {
    throw new Error(
      "PASDA source terms restrict reproduction/redistribution. Re-run with --accept-pasda-terms only after reviewing and accepting those terms; the flag is an operator acknowledgement, not a license grant."
    )
  }

  const snapshots = []
  for (const sourceId of sources) {
    const snapshot = await collectOfficialSourceSnapshot(sourceId, {
      acceptRestrictedSource: sourceId === "pa-pasda-2012" ? acceptPasdaTerms : undefined
    })
    snapshots.push(snapshot)
    console.log(JSON.stringify({ sourceId, fingerprint: snapshot.fingerprint, stats: snapshot.stats }))
  }

  const result = writeOfficialSourceSnapshots({ databasePath, snapshots })
  console.log(JSON.stringify({
    databasePath: result.databasePath,
    sourceFingerprint: result.sourceFingerprint,
    sourceCount: result.sourceCount,
    observationCount: result.observationCount
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
