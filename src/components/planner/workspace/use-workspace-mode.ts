"use client"

import { useSyncExternalStore } from "react"
import {
  readWorkspaceViewportWidth,
  resolveWorkspaceMode,
  type WorkspaceMode
} from "./workspace-mode"

const SERVER_WORKSPACE_MODE: WorkspaceMode = "compact"

function currentWorkspaceMode(): WorkspaceMode {
  const width = readWorkspaceViewportWidth()
  return width === null ? SERVER_WORKSPACE_MODE : resolveWorkspaceMode(width)
}

function subscribeWorkspaceMode(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined

  // Browser/PWA split-window and orientation changes both surface through the
  // viewport resize event. Keep exactly one subscription authority here rather
  // than teaching every planner component its own media-query lifecycle.
  window.addEventListener("resize", onStoreChange)
  return () => window.removeEventListener("resize", onStoreChange)
}

/**
 * Reactive Compact / Medium / Wide planner topology signal.
 *
 * The server falls back to Compact because it is the only safe single-pane
 * layout when no usable width exists. After hydration, `useSyncExternalStore`
 * follows the live viewport and updates immediately when an iPad rotates or a
 * desktop/tablet split window changes width.
 */
export function useWorkspaceMode(): WorkspaceMode {
  return useSyncExternalStore(
    subscribeWorkspaceMode,
    currentWorkspaceMode,
    () => SERVER_WORKSPACE_MODE
  )
}
