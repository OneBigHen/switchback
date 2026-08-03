import { describe, expect, it } from "vitest"
import {
  ValidationError,
  array,
  boolean,
  coerceNumber,
  discriminatedUnion,
  enum_,
  literal,
  nullable,
  number,
  object_,
  optional,
  parse,
  safeParse,
  string,
  tuple,
  url,
  withDefault,
  type Infer
} from "@/lib/validate"

describe("string", () => {
  it("passes through plain strings", () => {
    expect(string()("hello")).toBe("hello")
  })

  it("trims when requested", () => {
    expect(string({ trim: true })("  padded  ")).toBe("padded")
  })

  it("enforces min and max length", () => {
    expect(() => string({ min: 3 })("ab")).toThrowError(ValidationError)
    expect(() => string({ max: 3 })("abcd")).toThrowError(ValidationError)
  })

  it("rejects non-strings with a type code", () => {
    try {
      string()(42)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).code).toBe("type")
    }
  })
})

describe("number", () => {
  it("accepts numbers and coercible numeric strings", () => {
    expect(number()(3)).toBe(3)
    expect(number()("3")).toBe(3)
  })

  it("rejects non-numeric input", () => {
    expect(() => number()("3 miles")).toThrowError(ValidationError)
    expect(() => number()("")).toThrowError(ValidationError)
  })

  it("enforces int, finite, positive, nonnegative, min, and max", () => {
    expect(() => number({ int: true })(1.5)).toThrowError(/integer/)
    expect(() => number({ finite: true })(Infinity)).toThrowError(/finite/)
    expect(() => number({ positive: true })(0)).toThrowError(/positive/)
    expect(() => number({ nonnegative: true })(-1)).toThrowError(/non-negative/)
    expect(() => number({ min: 5 })(4)).toThrowError(/min/)
    expect(() => number({ max: 5 })(6)).toThrowError(/max/)
  })
})

describe("coerceNumber", () => {
  it("coerces strings including decimals", () => {
    expect(coerceNumber()("12.5")).toBe(12.5)
  })

  it("still enforces bounds after coercion", () => {
    expect(() => coerceNumber({ int: true })("12.5")).toThrowError(ValidationError)
  })
})

describe("boolean / literal / enum_", () => {
  it("validates booleans", () => {
    expect(boolean()(true)).toBe(true)
    expect(() => boolean()("true")).toThrowError(ValidationError)
  })

  it("validates literals", () => {
    expect(literal("ready")("ready")).toBe("ready")
    expect(() => literal("ready")("go")).toThrowError(/literal/)
  })

  it("validates enums", () => {
    expect(enum_(["quick", "twisty"] as const)("twisty")).toBe("twisty")
    expect(() => enum_(["quick", "twisty"] as const)("scenic")).toThrowError(/one of/)
  })
})

describe("array", () => {
  it("validates each item and propagates the index in the path", () => {
    try {
      array(number())([1, "bad", 3])
      expect.unreachable()
    } catch (error) {
      expect((error as ValidationError).path).toBe("1")
    }
  })

  it("enforces min and max length", () => {
    expect(() => array(number(), { min: 2 })([1])).toThrowError(/too short/)
    expect(() => array(number(), { max: 2 })([1, 2, 3])).toThrowError(/too long/)
  })

  it("rejects non-arrays", () => {
    expect(() => array(number())("nope")).toThrowError(ValidationError)
  })
})

