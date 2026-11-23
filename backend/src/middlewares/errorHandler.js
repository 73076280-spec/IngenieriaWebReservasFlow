import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { MESSAGES, USER_MESSAGES } from '../errors/messages.js';

// Mensaje principal de una validación: el oficial si la primera incidencia tiene uno;
// si no, "Datos inválidos" con el campo afectado para que el usuario sepa qué corregir.
function validationMessage(issues) {
  const first = issues[0];
  if (!first) return MESSAGES.VALIDATION;
  if (USER_MESSAGES.has(first.message)) return first.message;
  const field = first.path.join('.');
  return field ? `${MESSAGES.VALIDATION} en "${field}": ${first.message}` : `${MESSAGES.VALIDATION}: ${first.message}`;
}

// Traduce errores a respuestas JSON {error, code[, details]} sin filtrar detalles internos.
export function errorHandler(logger = console) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...(err.details !== undefined ? { details: err.details } : {}) });
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
      return res.status(400).json({ error: validationMessage(err.issues), code: 'VALIDATION', details });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: MESSAGES.VALIDATION, code: 'VALIDATION' });
    if (err?.code === 11000) return res.status(409).json({ error: MESSAGES.CONFLICT, code: 'CONFLICT' });
    if (err?.name === 'CastError') return res.status(400).json({ error: 'Identificador inválido', code: 'VALIDATION' });
    if (err?.status && err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message, code: err.code || 'BAD_REQUEST' });
    logger.error(err);
    return res.status(500).json({ error: MESSAGES.INTERNAL, code: 'INTERNAL' });
  };
}
