// Format response sesuai PRD §9.1

export interface ApiMeta {
  page: number;
  page_size: number;
  total: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta?: ApiMeta;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export type ApiErrorCode =
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

export interface ApiFailure {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
}
