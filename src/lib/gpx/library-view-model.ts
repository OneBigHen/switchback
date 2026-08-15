import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"

export type ProjectRouteRegion =
  | "southeast-pa"
  | "northeast-pa"
  | "central-pa"
  | "southwest-pa"
  | "northwest-pa"
  | "pennsylvania"
  | "outside-pa"
  | "unknown"

export type ProjectRouteProfile = "adventure" | "twisty" | "scenic" | "road" | "mixed"
export type ProjectRouteSurface = "unpaved" | "paved" | "mixed" | "unknown"
export type ProjectRouteSort = "name" | "variants-desc" | "distance-desc" | "twistiness-desc"

export interface ProjectRouteGroup {
  id: string
  name: string
  normalizedName: string
  region: ProjectRouteRegion
  profile: ProjectRouteProfile
  surface: ProjectRouteSurface
  count: number
  memberIds: string[]
  sourceProjects: string[]
  representative: ProjectGpxRouteSummary
  members: ProjectGpxRouteSummary[]
}

export interface ProjectRouteSection {
  region: ProjectRouteRegion
  label: string
  groupCount: number
  routeCount: number
  groups: ProjectRouteGroup[]
}

export interface ProjectRouteFacets {
  sources: string[]
  profiles: ProjectRouteProfile[]
  surfaces: ProjectRouteSurface[]
}

export interface ProjectRouteLibraryViewModel {
  totalRoutes: number
  totalGroups: number
  visibleRoutes: number
  groups: ProjectRouteGroup[]
  sections: ProjectRouteSection[]
  facets: ProjectRouteFacets
}

export interface ProjectRouteLibraryOptions {
  query?: string
  source?: string
  profile?: ProjectRouteProfile
  surface?: ProjectRouteSurface
  sort?: ProjectRouteSort
}

export const PROJECT_ROUTE_REGION_LABELS: Record<ProjectRouteRegion, string> = {
  "southeast-pa": "Southeast PA",
  "northeast-pa": "Northeast PA",
  "central-pa": "Central PA",
  "southwest-pa": "Southwest PA",
  "northwest-pa": "Northwest PA",
  pennsylvania: "Pennsylvania",
  "outside-pa": "Outside Pennsylvania",
  unknown: "Region unknown"
}

const REGION_ORDER: ProjectRouteRegion[] = [
  "southeast-pa",
  "northeast-pa",
  "central-pa",
  "southwest-pa",
  "northwest-pa",
  "pennsylvania",
  "outside-pa",
  "unknown"
]

const PROFILE_ORDER: ProjectRouteProfile[] = ["adventure", "twisty", "scenic", "road", "mixed"]
const SURFACE_ORDER: ProjectRouteSurface[] = ["unpaved", "mixed", "paved", "unknown"]

const REGION_PATHS: Array<[RegExp, ProjectRouteRegion]> = [
  [/(?:^|[/_-])se[_ -]?pa(?:[/_. -]|$)/i, "southeast-pa"],
  [/(?:^|[/_-])ne[_ -]?pa(?:[/_. -]|$)/i, "northeast-pa"],
  [/(?:^|[/_-])central[_ -]?pa(?:[/_. -]|$)/i, "central-pa"],
  [/(?:^|[/_-])sw[_ -]?pa(?:[/_. -]|$)/i, "southwest-pa"],
  [/(?:^|[/_-])nw[_ -]?pa(?:[/_. -]|$)/i, "northwest-pa"]
]

const REGION_TERMS: Array<[RegExp, ProjectRouteRegion]> = [
  [/\b(?:york|berks|bucks|chester|montgomery|lancaster|lehigh|limerick|chalfont|pottstown|reading|allentown|green lane|marsh creek|french creek|conowingo)\b/i, "southeast-pa"],
  [/\b(?:pocono|hawley|scranton|wilkes barre|endless mountains|delaware state forest)\b/i, "northeast-pa"],
  [/\b(?:bald eagle|shamokin|state college|lock haven|happy valley|raystown|dauphin|bloomsburg|mifflin|centre county)\b/i, "central-pa"],
  [/\b(?:pittsburgh|armstrong|allegheny|laurel highlands|somerset|uniontown|ohiopyle|hyndman)\b/i, "southwest-pa"],
  [/\b(?:erie|oil creek|pymatuning|conneaut)\b/i, "northwest-pa"],
  [/\b(?:new jersey|jersey|maryland|west virginia|virginia|ohio|new york)\b/i, "outside-pa"],
  [/\b(?:pa|pennsylvania)\b/i, "pennsylvania"]
]

