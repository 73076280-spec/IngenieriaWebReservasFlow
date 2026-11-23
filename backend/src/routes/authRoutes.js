import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { wrap, authenticate } from '../middlewares/auth.js';
import { registerSchema, loginSchema } from '../validation/schemas.js';
import { PERMISSIONS, can } from '../services/policies.js';
import { CANCELLATION_REASONS } from '../errors/messages.js';

export function authRoutes({ authService, authRateLimit = 50 }) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: authRateLimit, standardHeaders: 'draft-7', legacyHeaders: false });
  const auth = authenticate(authService);

  router.post('/auth/register', limiter, wrap(async (req, res) => {
    res.status(201).json(await authService.register(registerSchema.parse(req.body)));
  }));
  router.post('/auth/login', limiter, wrap(async (req, res) => {
    res.json(await authService.login(loginSchema.parse(req.body)));
  }));
  // HU-15-E2: invalida el token actual en el servidor.
  router.post('/auth/logout', auth, wrap(async (req, res) => {
    await authService.logout(req.auth);
    res.status(204).end();
  }));
  // Perfil de sesión con los permisos efectivos del rol (la interfaz construye el menú con ellos).
  router.get('/me', auth, (req, res) => {
    res.json({
      id: req.auth.id,
      name: req.auth.name,
      role: req.auth.role,
      employeeId: req.auth.employeeId,
      clientId: req.auth.clientId,
      tenant: req.auth.tenant,
      permissions: Object.keys(PERMISSIONS).filter((p) => can(req.auth.role, p)),
      cancellationReasons: CANCELLATION_REASONS,
    });
  });
  return router;
}
