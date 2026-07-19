import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "192.168.1.40", "switchback.home.arpa"],
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd()
  }
}

export default nextConfig
