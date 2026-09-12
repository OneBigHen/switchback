import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { graphFingerprintFromParts } from "../src/lib/roads/gravel-atlas/graph-build"

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", resolve)
    stream.on("error", reject)
  })
  return hash.digest("hex")
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
  const osmPath = path.resolve(argument("osm") ?? "data/pa-nj-motorcycle.osm.pbf")
  const graphHopperPath = path.resolve(argument("graphhopper") ?? "data/graphhopper-web-11.0.jar")
  const configPath = path.resolve(argument("config") ?? "infra/graphhopper/config.yml")
  const modelsDirectory = path.resolve(argument("models") ?? "infra/graphhopper/custom-models")
  const outputPath = argument("write") ? path.resolve(argument("write")!) : null

  const modelNames = (await readdir(modelsDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
  if (modelNames.length === 0) throw new Error("No GraphHopper custom models were found")
  const customModelSha256s: Record<string, string> = {}
  for (const name of modelNames) customModelSha256s[name] = await sha256File(path.join(modelsDirectory, name))

  const fingerprint = graphFingerprintFromParts({
    osmSha256: await sha256File(osmPath),
    graphHopperSha256: await sha256File(graphHopperPath),
    configSha256: await sha256File(configPath),
    customModelSha256s
  })
  if (outputPath) await atomicWrite(outputPath, fingerprint)
  console.log(fingerprint)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
