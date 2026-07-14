const baseUrl = process.env.SWITCHBACK_URL ?? "http://127.0.0.1:3100"
const query = new URLSearchParams({
  south: "39.7",
  west: "-77.5",
  north: "40.8",
  east: "-75.8",
  minScore: "650",
  limit: "5"
})
const response = await fetch(`${baseUrl}/api/curvature?${query}`)
const body = await response.json()

if (!response.ok) {
  throw new Error(`Curvature API returned ${response.status}: ${JSON.stringify(body)}`)
}
if (body?.type !== "FeatureCollection" || !Array.isArray(body.features) || body.features.length === 0) {
  throw new Error("Curvature API returned no road features")
}

console.log(`Curvature validation passed with ${body.features.length} features at ${baseUrl}`)
