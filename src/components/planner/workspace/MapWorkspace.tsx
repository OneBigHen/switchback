import type { ReactNode } from "react"

export interface MapWorkspaceProps {
  mode: "planning" | "ride" | "free-ride" | "stopped-detail"
  children: ReactNode
}

export interface MapCanvasProps {
  children: ReactNode
}

export function MapWorkspace({ mode, children }: MapWorkspaceProps) {
  return (
    <section
      className="map-workspace"
      data-map-workspace="true"
      data-workspace-mode={mode}
      aria-label="Map workspace"
    >
      {children}
    </section>
  )
}

export function MapCanvas({ children }: MapCanvasProps) {
  return (
    <div className="map-workspace-canvas" data-map-canvas="true">
      {children}
    </div>
  )
}
