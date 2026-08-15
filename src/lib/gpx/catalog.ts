export interface ProjectGpxRouteSummary {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject: string
  // Redacted from the public /api/gpx-library catalog (see handler.ts)
  // because they carry host filesystem paths; anonymous clients see them
  // as absent, not present-and-empty.
  sourceFile?: string
  sources?: string[]
  duplicateFamilyId?: string
  duplicateFamilySize?: number
  duplicateFamilyRole?: "canonical" | "near-duplicate"
  mapMatchStatus?: "not-configured" | "matched" | "unmatched" | "failed" | "cancelled"
  matchPercent?: number | null
  unmatchedPercent?: number | null
  unmatchedSpanCount?: number
  dataConfidenceLevel?: "high" | "medium" | "low"
}

export interface ProjectGpxCatalog {
  generatedAt?: string
  scannedFiles?: number
  duplicateFiles?: number
  uniqueFiles?: number
  importedRoutes?: number
  rejectedFiles?: number
  duplicateFamilies?: number
  nearDuplicateFamilies?: number
  nearDuplicateRoutes?: number
  routes: ProjectGpxRouteSummary[]
}
