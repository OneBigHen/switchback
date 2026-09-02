"use client"

import type { ReactNode } from "react"
import type { AppMode, PrimaryDestination } from "@/lib/client/app-navigation"

interface AppShellProps {
  mode: AppMode
  destination?: PrimaryDestination
  dataSketching?: boolean
  children: ReactNode
}

/** Stable shell boundary; children include the single persistent map slot. */
export function AppShell({ mode, destination, dataSketching = false, children }: AppShellProps) {
  return (
    <main
      className="app-shell planner-shell"
      id="top"
      data-app-mode={mode}
      data-app-destination={destination}
      data-sketching={dataSketching ? "true" : "false"}
      data-map-shell="true"
    >
      {children}
    </main>
  )
}
