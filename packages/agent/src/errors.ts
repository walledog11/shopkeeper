// Shared HTTP-shaped error classes (Track 4.1 extraction). Pure and Next-free so
// both the dashboard routes and the gateway worker can throw/catch one class
// identity (`instanceof ApiError` works across hosts). The Next-coupled
// `handleApiError` mapper stays in the dashboard (`@/lib/api/errors`).

export interface ApiErrorDetail {
  code: string;
  field?: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NoActiveOrganizationError extends ApiError {
  constructor(message = 'No active organization') {
    super(message, 403);
    this.name = 'NoActiveOrganizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', details?: ApiErrorDetail[]) {
    super(message, 400, details);
    this.name = 'BadRequestError';
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503);
    this.name = 'ServiceUnavailableError';
  }
}