const GENERIC_ROUTE_NAMES = new Set([
  "",
  "imported",
  "new",
  "untitled",
  "my ride",
  "my",
  "scenic motorcycle navigation app"
])

const GENERATED_SOURCE_PROJECTS = new Set(["rideplanner", "planning-skill"])

export function normalizeProjectRouteName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:route|track|gpx|copy)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function routeText(route: ProjectGpxRouteSummary): string {
  return [route.name, route.sourceProject, route.sourceFile, ...(route.sources ?? [])]
    .join(" ")
    .replace(/[_-]+/g, " ")
}

function inferExplicitRouteRegion(route: ProjectGpxRouteSummary): ProjectRouteRegion | undefined {
  const sourceText = [route.sourceFile, ...(route.sources ?? [])].join(" ")
  return REGION_PATHS.find(([pattern]) => pattern.test(sourceText))?.[1]
}

function inferSemanticRouteRegion(route: ProjectGpxRouteSummary): ProjectRouteRegion {
  return REGION_TERMS.find(([pattern]) => pattern.test(routeText(route)))?.[1] ?? "unknown"
}

function chooseGroupRegion(
  members: ProjectGpxRouteSummary[],
  representative: ProjectGpxRouteSummary
): ProjectRouteRegion {
  const representativeExplicit = inferExplicitRouteRegion(representative)
  if (representativeExplicit) return representativeExplicit

  const explicitCounts = new Map<ProjectRouteRegion, number>()
  for (const member of members) {
    const region = inferExplicitRouteRegion(member)
    if (region) explicitCounts.set(region, (explicitCounts.get(region) ?? 0) + 1)
  }
  const strongestExplicit = Array.from(explicitCounts)
    .sort((left, right) => right[1] - left[1] || REGION_ORDER.indexOf(left[0]) - REGION_ORDER.indexOf(right[0]))[0]?.[0]
  if (strongestExplicit) return strongestExplicit

  const representativeSemantic = inferSemanticRouteRegion(representative)
  if (representativeSemantic !== "unknown") return representativeSemantic
  return members.map(inferSemanticRouteRegion)
    .find((candidate) => candidate !== "unknown") ?? "unknown"
}

function inferRouteProfile(text: string): ProjectRouteProfile {
  if (/\b(?:gravel|unpaved|dirt|dirty|dual sport|bdr|adventure|adv ride|forest road|fire road|off road|offroad)\b/i.test(text)) {
    return "adventure"
  }
  if (/\b(?:twisty|curvy|serpent|switchback)\b/i.test(text)) return "twisty"
  if (/\b(?:scenic|vista|covered bridge|waterfall)\b/i.test(text)) return "scenic"
  if (/\b(?:fastest|street)\b/i.test(text)) return "road"
  return "mixed"
}

function inferRouteSurface(text: string): ProjectRouteSurface {
  if (/\b(?:gravel|unpaved|dirt|dirty|forest road|fire road|off road|offroad)\b/i.test(text)) {
    return "unpaved"
  }
  if (/\b(?:dual sport|bdr|adventure|adv ride)\b/i.test(text)) return "mixed"
  if (/\b(?:paved|street|twisty|curvy|fastest|serpent|switchback)\b/i.test(text)) return "paved"
  return "unknown"
}

