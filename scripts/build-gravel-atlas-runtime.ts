import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  buildGravelAtlasRuntimeDatabase,
  type VerifiedGravelAtlasCorridorInput
} from "../src/lib/roads/gravel-atlas/runtime-builder"

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

interface RuntimeBuildInput {
  graphFingerprint?: unknown
  corridors?: unknown
}

function parseInput(value: unknown): { graphFingerprint: string; corridors: VerifiedGravelAtlasCorridorInput[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Verified Gravel Atlas build input must be a JSON object")
  }
  const input = value as RuntimeBuildInput
  if (typeof input.graphFingerprint !== "string" || !input.graphFingerprint.trim()) {
    throw new Error("Verified Gravel Atlas build input needs graphFingerprint")
  }
  if (!Array.isArray(input.corridors)) throw new Error("Verified Gravel Atlas build input needs a corridors array")
  return {
    graphFingerprint: input.graphFingerprint.trim(),
    corridors: input.corridors as VerifiedGravelAtlasCorridorInput[]
  }
}

async function main() {
  const inputPath = path.resolve(argument("input") ?? "data/gravel-atlas-verified.json")
  const stagingDatabasePath = path.resolve(argument("staging") ?? "data/gravel-atlas-sources.sqlite")
  const databasePath = path.resolve(argument("database") ?? "data/gravel-atlas.sqlite")
  const input = parseInput(JSON.parse(await readFile(inputPath, "utf8")) as unknown)

  const result = buildGravelAtlasRuntimeDatabase({
    stagingDatabasePath,
    databasePath,
    graphFingerprint: input.graphFingerprint,
    corridors: input.corridors
  })
  console.log(JSON.stringify(result))
  console.log(`Set GRAVEL_ATLAS_GRAPH_FINGERPRINT=${result.graphFingerprint}`)
  console.log(`Set GRAVEL_ATLAS_SOURCE_FINGERPRINT=${result.sourceFingerprint}`)
  console.log(`Set GRAVEL_ATLAS_DB_PATH=${result.databasePath}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
