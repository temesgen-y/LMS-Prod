import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode ?? 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${message}`, err);
  }

  res.status(statusCode).json({
    error: message,
    code: err.code,
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
};

export const createError = (
  message: string,
  statusCode = 500,
  code?: string,
): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
};
