import { parseGpxRoute } from "./import/gpx-parser"
import { parseKmlRoute } from "./import/kml-parser"
import { extractKmzKml } from "./import/kmz-parser"
import {
  MAX_GPX_IMPORT_BYTES,
  parseXml,
  type GpxImportOptions,
  type RouteImportFile
} from "./import/shared"
import type { PlannedRoute } from "./types"

export { MAX_GPX_IMPORT_BYTES, parseGpxRoute, parseKmlRoute }
export type { RouteXmlParser } from "./import/shared"

export function parseRouteImport(contents: string, options: GpxImportOptions): PlannedRoute {
  const name = options.fileName.toLowerCase()
  if (name.endsWith(".kmz")) {
    throw new Error("KMZ import is not available in this browser build. Extract the KML file and import it directly.")
  }
  if (name.endsWith(".kml")) return parseKmlRoute(contents, options)
  if (name.endsWith(".gpx")) return parseGpxRoute(contents, options)
  const root = parseXml(contents, options.parseXml).documentElement.localName
  if (root === "kml") return parseKmlRoute(contents, options)
  if (root === "gpx") return parseGpxRoute(contents, options)
  throw new Error("Choose a GPX or KML route file")
}

export async function parseRouteFile(
  file: RouteImportFile,
  options: Pick<GpxImportOptions, "parseXml"> = {}
): Promise<PlannedRoute> {
  if (file.size > MAX_GPX_IMPORT_BYTES) {
    throw new Error("Route imports must be 5 MB or smaller.")
  }
  if (file.name.toLowerCase().endsWith(".kmz")) {
    const kml = await extractKmzKml(new Uint8Array(await file.arrayBuffer()))
    return parseKmlRoute(kml, {
      fileName: file.name.replace(/\.kmz$/i, ".kml"),
      byteLength: new TextEncoder().encode(kml).byteLength,
      ...options
    })
  }
  return parseRouteImport(await file.text(), { fileName: file.name, byteLength: file.size, ...options })
}
