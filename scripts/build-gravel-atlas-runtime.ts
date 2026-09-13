import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  buildGravelAtlasRuntimeDatabase,
  parseVerifiedRuntimeInput
} from "../src/lib/roads/gravel-atlas/runtime-builder"

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

async function main() {
  // Runtime publication must consume the live-router verification artifact.
  // The reconciliation-only payload deliberately lacks a policy version and is
  // therefore rejected even when an operator invokes this script directly.
  const inputPath = path.resolve(argument("input") ?? "data/gravel-atlas-verified-traversable.json")
  const stagingDatabasePath = path.resolve(argument("staging") ?? "data/gravel-atlas-sources.sqlite")
  const databasePath = path.resolve(argument("database") ?? "data/gravel-atlas.sqlite")
  const input = parseVerifiedRuntimeInput(JSON.parse(await readFile(inputPath, "utf8")) as unknown)

  const result = buildGravelAtlasRuntimeDatabase({
    stagingDatabasePath,
    databasePath,
    graphFingerprint: input.graphFingerprint,
    expectedSourceFingerprint: input.sourceFingerprint,
    traversabilityPolicyVersion: input.traversabilityPolicyVersion,
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
