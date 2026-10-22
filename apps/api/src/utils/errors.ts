export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_INACTIVE'
  | 'AUTH_PROVIDER_NOT_SUPPORTED'
  | 'FORBIDDEN'
  | 'CONTEXT_REQUIRED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'BUSINESS_RULE'
  | 'REFERENCE_NOT_FOUND'
  | 'IN_USE'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  field: string;
  message: string;
}

/** Error terkontrol yang diterjemahkan menjadi response error standar (PRD §9.1) */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message = 'Data tidak ditemukan') => new AppError(404, 'NOT_FOUND', message);

export const validationError = (details: ErrorDetail[], message = 'Data tidak valid') =>
  new AppError(400, 'VALIDATION_ERROR', message, details);
