export type Schema<T> = (input: unknown) => T

export type Infer<S> = S extends Schema<infer T> ? T : never

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly path: string = "",
    readonly code: string = "invalid"
  ) {
    super(message)
    this.name = "ValidationError"
  }
}

export function parse<T>(schema: Schema<T>, input: unknown): T {
  return schema(input)
}

export function safeParse<T>(schema: Schema<T>, input: unknown): { success: true; data: T } | { success: false; error: ValidationError } {
  try {
    return { success: true, data: schema(input) }
  } catch (e) {
    if (e instanceof ValidationError) return { success: false, error: e }
    return { success: false, error: new ValidationError(String(e)) }
  }
}

function fail(message: string, path: string, code = "invalid"): never {
  throw new ValidationError(message, path, code)
}

function pathKey(path: string, key: string | number): string {
  return path ? `${path}.${key}` : String(key)
}

export function string(opts: { min?: number; max?: number; trim?: boolean } = {}): Schema<string> {
  const { min = 0, max = Infinity, trim = false } = opts
  return (input) => {
    if (typeof input !== "string") fail("Expected string", "", "type")
    const value = trim ? input.trim() : input
    if (value.length < min) fail(`String too short (min ${min})`, "", "min_length")
    if (value.length > max) fail(`String too long (max ${max})`, "", "max_length")
    return value
  }
}

export function number(opts: { min?: number; max?: number; int?: boolean; finite?: boolean; positive?: boolean; nonnegative?: boolean } = {}): Schema<number> {
  const { min = -Infinity, max = Infinity, int = false, finite = false, positive = false, nonnegative = false } = opts
  return (input) => {
    let value: number
    if (typeof input === "number") {
      value = input
    } else if (typeof input === "string" && input.trim() !== "" && Number.isFinite(Number(input))) {
      value = Number(input)
    } else {
      fail("Expected number", "", "type")
    }
    if (finite && !Number.isFinite(value)) fail("Expected finite number", "", "finite")
    if (int && !Number.isInteger(value)) fail("Expected integer", "", "int")
    if (positive && value <= 0) fail("Expected positive number", "", "positive")
    if (nonnegative && value < 0) fail("Expected non-negative number", "", "nonnegative")
    if (value < min) fail(`Number too small (min ${min})`, "", "min")
    if (value > max) fail(`Number too large (max ${max})`, "", "max")
    return value
  }
}

export function coerceNumber(opts: { min?: number; max?: number; int?: boolean; finite?: boolean } = {}): Schema<number> {
  const base = number(opts)
  return (input) => {
    if (typeof input === "string") return base(Number(input))
    return base(input)
  }
}

export function boolean(): Schema<boolean> {
  return (input) => {
    if (typeof input !== "boolean") fail("Expected boolean", "", "type")
    return input
  }
}

export function literal<T extends string | number | boolean>(expected: T): Schema<T> {
  return (input) => {
    if (input !== expected) fail(`Expected literal ${JSON.stringify(expected)}`, "", "literal")
    return input as T
  }
}

export function enum_<T extends string>(values: readonly T[]): Schema<T> {
  const set = new Set(values)
  return (input) => {
    if (typeof input !== "string" || !set.has(input as T)) {
      fail(`Expected one of: ${values.join(", ")}`, "", "enum")
    }
    return input as T
  }
}

export function array<T>(itemSchema: Schema<T>, opts: { min?: number; max?: number } = {}): Schema<T[]> {
  const { min = 0, max = Infinity } = opts
  return (input) => {
    if (!Array.isArray(input)) fail("Expected array", "", "type")
    if (input.length < min) fail(`Array too short (min ${min})`, "", "min_length")
    if (input.length > max) fail(`Array too long (max ${max})`, "", "max_length")
    return input.map((item, i) => {
      try {
        return itemSchema(item)
      } catch (e) {
        if (e instanceof ValidationError) throw new ValidationError(e.message, pathKey("", i), e.code)
        throw e
      }
    })
  }
}

