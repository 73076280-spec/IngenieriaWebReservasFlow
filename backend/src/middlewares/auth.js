import { assertCan } from '../services/policies.js';

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Verifica el token Bearer y deja el contexto de sesión en req.auth (HU-15, HU-14-E4). */
export const authenticate = (authService) =>
  wrap(async (req, res, next) => {
    const token = /^Bearer (.+)$/i.exec(req.get('authorization') || '')?.[1];
    req.auth = await authService.verify(token);
    next();
  });

/** Aplica la política centralizada de permisos (HU-11). */
export const authorize = (permission) => (req, res, next) => {
  try {
    assertCan(req.auth, permission);
    next();
  } catch (err) {
    next(err);
  }
};
