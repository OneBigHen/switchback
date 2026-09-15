import type { NextConfig } from "next"

const POSTHOG_DEFAULT_CSP_ORIGINS = [
  "https://us.i.posthog.com",
  "https://us-assets.i.posthog.com",
  "https://us.posthog.com"
]

function configuredCspOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null
  } catch {
    return null
  }
}

const POSTHOG_CSP_ORIGINS = Array.from(new Set([
  ...POSTHOG_DEFAULT_CSP_ORIGINS,
  configuredCspOrigin(process.env.NEXT_PUBLIC_POSTHOG_HOST),
  configuredCspOrigin(process.env.NEXT_PUBLIC_POSTHOG_UI_HOST)
].filter((origin): origin is string => origin !== null)))

// Mapbox Standard is an opt-in browser renderer. Its style, glyph, sprite,
// terrain and telemetry requests stay behind the CSP even though the public
// access token is intentionally compiled into the client. These hosts are
// allowed unconditionally because the renderer falls back to MapLibre when no
// Mapbox token is configured; the token's URL restrictions remain the provider
// boundary.
const MAPBOX_CSP_ORIGINS = [
  "https://api.mapbox.com",
  "https://events.mapbox.com",
  "https://tiles.mapbox.com",
  "https://*.tiles.mapbox.com"
]

// Production-only security headers. Dev keeps HMR websockets and inline
// styles working without a CSP. The CSP intentionally allows 'unsafe-inline'
// scripts (Next.js inlines the RSC bootstrap); the restrictive directives (connect-src, img-src,
// object-src 'none', frame-ancestors 'none') still block the main
// data-exfiltration and clickjacking vectors.
const SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), microphone=(self), camera=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline' ${POSTHOG_CSP_ORIGINS.join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://tiles.openfreemap.org https://tiles.mapterhorn.com https://tile.opentopomap.org https://server.arcgisonline https://basemap.nationalmap.gov ${MAPBOX_CSP_ORIGINS.join(" ")}`,
      "font-src 'self' data:",
      `connect-src 'self' https://tiles.openfreemap.org https://tiles.mapterhorn.com https://tile.opentopomap.org https://server.arcgisonline.com https://basemap.nationalmap.gov ${MAPBOX_CSP_ORIGINS.join(" ")} ${POSTHOG_CSP_ORIGINS.join(" ")}`,
      "worker-src 'self' blob:",
      "media-src 'self' blob:"
    ].join("; ")
  }
]

const nextConfig: NextConfig = {
  // Hosts allowed to load dev-only `/_next/*` resources. A host missing here
  // still serves HTML but has its bundles and HMR blocked, which looks like a
  // half-rendered, unresponsive app rather than a permissions error.
  // `ride.henning.rodeo` is the tunnelled host this instance is reached on.
  allowedDevOrigins: ["127.0.0.1", "switchback.home.arpa", "ride.henning.rodeo"],
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  // The dev-mode indicator toast renders in a shadow-DOM portal at
  // z-index max; besides masking screenshots it can intercept pointer
  // events during E2E runs (it is dev-only chrome, not app UI).
  devIndicators: false,
  turbopack: {
    root: process.cwd()
  },
  ...(process.env.NODE_ENV === "production"
    ? {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: SECURITY_HEADERS
            }
          ]
        }
      }
    : {})
}

export default nextConfig
