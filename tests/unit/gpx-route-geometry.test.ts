import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadRouteGeometry } from "@/lib/gpx/route-geometry"

describe("GPX route geometry loader", () => {
  it("loads full geometry from the per-route JSON file", async () => {
    const root = await mkdtemp(join(tmpdir(), "gpx-geom-"))
    await mkdir(join(root, "routes"), { recursive: true })
    await writeFile(join(root, "routes", "route-1.json"), JSON.stringify({
      id: "route-1",
      geometry: [[-76.9, 40.2], [-76.8, 40.25], [-76.7, 40.3]]
    }))
    try {
      const result = await loadRouteGeometry("route-1", root, "Ridge loop")
      expect(result.status).toBe("loaded")
      expect(result.route?.geometry).toHaveLength(3)
      expect(result.route?.label).toBe("Ridge loop")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("reports missing files without throwing", async () => {
    const root = await mkdtemp(join(tmpdir(), "gpx-geom-"))
    try {
      const result = await loadRouteGeometry("missing", root)
      expect(result.status).toBe("missing-file")
      expect(result.route).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("rejects malformed or short geometry as unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "gpx-geom-"))
    await mkdir(join(root, "routes"), { recursive: true })
    await writeFile(join(root, "routes", "bad.json"), JSON.stringify({ id: "bad", geometry: [[-76.9, 40.2]] }))
    try {
      const result = await loadRouteGeometry("bad", root)
      expect(result.status).toBe("missing-file")
      expect(result.route).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
