import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { graphFingerprintFromFiles } from "../src/lib/roads/gravel-atlas/graph-build"

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

async function atomicWrite(destination: string, value: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true })
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}.${Date.now()}.tmp`)
  await rm(temporary, { force: true })
  try {
    await writeFile(temporary, `${value}\n`, "utf8")
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

async function main() {
  const outputPath = argument("write") ? path.resolve(argument("write")!) : null
  const result = await graphFingerprintFromFiles({
    osmPath: path.resolve(argument("osm") ?? "data/pa-nj-motorcycle.osm.pbf"),
    graphHopperPath: path.resolve(argument("graphhopper") ?? "data/graphhopper-web-11.0.jar"),
    configPath: path.resolve(argument("config") ?? "infra/graphhopper/config.yml"),
    customModelsDirectory: path.resolve(argument("models") ?? "infra/graphhopper/custom-models")
  })
  if (outputPath) await atomicWrite(outputPath, result.fingerprint)
  console.log(result.fingerprint)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
