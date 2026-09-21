import { ApiRequestError, errorMessageFromUnknown } from '@/lib/api/fetcher'

export interface ClientErrorCopy {
  title: string
  detail: string
}

function statusDetail(status: number): ClientErrorCopy {
  if (status === 401 || status === 403) {
    return {
      title: 'You don’t have access',
      detail: 'Sign in again or switch to a workspace that can view this conversation.',
    }
  }
  if (status === 404) {
    return {
      title: 'Conversation not found',
      detail: 'It may have been archived or is no longer available.',
    }
  }
  if (status === 429) {
    return {
      title: 'Too many requests',
      detail: 'Wait a moment and try again.',
    }
  }
  if (status >= 500) {
    return {
      title: 'Something went wrong',
      detail: 'Our servers hit a snag. Try again in a few seconds.',
    }
  }
  return {
    title: 'Unable to load',
    detail: errorMessageFromUnknown(null, 'Check your connection and try again.'),
  }
}

export function conversationLoadErrorMessage(error: unknown): ClientErrorCopy {
  if (error instanceof ApiRequestError) {
    const fromStatus = statusDetail(error.status)
    if (error.status === 404 || error.status === 403 || error.status === 401) return fromStatus
    const message = error.message.trim()
    return {
      title: fromStatus.title,
      detail: message || fromStatus.detail,
    }
  }
  return {
    title: 'Unable to load conversation',
    detail: errorMessageFromUnknown(error, 'Check your connection and try again.'),
  }
}

export function inboxListErrorMessage(error: unknown): ClientErrorCopy {
  if (error instanceof ApiRequestError) {
    const fromStatus = statusDetail(error.status)
    if (error.status >= 500) {
      return {
        title: 'Inbox unavailable',
        detail: fromStatus.detail,
      }
    }
    if (error.status === 401 || error.status === 403) {
      return {
        title: 'Inbox unavailable',
        detail: fromStatus.detail,
      }
    }
    const message = error.message.trim()
    return {
      title: 'Inbox unavailable',
      detail: message || fromStatus.detail,
    }
  }
  return {
    title: 'Inbox unavailable',
    detail: errorMessageFromUnknown(error, 'Check your connection and refresh the page.'),
  }
}
