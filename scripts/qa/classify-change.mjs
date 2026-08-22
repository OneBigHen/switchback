const asPath = (file) => (typeof file === "string" ? file : file?.path ?? "").replaceAll("\\", "/")

const isDocs = (path) => /^(?:docs\/|README(?:\.[^/]+)?$|CHANGELOG(?:\.[^/]+)?$)/i.test(path)

const matchesAny = (paths, pattern) => paths.some((path) => pattern.test(path))

/**
 * Classify a changed-file set using deterministic paths and diff size only.
 * AI may raise a result later, but it is not needed to produce this baseline.
 */
export function classifyChange(files = []) {
  const normalized = files.map((file) => ({
    path: asPath(file),
    additions: typeof file === "string" ? 0 : Number(file?.additions ?? 0),
    deletions: typeof file === "string" ? 0 : Number(file?.deletions ?? 0)
  }))
  const paths = normalized.map(({ path }) => path).filter(Boolean)
  const totalLines = normalized.reduce((sum, file) => sum + file.additions + file.deletions, 0)

  if (paths.length > 0 && paths.every(isDocs)) return "docs"

  if (
    matchesAny(
      paths,
      /(^|\/)(auth|security|secrets?|permissions?|iam|\.github\/workflows|infra|deploy(?:ment)?)(\/|$)|(^|\/)(?:\.env|.*\.(?:pem|key|crt))$/i
    ) ||
    matchesAny(paths, /(cloudflare|csrf|csp|rate-limit)/i)
  ) {
    return "security"
  }

  if (
    paths.length > 20 ||
    totalLines > 300 ||
    matchesAny(paths, /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|tsconfig(?:\.[^/]+)?|next\.config|vitest\.config|playwright\.config|.*(?:migration|schema).*)$/i)
  ) {
    return "architecture"
  }

  if (matchesAny(paths, /(service[-_]?worker|workbox|pwa|offline|indexeddb|cache-storage|manifest)/i)) {
    return "offline"
  }

  if (matchesAny(paths, /(routing|route|graphhopper|valhalla|gpx|kmz|navigation|waypoint|curvature|osm|road)/i)) {
    return "routing"
  }

  if (matchesAny(paths, /(^|\/)(src\/app|src\/components|components)(\/|$)|\.(?:tsx|jsx|css|scss)$/i)) {
    return "ui"
  }

  return totalLines <= 10 && paths.length <= 2 ? "low" : "standard"
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const paths = process.argv.slice(2)
  if (paths.length === 0) {
    console.error("usage: node scripts/qa/classify-change.mjs <changed-path> [...]")
    process.exitCode = 2
  } else {
    console.log(classifyChange(paths))
  }
}
