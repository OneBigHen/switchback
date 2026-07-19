export const PUBLIC_SWITCHBACK_HOST = "ride.henning.rodeo"

export function shouldUpgradeCloudflareHttp(headers: Headers, hostname: string): boolean {
  return hostname.toLowerCase() === PUBLIC_SWITCHBACK_HOST
    && /"scheme"\s*:\s*"http"/i.test(headers.get("cf-visitor") ?? "")
}
