import { MESSAGES } from './messages.js';

// Error de aplicación con código HTTP y código estable que el frontend puede interpretar.
// details: datos adicionales seguros para el cliente (p. ej. horario sugerido o número de citas).
export class AppError extends Error {
  constructor(status, code, message = MESSAGES[code] || code, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const unauthorized = (code) => new AppError(401, code);
export const forbidden = (code = 'FORBIDDEN', message) => new AppError(403, code, message);
export const notFound = (message = MESSAGES.NOT_FOUND) => new AppError(404, 'NOT_FOUND', message);
export const badRequest = (message, code = 'BAD_REQUEST', details) => new AppError(400, code, message, details);
export const conflict = (message, code = 'CONFLICT', details) => new AppError(409, code, message, details);
