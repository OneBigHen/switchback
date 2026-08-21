import { describe, expect, it } from "vitest"
import { MAX_GPX_IMPORT_BYTES } from "@/lib/routing/gpx-import"
import { extractKmzKml } from "@/lib/routing/import/kmz-parser"

function storedKmz(
  name: string,
  contents: Uint8Array,
  flags = 0,
  compression = 0,
  uncompressedSize = contents.length
): Uint8Array {
  const entryName = new TextEncoder().encode(name)
  const local = new Uint8Array(30 + entryName.length + contents.length)
  const localView = new DataView(local.buffer)
  localView.setUint32(0, 0x04034b50, true)
  localView.setUint16(4, 20, true)
  localView.setUint16(6, flags, true)
  localView.setUint16(8, compression, true)
  localView.setUint32(18, contents.length, true)
  localView.setUint32(22, contents.length, true)
  localView.setUint16(26, entryName.length, true)
  local.set(entryName, 30)
  local.set(contents, 30 + entryName.length)

  const central = new Uint8Array(46 + entryName.length)
  const centralView = new DataView(central.buffer)
  centralView.setUint32(0, 0x02014b50, true)
  centralView.setUint16(4, 20, true)
  centralView.setUint16(6, 20, true)
  centralView.setUint16(8, flags, true)
  centralView.setUint16(10, compression, true)
  centralView.setUint32(20, contents.length, true)
  centralView.setUint32(24, uncompressedSize, true)
  centralView.setUint16(28, entryName.length, true)
  central.set(entryName, 46)

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, 1, true)
  endView.setUint16(10, 1, true)
  endView.setUint32(12, central.length, true)
  endView.setUint32(16, local.length, true)

  const archive = new Uint8Array(local.length + central.length + end.length)
  archive.set(local)
  archive.set(central, local.length)
  archive.set(end, local.length + central.length)
  return archive
}

describe("KMZ parser", () => {
  it("extracts a stored KML entry", async () => {
    const kml = "<kml><Document><name>Stored</name></Document></kml>"

    await expect(extractKmzKml(storedKmz("doc.kml", new TextEncoder().encode(kml))))
      .resolves.toBe(kml)
  })

  it("extracts a deflated KML entry when the platform supports raw deflate", async () => {
    const kml = "<kml><Document><name>Deflated</name></Document></kml>"
    const compressor = new CompressionStream("deflate-raw")
    const writer = compressor.writable.getWriter()
    await writer.write(new TextEncoder().encode(kml))
    await writer.close()
    const compressed = new Uint8Array(await new Response(compressor.readable).arrayBuffer())

    await expect(extractKmzKml(storedKmz("doc.kml", compressed, 0, 8, new TextEncoder().encode(kml).length)))
      .resolves.toBe(kml)
  })

  it("rejects encrypted entries before attempting extraction", async () => {
    await expect(extractKmzKml(storedKmz("doc.kml", new Uint8Array([1]), 0x1)))
      .rejects.toThrow(/encrypted/i)
  })

  it("rejects an archive without a KML route entry", async () => {
    await expect(extractKmzKml(storedKmz("readme.txt", new Uint8Array([1, 2, 3]))))
      .rejects.toThrow(/does not contain a KML/i)
  })

  it("rejects a declared KML size above the import limit", async () => {
    const archive = storedKmz("doc.kml", new Uint8Array([1]))
    const centralOffset = archive.length - 22 - 46 - "doc.kml".length
    new DataView(archive.buffer).setUint32(24 + centralOffset, MAX_GPX_IMPORT_BYTES + 1, true)

    await expect(extractKmzKml(archive)).rejects.toThrow(/5 MB/i)
  })

  it("rejects a truncated archive", async () => {
    await expect(extractKmzKml(new Uint8Array([0, 1, 2]))).rejects.toThrow(/central directory|truncated/i)
  })
})