export function buildProjectRouteLibrary(
  routes: ProjectGpxRouteSummary[],
  options: ProjectRouteLibraryOptions = {}
): ProjectRouteLibraryViewModel {
  const grouped = new Map<string, ProjectGpxRouteSummary[]>()

  for (const route of routes) {
    const normalizedName = normalizeProjectRouteName(route.name)
    const groupKey = route.duplicateFamilyId
      ? `family:${route.duplicateFamilyId}`
      : GENERIC_ROUTE_NAMES.has(normalizedName)
      ? `${normalizedName}::${route.id}`
      : normalizedName
    const members = grouped.get(groupKey)
    if (members) members.push(route)
    else grouped.set(groupKey, [route])
  }

  const allGroups = Array.from(grouped, ([groupKey, members]): ProjectRouteGroup => {
    const representative = members.find(
      (member) => !GENERATED_SOURCE_PROJECTS.has(member.sourceProject.toLocaleLowerCase())
    ) ?? members[0]
    const normalizedName = normalizeProjectRouteName(representative.name)
    const semanticText = members.map(routeText).join(" ")
    const region = chooseGroupRegion(members, representative)
    return {
      id: `project-route-group-${groupKey.replace(/[^a-z0-9]+/g, "-") || representative.id}`,
      name: representative.name,
      normalizedName,
      region,
      profile: inferRouteProfile(semanticText),
      surface: inferRouteSurface(semanticText),
      count: members.length,
      memberIds: members.map((member) => member.id),
      sourceProjects: Array.from(new Set(members.map((member) => member.sourceProject)))
        .sort((left, right) => left.localeCompare(right)),
      representative,
      members
    }
  })

  const queryTokens = normalizeSearchText(options.query ?? "").split(" ").filter(Boolean)
  const source = normalizeSearchText(options.source ?? "")
  const facetGroups = allGroups.filter((group) => (
    (!options.profile || group.profile === options.profile)
    && (!options.surface || group.surface === options.surface)
  ))
  const sourceGroups = source
    ? facetGroups.filter((group) => group.sourceProjects.some(
      (project) => normalizeSearchText(project) === source
    ))
    : facetGroups
  const matchedGroups = queryTokens.length === 0
    ? sourceGroups
    : sourceGroups.filter((group) => {
      const searchable = normalizeSearchText([
        group.name,
        group.normalizedName,
        PROJECT_ROUTE_REGION_LABELS[group.region],
        group.profile,
        group.surface,
        ...group.sourceProjects,
        ...group.members.flatMap((member) => [member.sourceFile, ...(member.sources ?? [])])
      ].join(" "))
      return queryTokens.every((token) => searchable.includes(token))
    })
  const groups = [...matchedGroups]
  if (options.sort === "variants-desc") {
    groups.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
  } else if (options.sort === "distance-desc") {
    groups.sort((left, right) => (
      right.representative.distanceMiles - left.representative.distanceMiles
      || left.name.localeCompare(right.name)
    ))
  } else if (options.sort === "twistiness-desc") {
    groups.sort((left, right) => (
      right.representative.twistiness - left.representative.twistiness
      || left.name.localeCompare(right.name)
    ))
  } else if (options.sort === "name") {
    groups.sort((left, right) => left.normalizedName.localeCompare(right.normalizedName))
  }

  const sections = REGION_ORDER.flatMap((region): ProjectRouteSection[] => {
    const sectionGroups = groups.filter((group) => group.region === region)
    if (sectionGroups.length === 0) return []
    return [{
      region,
      label: PROJECT_ROUTE_REGION_LABELS[region],
      groupCount: sectionGroups.length,
      routeCount: sectionGroups.reduce((total, group) => total + group.count, 0),
      groups: sectionGroups
    }]
  })
  const availableProfiles = new Set(allGroups.map((group) => group.profile))
  const availableSurfaces = new Set(allGroups.map((group) => group.surface))
  const facets: ProjectRouteFacets = {
    sources: Array.from(new Set(allGroups.flatMap((group) => group.sourceProjects)))
      .sort((left, right) => left.localeCompare(right)),
    profiles: PROFILE_ORDER.filter((profile) => availableProfiles.has(profile)),
    surfaces: SURFACE_ORDER.filter((surface) => availableSurfaces.has(surface))
  }

  return {
    totalRoutes: routes.length,
    totalGroups: allGroups.length,
    visibleRoutes: groups.reduce((total, group) => total + group.count, 0),
    groups,
    sections,
    facets
  }
}
