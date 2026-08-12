import { mkdir, readdir, readFile, rename, unlink } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"

const queue = process.env.SWITCHBACK_REGION_QUEUE ?? "data/region-queue"
const allowedRegion = /^[a-z0-9-]{2,80}$/
let stopping = false

function runRegionBuild(regionId) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["scripts/build-region-tiles.sh", regionId], { stdio: "inherit" })
    child.once("error", reject)
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`region build exited with ${code}`)))
  })
}

async function drain() {
  await mkdir(queue, { recursive: true })
  const jobs = (await readdir(queue)).filter((file) => file.endsWith(".json")).sort().slice(0, 1)
  for (const file of jobs) {
    const source = path.join(queue, file)
    const running = `${source}.running`
    try {
      await rename(source, running)
      const payload = JSON.parse(await readFile(running, "utf8"))
      if (typeof payload.regionId !== "string" || !allowedRegion.test(payload.regionId)) throw new Error("invalid region job")
      await runRegionBuild(payload.regionId)
      await unlink(running)
    } catch (error) {
      console.error(error)
      try { await rename(running, `${source}.failed`) } catch { /* job may already be gone */ }
    }
  }
}

process.once("SIGTERM", () => { stopping = true })
process.once("SIGINT", () => { stopping = true })

while (!stopping) {
  await drain()
  await new Promise((resolve) => setTimeout(resolve, 5_000))
}
