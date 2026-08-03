import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { Coordinate } from "@/lib/routing/types"

/**
 * Load full imported GPX route geometry from the server-side route files.
 * The catalog (`src/lib/gpx/catalog.ts`) holds summaries only; geometry lives
 * in per-route JSON under `data/gpx-library/routes/<id>.json`. Phase 4 uses
 * these as known-good corridor evidence and must degrade cleanly when the
 * files or manifest are absent.
 */

export interface GpxRouteGeometry {
  id: string
  label: string
  geometry: Coordinate[]
}

export interface GpxRouteGeometryResult {
  route: GpxRouteGeometry | null
  /** "loaded" | "missing-file" | "missing-manifest" | "unavailable" */
  status: "loaded" | "missing-file" | "missing-manifest" | "unavailable"
}

const ROUTES_DIR = "routes"

export async function loadRouteGeometry(
  routeId: string,
  libraryRoot: string,
  label = "Imported GPX"
): Promise<GpxRouteGeometryResult> {
  try {
    const raw = await readFile(join(libraryRoot, ROUTES_DIR, `${routeId}.json`), "utf8")
    const parsed = JSON.parse(raw) as { id?: string; geometry?: unknown }
    if (!Array.isArray(parsed.geometry) || parsed.geometry.length < 2) {
      return { route: null, status: "missing-file" }
    }
    const geometry = parsed.geometry.filter(isCoordinate)
    if (geometry.length < 2) return { route: null, status: "missing-file" }
    return {
      route: { id: routeId, label: parsed.id === routeId ? label : label, geometry },
      status: "loaded"
    }
  } catch (caught) {
    const code = caught instanceof Error && "code" in caught
      ? String((caught as { code?: unknown }).code)
      : ""
    if (code === "ENOENT") return { route: null, status: "missing-file" }
    return { route: null, status: "unavailable" }
  }
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
}
