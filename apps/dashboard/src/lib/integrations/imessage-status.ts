interface ImessageHandleStatus {
  senderId: string
  connectedAt: string
  displayLabel: string
}

export interface ImessageMemberStatus {
  lineConnected: boolean
  connected: boolean
  handles: ImessageHandleStatus[]
}
