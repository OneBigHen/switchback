import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"

const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
const manifestPath = path.join(root, "manifest.json")

async function exists(file) {
  try {
    await access(file, constants.R_OK)
    return true
  } catch {
    return false
  }
}

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${script} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`))
    })
  })
}

async function main() {
  if (!(await exists(manifestPath))) {
    console.log(`route atlas: no manifest at ${manifestPath}; skipping generated-data prebuild`)
    return
  }

  await run(path.join(process.cwd(), "scripts/build-route-atlas.mjs"))
  await run(path.join(process.cwd(), "scripts/verify-route-atlas.mjs"))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
