import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "../..")
const read = (path: string) => readFileSync(resolve(root, path), "utf8")

describe("self-host deployment contract", () => {
  it("builds a pinned private GraphHopper service from the repository runtime", () => {
    const compose = read("deployment/docker-compose.production.yml")
    const graphhopper = compose.match(/^  graphhopper:\n([\s\S]*?)^volumes:\n/m)?.[1] ?? ""

    expect(compose).toContain("dockerfile: deployment/graphhopper.Dockerfile")
    expect(compose).not.toContain("graphhopper/graphhopper")
    expect(graphhopper).toContain("${SWITCHBACK_GRAPH_DATA_ROOT:?set SWITCHBACK_GRAPH_DATA_ROOT}")
    expect(graphhopper).toContain(":/data")
    expect(graphhopper).not.toContain(":/data:ro")
    expect(graphhopper).not.toContain("ports:")
  })

  it("keeps the edge ports and hostname explicit for private or Access-protected installs", () => {
    const compose = read("deployment/docker-compose.production.yml")
    const env = read("deployment/.env.example")
    const caddy = read("deployment/Caddyfile")
    const nextConfig = read("next.config.ts")
    const lanCaddy = read("infra/caddy/Caddyfile.example")

    expect(compose).toContain("${SWITCHBACK_HTTP_PORT:-80}:80")
    expect(compose).toContain("${SWITCHBACK_HTTPS_PORT:-443}:443")
    expect(compose).toContain("SWITCHBACK_DOMAIN: ${SWITCHBACK_DOMAIN:?set SWITCHBACK_DOMAIN}")
    expect(env).toContain("SWITCHBACK_WEBAUTHN_RP_ID=")
    expect(env).toContain("SWITCHBACK_WEBAUTHN_ORIGIN=")
    expect(env).toContain("SWITCHBACK_WEBAUTHN_RP_NAME=")
    expect(caddy).toContain("@https protocol https")
    expect(caddy).toContain("header @https")
    expect(lanCaddy).toContain("@https protocol https")
    expect(lanCaddy).toContain("header @https")
    expect(nextConfig).not.toContain("Strict-Transport-Security")
    expect(nextConfig).not.toContain("upgrade-insecure-requests")
  })

  it("binds the application and GraphHopper to the container network", () => {
    const dockerfile = read("Dockerfile")
    const entrypoint = read("deployment/graphhopper-entrypoint.sh")

    expect(dockerfile).toContain('"--hostname", "0.0.0.0"')
    expect(dockerfile).toContain("mkdir -p /data /app/.next/cache && chown -R node:node /data /app/.next")
    expect(entrypoint).toContain("bind_host: 0.0.0.0")
    expect(entrypoint).toContain("graphhopper-web-11.0.jar")
  })
})