type ObjectShape = Record<string, Schema<unknown>>
type ObjectType<S extends ObjectShape> = { [K in keyof S]: Infer<S[K]> }

export function object_<S extends ObjectShape>(shape: S, opts: { strict?: boolean; passthrough?: boolean } = {}): Schema<ObjectType<S>> {
  const { strict = false, passthrough = false } = opts
  return (input) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      fail("Expected object", "", "type")
    }
    const obj = input as Record<string, unknown>
    const result: Record<string, unknown> = {}

    for (const [key, schema] of Object.entries(shape)) {
      try {
        if (key in obj) {
          result[key] = schema(obj[key])
        } else {
          const optionalCheck = (schema as unknown as { __optional?: boolean }).__optional
          const hasDefault = (schema as unknown as { __default?: unknown }).__default !== undefined
          if (optionalCheck) {
            if (hasDefault) {
              result[key] = (schema as unknown as { __default?: unknown }).__default
            }
          } else {
            fail(`Missing required field: ${key}`, "", "missing")
          }
        }
      } catch (e) {
        if (e instanceof ValidationError) throw new ValidationError(e.message, pathKey("", key) + (e.path ? `.${e.path}` : ""), e.code)
        throw e
      }
    }

    if (strict) {
      for (const key of Object.keys(obj)) {
        if (!(key in shape)) fail(`Unexpected field: ${key}`, key, "unexpected")
      }
    }

    if (passthrough) {
      for (const key of Object.keys(obj)) {
        if (!(key in shape)) result[key] = obj[key]
      }
    }

    return result as ObjectType<S>
  }
}

export function tuple<T extends Schema<unknown>[]>(schemas: [...T]): Schema<{ [I in keyof T]: Infer<T[I]> }> {
  return ((input: unknown) => {
    if (!Array.isArray(input)) fail("Expected tuple (array)", "", "type")
    if (input.length !== schemas.length) fail(`Expected ${schemas.length} elements`, "", "length")
    return schemas.map((schema, i) => {
      try {
        return schema(input[i])
      } catch (e) {
        if (e instanceof ValidationError) throw new ValidationError(e.message, pathKey("", i), e.code)
        throw e
      }
    })
  }) as Schema<{ [I in keyof T]: Infer<T[I]> }>
}

export function nullable<T>(schema: Schema<T>): Schema<T | null> {
  const wrapper = (input: unknown) => {
    if (input === null) return null
    return schema(input)
  }
  return wrapper
}

export function optional<T>(schema: Schema<T>): Schema<T | undefined> {
  const wrapper = ((input: unknown) => {
    if (input === undefined) return undefined
    return schema(input)
  }) as Schema<T | undefined>
  ;(wrapper as unknown as { __optional: boolean }).__optional = true
  return wrapper
}

export function withDefault<T>(schema: Schema<T>, defaultValue: T): Schema<T> {
  const wrapper = ((input: unknown) => {
    if (input === undefined) return defaultValue
    return schema(input)
  }) as Schema<T>
  ;(wrapper as unknown as { __optional: boolean }).__optional = true
  ;(wrapper as unknown as { __default: unknown }).__default = defaultValue
  return wrapper
}

export function url(): Schema<string> {
  return (input) => {
    if (typeof input !== "string") fail("Expected URL string", "", "type")
    try {
      new URL(input)
    } catch {
      fail("Invalid URL", "", "url")
    }
    return input
  }
}

export function discriminatedUnion<T extends string, V extends Record<string, Schema<unknown>>>(
  discriminant: T,
  variants: V
): Schema<Infer<V[keyof V]>> {
  return ((input: unknown) => {
    if (typeof input !== "object" || input === null) fail("Expected object", "", "type")
    const obj = input as Record<string, unknown>
    const tag = obj[discriminant]
    if (typeof tag !== "string" || !(tag in variants)) {
      fail(`Unknown ${discriminant}: ${String(tag)}`, "", "discriminant")
    }
    return variants[tag as keyof V](input)
  }) as Schema<Infer<V[keyof V]>>
}
