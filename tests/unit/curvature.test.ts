import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  CurvatureRepository,
  curvatureFeatureCollection
} from "@/lib/curvature/repository"

describe("curvature repository", () => {
  let directory: string
  let databasePath: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "switchback-curvature-"))
    databasePath = join(directory, "segments.db")
    const database = new Database(databasePath)
    database.exec(`
      create table segments (
        id text primary key,
        name text,
        score real,
        mid_lat real,
        mid_lon real,
        surface text,
        geometry text
      );
      create index idx_loc on segments(mid_lat, mid_lon);
    `)
    const insert = database.prepare(
      "insert into segments values (?, ?, ?, ?, ?, ?, ?)"
    )
    insert.run("inside", "River Road", 900, 40.2, -76.8, "unknown", JSON.stringify([[-76.81, 40.19], [-76.79, 40.21]]))
    insert.run("low", "Main Street", 350, 40.21, -76.79, "unknown", JSON.stringify([[-76.8, 40.2], [-76.78, 40.22]]))
    insert.run("outside", "Far Road", 1200, 41.2, -76.8, "unknown", JSON.stringify([[-76.8, 41.1], [-76.8, 41.3]]))
    database.close()
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it("returns only high-scoring segments inside the requested viewport", () => {
    const repository = new CurvatureRepository(databasePath)
    const segments = repository.queryBounds({
      south: 40,
      west: -77,
      north: 40.5,
      east: -76.5,
      minScore: 700,
      limit: 100
    })

    expect(segments.map((segment) => segment.id)).toEqual(["inside"])
    expect(curvatureFeatureCollection(segments)).toMatchObject({
      type: "FeatureCollection",
      features: [
        {
          properties: { id: "inside", name: "River Road", curvature: 900 },
          geometry: { type: "LineString" }
        }
      ]
    })
  })

  it("rejects inverted viewport bounds", () => {
    const repository = new CurvatureRepository(databasePath)
    expect(() =>
      repository.queryBounds({
        south: 41,
        west: -77,
        north: 40,
        east: -76,
        minScore: 700,
        limit: 10
      })
    ).toThrow(/south.*north/i)
  })
})
