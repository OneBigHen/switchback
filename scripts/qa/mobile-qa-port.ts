export function validateMobileQaPort(rawPort: string | undefined): string {
  const value = rawPort ?? "3112"
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`SWITCHBACK_E2E_PORT must be a decimal TCP port from 1 to 65535; received ${JSON.stringify(value)}`)
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port > 65535) throw new Error(`SWITCHBACK_E2E_PORT must be a decimal TCP port from 1 to 65535; received ${JSON.stringify(value)}`)
  return String(port)
}