describe("object_", () => {
  const schema = object_({
    name: string({ min: 1 }),
    age: number({ int: true, min: 0 }),
    tags: array(string())
  })

  it("validates a complete object", () => {
    expect(parse(schema, { name: "Ada", age: 36, tags: ["math"] })).toEqual({
      name: "Ada",
      age: 36,
      tags: ["math"]
    })
  })

  it("rejects a missing required field with a field path", () => {
    try {
      schema({ name: "Ada", tags: [] })
      expect.unreachable()
    } catch (error) {
      expect((error as ValidationError).code).toBe("missing")
      expect((error as ValidationError).path).toBe("age")
    }
  })

  it("reports nested missing fields with a dotted path", () => {
    const nested = object_({ address: object_({ city: string(), zip: string() }) })
    try {
      nested({ address: { city: "Doylestown" } })
      expect.unreachable()
    } catch (error) {
      expect((error as ValidationError).code).toBe("missing")
      expect((error as ValidationError).path).toBe("address.zip")
    }
  })

  it("rejects non-object input", () => {
    expect(() => schema(null)).toThrowError(/object/)
    expect(() => schema([1])).toThrowError(/object/)
  })

  it("supports strict mode", () => {
    const strict = object_({ a: number() }, { strict: true })
    expect(() => strict({ a: 1, b: 2 })).toThrowError(/Unexpected field: b/)
  })

  it("supports passthrough mode", () => {
    const passthrough = object_({ a: number() }, { passthrough: true })
    expect(passthrough({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
  })

  it("supports optional and withDefault fields", () => {
    const optionalSchema = object_({
      a: optional(number()),
      b: withDefault(string(), "default")
    })
    expect(optionalSchema({})).toEqual({ b: "default" })
    expect(optionalSchema({ a: 1, b: "x" })).toEqual({ a: 1, b: "x" })
    expect(() => optionalSchema({ a: "bad", b: "x" })).toThrowError(ValidationError)
  })
})

describe("tuple", () => {
  it("validates fixed-length tuples", () => {
    const latLon = tuple([number(), number()])
    expect(parse(latLon, [1, 2])).toEqual([1, 2])
    expect(() => latLon([1])).toThrowError(/2 elements/)
    expect(() => latLon([1, "x"])).toThrowError(ValidationError)
  })
})

describe("nullable / optional", () => {
  it("allows null and undefined respectively", () => {
    expect(nullable(number())(null)).toBeNull()
    expect(nullable(number())(5)).toBe(5)
    expect(() => nullable(number())("x")).toThrowError(ValidationError)
    expect(optional(number())(undefined)).toBeUndefined()
    expect(optional(number())(5)).toBe(5)
  })
})

describe("url", () => {
  it("accepts valid URLs and rejects invalid ones", () => {
    expect(url()("https://example.com/path?q=1")).toBe("https://example.com/path?q=1")
    expect(() => url()("not a url")).toThrowError(/URL/)
  })
})

describe("discriminatedUnion", () => {
  const schema = discriminatedUnion("kind", {
    loop: object_({ kind: literal("loop"), minutes: number() }),
    destination: object_({ kind: literal("destination"), place: string() })
  })

  it("routes to the matching variant", () => {
    expect(parse(schema, { kind: "loop", minutes: 90 })).toEqual({ kind: "loop", minutes: 90 })
    expect(parse(schema, { kind: "destination", place: "Stockton" })).toEqual({ kind: "destination", place: "Stockton" })
  })

  it("rejects unknown discriminants and mismatched shapes", () => {
    expect(() => schema({ kind: "roundtrip" })).toThrowError(/Unknown kind/)
    expect(() => schema({ kind: "loop" })).toThrowError(ValidationError)
  })
})

describe("safeParse", () => {
  it("returns success data", () => {
    const result = safeParse(number(), 7)
    expect(result).toEqual({ success: true, data: 7 })
  })

  it("returns the ValidationError on failure", () => {
    const result = safeParse(number(), "nope")
    if (result.success) expect.unreachable()
    expect(result.error).toBeInstanceOf(ValidationError)
  })

  it("wraps non-ValidationError throws", () => {
    const throwing = (): number => {
      throw new Error("boom")
    }
    const result = safeParse(throwing, undefined)
    if (result.success) expect.unreachable()
    expect(result.error).toBeInstanceOf(ValidationError)
    expect(result.error.message).toContain("boom")
  })
})

describe("Infer", () => {
  it("derives the output type of composed schemas", () => {
    const schema = object_({
      mode: enum_(["loop", "destination"] as const),
      targetMinutes: nullable(number({ int: true, min: 20, max: 480 }))
    })
    type Intent = Infer<typeof schema>
    const intent: Intent = parse(schema, { mode: "loop", targetMinutes: 120 })
    expect(intent.mode).toBe("loop")
    expect(intent.targetMinutes).toBe(120)
  })
})
