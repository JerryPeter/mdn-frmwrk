import { AxiosError } from 'axios';
import type { ApiErrorCode, ApiErrorDetail, ApiFailure } from '@/types/api';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status?: number,
    public readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Ubah error axios/jaringan menjadi ApiError dengan pesan Bahasa Indonesia */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof AxiosError) {
    const body = err.response?.data as ApiFailure | undefined;
    if (body && body.success === false && body.error) {
      return new ApiError(body.error.code, body.error.message, err.response?.status, body.error.details);
    }
    if (!err.response) {
      return new ApiError('INTERNAL_ERROR', 'Tidak dapat terhubung ke server. Periksa koneksi Anda.');
    }
    return new ApiError('INTERNAL_ERROR', `Terjadi kesalahan pada server (${err.response.status}).`, err.response.status);
  }
  return new ApiError('INTERNAL_ERROR', 'Terjadi kesalahan yang tidak terduga.');
}

export function getErrorMessage(err: unknown): string {
  return toApiError(err).message;
}
