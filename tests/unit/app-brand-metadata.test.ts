import { describe, expect, it } from "vitest"
import { metadata } from "@/app/layout"
import manifest from "@/app/manifest"

function metadataTitle(): string | undefined {
  if (typeof metadata.title === "string") return metadata.title
  if (metadata.title && typeof metadata.title === "object" && "default" in metadata.title) {
    return typeof metadata.title.default === "string" ? metadata.title.default : undefined
  }
  return undefined
}

describe("OpenGravel app identity", () => {
  it("uses OpenGravel in document metadata", () => {
    expect(metadataTitle()).toBe("OpenGravel — Find routes worth riding")
    expect(metadata.applicationName).toBe("OpenGravel")
  })

  it("uses OpenGravel in the install manifest", () => {
    const value = manifest()
    expect(value.name).toBe("OpenGravel Motorcycle Routes")
    expect(value.short_name).toBe("OpenGravel")
    expect(value.description).toBe("Find routes worth riding.")
  })
})
