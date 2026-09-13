import path from "node:path"
import { collectOfficialSourceSnapshot } from "../src/lib/roads/gravel-atlas/source-snapshot"
import { writeOfficialSourceSnapshots } from "../src/lib/roads/gravel-atlas/source-store"
import { resolveOperatorSourceIds } from "../src/lib/roads/gravel-atlas/sources"

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

async function main() {
  // Pennsylvania (PASDA) is refused here until production-use authorization is
  // independently established; there is deliberately no override flag.
  const sources = resolveOperatorSourceIds(argument("sources") ?? "njgin-ng911")
  const databasePath = path.resolve(argument("database") ?? "data/gravel-atlas-sources.sqlite")

  const snapshots = []
  for (const sourceId of sources) {
    const snapshot = await collectOfficialSourceSnapshot(sourceId)
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
