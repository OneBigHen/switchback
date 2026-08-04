/**
 * Byte-capped JSON body reader for public POST endpoints.
 *
 * `request.json()` buffers the entire body before validation, so a caller
 * can make the server allocate unbounded memory. This streams the body
 * through a reader and cancels as soon as the cap is exceeded, matching the
 * pattern already used by /api/routes.
 */

export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`)
    this.name = "BodyTooLargeError"
  }
}

export async function readBoundedJsonBody(
  request: Request,
  maxBytes = 16 * 1024
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BodyTooLargeError(maxBytes)
  }
  if (!request.body) throw new Error("Request body is empty.")
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      if (bytesRead > maxBytes) {
        await reader.cancel()
        throw new BodyTooLargeError(maxBytes)
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    return JSON.parse(body)
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) throw caught
    throw new Error("Request body is not valid JSON.")
  }
}
