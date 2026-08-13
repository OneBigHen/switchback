import type { NextConfig } from "next"

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
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://tiles.openfreemap.org https://tile.opentopomap.org https://server.arcgisonline https://basemap.nationalmap.gov",
      "font-src 'self' data:",
      "connect-src 'self' https://tiles.openfreemap.org https://tile.opentopomap.org https://server.arcgisonline.com https://basemap.nationalmap.gov",
      "worker-src 'self' blob:",
      "media-src 'self' blob:"
    ].join("; ")
  }
]

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "192.168.1.40", "switchback.home.arpa"],
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
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
