import type { Coordinate } from "@/lib/routing/types"

export const DEFAULT_GPX_STREAM_MAX_BYTES = 5 * 1024 * 1024
export const DEFAULT_GPX_STREAM_MAX_POINTS = 50_000
export const DEFAULT_GPX_STREAM_MAX_SEGMENTS = 256
export const DEFAULT_GPX_STREAM_MAX_WAYPOINTS = 10_000
export const DEFAULT_GPX_STREAM_MAX_TOKEN_BYTES = 128 * 1024

export interface GpxStreamPoint {
  coordinate: Coordinate | null
  elevationMeters: number | null
  timestampMs: number | null
  label?: string
}

export interface GpxStreamSegment {
  points: GpxStreamPoint[]
}

export interface GpxStreamTrack {
  name: string | null
  segments: GpxStreamSegment[]
}

export interface GpxStreamRoute {
  name: string | null
  segments: GpxStreamSegment[]
}

export interface GpxStreamWaypoint {
  coordinate: Coordinate | null
  label: string | null
}

export interface GpxStreamDocument {
  metadataName: string | null
  metadataDescription: string | null
  tracks: GpxStreamTrack[]
  routes: GpxStreamRoute[]
  waypoints: GpxStreamWaypoint[]
  invalidPointCount: number
  pointCount: number
}

export interface GpxStreamParserOptions {
  maxBytes?: number
  maxPoints?: number
  maxSegments?: number
  maxWaypoints?: number
  maxTokenBytes?: number
  signal?: AbortSignal
}

type PointKind = "track" | "route" | "waypoint"

interface ActivePoint extends GpxStreamPoint {
  kind: PointKind
}

interface ActiveTrack {
  name: string | null
  segments: GpxStreamSegment[]
}

interface ActiveRoute {
  name: string | null
  segments: GpxStreamSegment[]
}

interface TextCapture {
  tag: "name" | "desc" | "ele" | "time"
  value: string
}

function localName(value: string): string {
  const separator = value.lastIndexOf(":")
  return separator >= 0 ? value.slice(separator + 1).toLowerCase() : value.toLowerCase()
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    if (code.toLowerCase() === "amp") return "&"
    if (code.toLowerCase() === "lt") return "<"
    if (code.toLowerCase() === "gt") return ">"
    if (code.toLowerCase() === "quot") return '"'
    if (code.toLowerCase() === "apos") return "'"
    const value = code.toLowerCase().startsWith("#x")
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10)
    try {
      return Number.isFinite(value) ? String.fromCodePoint(value) : entity
    } catch {
      return entity
    }
  })
}

function coordinateFromAttributes(attributes: Record<string, string>): Coordinate | null {
  const latitude = Number(attributes.lat)
  const longitude = Number(attributes.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null
  }
  return [longitude, latitude]
}

