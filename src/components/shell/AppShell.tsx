"use client"

import type { ReactNode } from "react"
import type { AppMode } from "@/lib/client/app-navigation"

interface AppShellProps {
  mode: AppMode
  dataSketching?: boolean
  children: ReactNode
}

/** Stable shell boundary; children include the single persistent map slot. */
export function AppShell({ mode, dataSketching = false, children }: AppShellProps) {
  return (
    <main
      className="app-shell planner-shell"
      id="top"
      data-app-mode={mode}
      data-sketching={dataSketching ? "true" : "false"}
      data-map-shell="true"
    >
      {children}
    </main>
  )
}
