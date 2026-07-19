const PUBLIC_SWITCHBACK_HOST = "ride.henning.rodeo"

export interface BrowserLocationParts {
  protocol: string
  hostname: string
  pathname: string
  search: string
  hash: string
}

export function publicSwitchbackHttpsUrl(location: BrowserLocationParts): string | null {
  if (location.protocol !== "http:" || location.hostname.toLowerCase() !== PUBLIC_SWITCHBACK_HOST) {
    return null
  }
  return `https://${PUBLIC_SWITCHBACK_HOST}${location.pathname}${location.search}${location.hash}`
}
