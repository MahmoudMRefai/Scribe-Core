/**
 * Standardized API response wrapper.
 *
 * Every endpoint returns { success, data?, error? } for consistency.
 */

interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: ErrorPayload;
}

export type ApiResponseType<T> = SuccessResponse<T> | ErrorResponse;

export class ApiResponse {
  static success<T>(data: T): SuccessResponse<T> {
    return { success: true, data };
  }

  static error(message: string, code = 'ERROR', details?: unknown): ErrorResponse {
    return {
      success: false,
      error: { code, message, ...(details ? { details } : {}) },
    };
  }
}
