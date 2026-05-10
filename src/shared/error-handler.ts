/**
 * Global Express error handler middleware.
 *
 * Catches both BusinessException subclasses (returns structured error)
 * and unexpected errors (returns 500 with safe message, logs full error).
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { BusinessException } from './errors.js';
import { ApiResponse } from './api-response.js';
import { logger } from './logger.js';

export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ─── Zod validation errors ────────────────────────────────
  if (err instanceof ZodError) {
    res.status(400).json(
      ApiResponse.error('Validation failed', 'VALIDATION_ERROR', err.flatten()),
    );
    return;
  }

  // ─── Known business exceptions ────────────────────────────
  if (err instanceof BusinessException) {
    res.status(err.statusCode).json(
      ApiResponse.error(err.message, err.code),
    );
    return;
  }

  // ─── Unexpected errors — log and return safe 500 ──────────
  logger.error({ err, stack: err.stack }, 'Unhandled error');
  res.status(500).json(
    ApiResponse.error(
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      'INTERNAL_ERROR',
    ),
  );
}