function parseAttributes(source: string): { name: string; attributes: Record<string, string>; selfClosing: boolean } {
  const selfClosing = /\/\s*$/.test(source)
  const body = source.replace(/\/\s*$/, "").trim()
  const nameMatch = body.match(/^([^\s/>]+)/)
  if (!nameMatch) throw new Error("GPX contains an invalid XML tag")
  const attributes: Record<string, string> = {}
  const attributeSource = body.slice(nameMatch[0].length)
  const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (const match of attributeSource.matchAll(attributePattern)) {
    attributes[localName(match[1]!)] = decodeXmlEntities(match[2] ?? match[3] ?? "")
  }
  return { name: localName(nameMatch[1]!), attributes, selfClosing }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export class GpxStreamParser {
  private readonly options: Required<Omit<GpxStreamParserOptions, "signal">>
  private readonly decoder = new TextDecoder()
  private buffer = ""
  private bytes = 0
  private readonly stack: string[] = []
  private readonly tracks: GpxStreamTrack[] = []
  private readonly routes: GpxStreamRoute[] = []
  private readonly waypoints: GpxStreamWaypoint[] = []
  private metadataName: string | null = null
  private metadataDescription: string | null = null
  private activeTrack: ActiveTrack | null = null
  private activeRoute: ActiveRoute | null = null
  private activeSegment: GpxStreamSegment | null = null
  private activePoint: ActivePoint | null = null
  private textCapture: TextCapture | null = null
  private invalidPointCount = 0
  private pointCount = 0
  private segmentCount = 0
  private rootSeen = false
  private rootClosed = false

  constructor(private readonly parserOptions: GpxStreamParserOptions = {}) {
    this.options = {
      maxBytes: parserOptions.maxBytes ?? DEFAULT_GPX_STREAM_MAX_BYTES,
      maxPoints: parserOptions.maxPoints ?? DEFAULT_GPX_STREAM_MAX_POINTS,
      maxSegments: parserOptions.maxSegments ?? DEFAULT_GPX_STREAM_MAX_SEGMENTS,
      maxWaypoints: parserOptions.maxWaypoints ?? DEFAULT_GPX_STREAM_MAX_WAYPOINTS,
      maxTokenBytes: parserOptions.maxTokenBytes ?? DEFAULT_GPX_STREAM_MAX_TOKEN_BYTES
    }
  }

  push(chunk: Uint8Array | string): void {
    this.checkCancelled()
    const text = typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true })
    this.bytes += typeof chunk === "string" ? byteLength(chunk) : chunk.byteLength
    if (this.bytes > this.options.maxBytes) throw new Error("GPX input exceeds the configured size limit")
    this.buffer += text
    this.processBuffer(false)
  }

  finish(): GpxStreamDocument {
    this.checkCancelled()
    this.buffer += this.decoder.decode()
    this.processBuffer(true)
    if (this.stack.length > 0 || !this.rootSeen || !this.rootClosed) throw new Error("The GPX XML document is incomplete")
    if (this.activePoint || this.activeSegment || this.activeTrack || this.activeRoute) {
      throw new Error("The GPX document ended inside a route element")
    }
    return {
      metadataName: this.metadataName,
      metadataDescription: this.metadataDescription,
      tracks: this.tracks,
      routes: this.routes,
      waypoints: this.waypoints,
      invalidPointCount: this.invalidPointCount,
      pointCount: this.pointCount
    }
  }

  private checkCancelled(): void {
    if (this.parserOptions.signal?.aborted) throw new Error("GPX ingest was cancelled")
  }

  private processBuffer(final: boolean): void {
    let cursor = 0
    while (cursor < this.buffer.length) {
      const open = this.buffer.indexOf("<", cursor)
      if (open < 0) {
        const text = this.buffer.slice(cursor)
        if (byteLength(text) > this.options.maxTokenBytes) throw new Error("GPX text token exceeds the configured size limit")
        if (!final) {
          this.buffer = text
          return
        }
        this.consumeText(text)
        this.buffer = ""
        return
      }
      if (open > cursor) this.consumeText(this.buffer.slice(cursor, open))
      if (this.buffer.startsWith("<!--", open)) {
        const close = this.buffer.indexOf("-->", open + 4)
        if (close < 0) {
          if (final) throw new Error("GPX comment is incomplete")
          this.buffer = this.buffer.slice(open)
          return
        }
        cursor = close + 3
        continue
      }
      if (this.buffer.startsWith("<![CDATA[", open)) {
        const close = this.buffer.indexOf("]]>", open + 9)
        if (close < 0) {
          if (final) throw new Error("GPX CDATA section is incomplete")
          this.buffer = this.buffer.slice(open)
          return
        }
        this.consumeText(this.buffer.slice(open + 9, close))
        cursor = close + 3
        continue
      }
      const close = this.findTagEnd(open)
      if (close < 0) {
        if (final) throw new Error("GPX XML tag is incomplete")
        if (byteLength(this.buffer.slice(open)) > this.options.maxTokenBytes) {
          throw new Error("GPX XML tag exceeds the configured size limit")
        }
        this.buffer = this.buffer.slice(open)
        return
      }
      this.processTag(this.buffer.slice(open, close + 1))
      cursor = close + 1
    }
    this.buffer = ""
  }

  private findTagEnd(start: number): number {
    let quote: '"' | "'" | null = null
    for (let index = start + 1; index < this.buffer.length; index += 1) {
      const character = this.buffer[index]
      if (quote) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === ">") {
        return index
      }
    }
    return -1
  }

  private consumeText(text: string): void {
    if (this.textCapture) this.textCapture.value += decodeXmlEntities(text)
  }

  private processTag(token: string): void {
    const body = token.slice(1, -1).trim()
    if (body.startsWith("?") || body.startsWith("!")) return
    if (body.startsWith("/")) {
      const name = localName(body.slice(1).trim())
      const expected = this.stack.at(-1)
      if (expected !== name) throw new Error(`GPX XML closing tag does not match <${expected ?? "root"}>`)
      this.finishText(name, this.stack.at(-2) ?? null)
      this.finishElement(name)
      this.stack.pop()
      if (name === "gpx") this.rootClosed = true
      return
    }

    const parsed = parseAttributes(body)
    const name = parsed.name
    if (!this.rootSeen) {
      if (name !== "gpx") throw new Error("The GPX document root must be <gpx>")
      this.rootSeen = true
    } else if (this.rootClosed) {
      throw new Error("GPX XML contains content after the root element")
    }
    this.startElement(name, parsed.attributes)
    this.stack.push(name)
    if (parsed.selfClosing) {
      this.finishText(name, this.stack.at(-2) ?? null)
      this.finishElement(name)
      this.stack.pop()
      if (name === "gpx") this.rootClosed = true
    }
  }

  private startElement(name: string, attributes: Record<string, string>): void {
    if (name === "trk") {
      if (this.activeTrack || this.activeRoute) throw new Error("GPX contains nested route containers")
      this.activeTrack = { name: null, segments: [] }
    } else if (name === "trkseg") {
      if (!this.activeTrack || this.activeSegment) throw new Error("GPX track segment nesting is invalid")
      this.ensureSegmentCapacity()
      this.activeSegment = { points: [] }
    } else if (name === "rte") {
      if (this.activeTrack || this.activeRoute) throw new Error("GPX contains nested route containers")
      this.activeRoute = { name: null, segments: [] }
      this.ensureSegmentCapacity()
      this.activeSegment = { points: [] }
    } else if (name === "trkpt" || name === "rtept" || name === "wpt") {
      if (this.activePoint) throw new Error("GPX point nesting is invalid")
      const kind: PointKind = name === "trkpt" ? "track" : name === "rtept" ? "route" : "waypoint"
      if (kind !== "waypoint" && !this.activeSegment) throw new Error("GPX point is outside a segment")
      this.activePoint = {
        kind,
        coordinate: coordinateFromAttributes(attributes),
        elevationMeters: null,
        timestampMs: null
      }
    } else if (name === "name" || name === "desc" || name === "ele" || name === "time") {
      this.textCapture = { tag: name, value: "" }
    }
  }

  private finishText(name: string, parent: string | null): void {
    if (!this.textCapture || this.textCapture.tag !== name) return
    const value = this.textCapture.value.trim()
    this.textCapture = null
    if (name === "name") {
      if (this.activePoint) this.activePoint.label = value || undefined
      else if (parent === "metadata") this.metadataName = value || null
      else if (parent === "trk" && this.activeTrack) this.activeTrack.name = value || null
      else if (parent === "rte" && this.activeRoute) this.activeRoute.name = value || null
    } else if (name === "desc") {
      if (!this.activePoint && parent === "metadata") this.metadataDescription = value.slice(0, 2_000) || null
    } else if (this.activePoint) {
      if (name === "ele") {
        const elevation = Number(value)
        this.activePoint.elevationMeters = Number.isFinite(elevation) ? elevation : null
      } else if (name === "time") {
        const timestamp = Date.parse(value)
        this.activePoint.timestampMs = Number.isFinite(timestamp) ? timestamp : null
      }
    }
  }

  private finishElement(name: string): void {
    if (name === "trkpt" || name === "rtept") {
      if (!this.activePoint || this.activePoint.kind === "waypoint" || !this.activeSegment) {
        throw new Error("GPX route point state is invalid")
      }
      if (this.activePoint.coordinate) {
        this.pushPoint(this.activeSegment, this.activePoint)
      } else {
        this.invalidPointCount += 1
      }
      this.activePoint = null
    } else if (name === "wpt") {
      if (!this.activePoint || this.activePoint.kind !== "waypoint") throw new Error("GPX waypoint state is invalid")
      if (this.activePoint.coordinate) {
        if (this.waypoints.length >= this.options.maxWaypoints) throw new Error("GPX waypoint limit exceeded")
        this.waypoints.push({ coordinate: this.activePoint.coordinate, label: this.activePoint.label ?? null })
      } else {
        this.invalidPointCount += 1
      }
      this.activePoint = null
    } else if (name === "trkseg") {
      if (!this.activeTrack || !this.activeSegment) throw new Error("GPX track segment state is invalid")
      if (this.activeSegment.points.length > 0) this.activeTrack.segments.push(this.activeSegment)
      this.activeSegment = null
    } else if (name === "trk") {
      if (!this.activeTrack || this.activeSegment) throw new Error("GPX track state is invalid")
      if (this.activeTrack.segments.length > 0) this.tracks.push(this.activeTrack)
      this.activeTrack = null
    } else if (name === "rte") {
      if (!this.activeRoute || !this.activeSegment) throw new Error("GPX route state is invalid")
      if (this.activeSegment.points.length > 0) this.activeRoute.segments.push(this.activeSegment)
      if (this.activeRoute.segments.length > 0) this.routes.push(this.activeRoute)
      this.activeRoute = null
      this.activeSegment = null
    }
  }

  private pushPoint(segment: GpxStreamSegment, point: ActivePoint): void {
    if (this.pointCount >= this.options.maxPoints) throw new Error("GPX point limit exceeded")
    this.pointCount += 1
    segment.points.push({
      coordinate: point.coordinate,
      elevationMeters: point.elevationMeters,
      timestampMs: point.timestampMs
    })
  }

  private ensureSegmentCapacity(): void {
    this.segmentCount += 1
    if (this.segmentCount > this.options.maxSegments) throw new Error("GPX segment limit exceeded")
  }
}

export function parseGpxXml(xml: string, options: GpxStreamParserOptions = {}): GpxStreamDocument {
  const parser = new GpxStreamParser(options)
  parser.push(xml)
  return parser.finish()
}

export async function parseGpxChunks(
  chunks: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>,
  options: GpxStreamParserOptions = {}
): Promise<GpxStreamDocument> {
  const parser = new GpxStreamParser(options)
  for await (const chunk of chunks) parser.push(chunk)
  return parser.finish()
}
