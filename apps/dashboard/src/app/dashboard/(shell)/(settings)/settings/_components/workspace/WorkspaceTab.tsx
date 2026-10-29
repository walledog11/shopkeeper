"use client"

import { WorkspaceTabView } from "./WorkspaceSections"
import { useWorkspaceTabState, type WorkspaceTabProps } from "./useWorkspaceTabState"

export default function WorkspaceTab(props: WorkspaceTabProps) {
  return <WorkspaceTabView {...props} state={useWorkspaceTabState(props)} />
}
