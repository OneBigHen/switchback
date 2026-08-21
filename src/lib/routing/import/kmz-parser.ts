import { MAX_GPX_IMPORT_BYTES } from "./shared"

function zipUint16(view: DataView, offset: number): number {
  if (offset + 2 > view.byteLength) throw new Error("KMZ archive is truncated.")
  return view.getUint16(offset, true)
}

function zipUint32(view: DataView, offset: number): number {
  if (offset + 4 > view.byteLength) throw new Error("KMZ archive is truncated.")
  return view.getUint32(offset, true)
}

function kmzKmlEntry(bytes: Uint8Array): {
  compression: number
  compressed: Uint8Array
  uncompressedSize: number
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const minimumOffset = Math.max(0, bytes.byteLength - 65_557)
  let endOffset = -1
  for (let offset = Math.max(0, bytes.byteLength - 22); offset >= minimumOffset; offset -= 1) {
    if (zipUint32(view, offset) === 0x06054b50) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) throw new Error("KMZ archive has no valid central directory.")
  const entryCount = zipUint16(view, endOffset + 10)
  const directorySize = zipUint32(view, endOffset + 12)
  let offset = zipUint32(view, endOffset + 16)
  if (offset + directorySize > bytes.byteLength) throw new Error("KMZ central directory is outside the archive.")
  const decoder = new TextDecoder()
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (zipUint32(view, offset) !== 0x02014b50) throw new Error("KMZ central directory entry is invalid.")
    const flags = zipUint16(view, offset + 8)
    const compression = zipUint16(view, offset + 10)
    const compressedSize = zipUint32(view, offset + 20)
    const uncompressedSize = zipUint32(view, offset + 24)
    const nameLength = zipUint16(view, offset + 28)
    const extraLength = zipUint16(view, offset + 30)
    const commentLength = zipUint16(view, offset + 32)
    const localOffset = zipUint32(view, offset + 42)
    const nameStart = offset + 46
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength))
    offset = nameStart + nameLength + extraLength + commentLength
    if (!name.toLowerCase().endsWith(".kml")) continue
    if (flags & 0x1) throw new Error("Encrypted KMZ files cannot be imported.")
    if (uncompressedSize > MAX_GPX_IMPORT_BYTES) throw new Error("KMZ KML contents must be 5 MB or smaller.")
    if (zipUint32(view, localOffset) !== 0x04034b50) throw new Error("KMZ local entry is invalid.")
    const localNameLength = zipUint16(view, localOffset + 26)
    const localExtraLength = zipUint16(view, localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.byteLength) throw new Error("KMZ KML contents are truncated.")
    return { compression, compressed: bytes.slice(dataStart, dataEnd), uncompressedSize }
  }
  throw new Error("KMZ archive does not contain a KML route file.")
}

export async function extractKmzKml(bytes: Uint8Array): Promise<string> {
  const entry = kmzKmlEntry(bytes)
  if (entry.compression === 0) return new TextDecoder().decode(entry.compressed)
  if (entry.compression !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress this KMZ file. Extract its KML file and import that instead.")
  }
  const decompressor = new DecompressionStream("deflate-raw")
  const writer = decompressor.writable.getWriter()
  await writer.write(new Uint8Array(entry.compressed))
  await writer.close()
  const decoded = await new Response(decompressor.readable).text()
  if (new TextEncoder().encode(decoded).byteLength > MAX_GPX_IMPORT_BYTES) {
    throw new Error("KMZ KML contents must be 5 MB or smaller.")
  }
  return decoded
}
