// A small typed error the error middleware turns into a clean JSON response.
export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, message, details);
export const unauthorized = (message = 'Invalid or missing authentication') => new AppError(401, message);
export const forbidden = (message = 'You do not have permission to do this') => new AppError(403, message);
export const notFound = (message = 'Record not found') => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
