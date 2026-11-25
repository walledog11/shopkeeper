"use client"

import { createContext, useContext } from "react"

// Whether the signed-in member is a workspace admin, decided on the server for
// this request. Clerk's client membership is unknown until Clerk loads, so admin
// controls read from it rendered read-only first; in the preview, where Clerk
// never loads, they stayed read-only. The server enforces admin routes either
// way — this only decides what the page offers.
const WorkspaceRoleContext = createContext(false)

export function WorkspaceRoleProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean
  children: React.ReactNode
}) {
  return <WorkspaceRoleContext.Provider value={isAdmin}>{children}</WorkspaceRoleContext.Provider>
}

export function useIsWorkspaceAdmin(): boolean {
  return useContext(WorkspaceRoleContext)
}
