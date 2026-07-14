export interface ProjectGpxRouteSummary {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject: string
  sourceFile: string
  sources: string[]
}

export interface ProjectGpxCatalog {
  generatedAt?: string
  scannedFiles?: number
  duplicateFiles?: number
  uniqueFiles?: number
  importedRoutes?: number
  rejectedFiles?: number
  routes: ProjectGpxRouteSummary[]
}
