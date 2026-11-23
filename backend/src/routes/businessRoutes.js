import { Router } from 'express';
import { wrap, authenticate, authorize } from '../middlewares/auth.js';

/** Rutas de negocio. Cada una declara su permiso; los servicios vuelven a comprobarlo. */
export function businessRoutes({ authService, services }) {
  const router = Router();
  router.use(authenticate(authService));
  const { catalog, appointments, availability, dashboard, users, settings } = services;

  // Historial de asistencia de un cliente (HU-10-E4). Antes de las rutas genéricas del catálogo.
  router.get('/clients/:id/history', authorize('clients:read'), wrap(async (req, res) => res.json(await appointments.clientHistory(req.auth, req.params.id))));

  for (const kind of catalog.kinds) {
    router.get(`/${kind}`, authorize(`${kind}:read`), wrap(async (req, res) => res.json(await catalog.list(req.auth, kind))));
    router.post(`/${kind}`, authorize(`${kind}:write`), wrap(async (req, res) => res.status(201).json(await catalog.create(req.auth, kind, req.body))));
    router.put(`/${kind}/:id`, authorize(`${kind}:write`), wrap(async (req, res) => res.json(await catalog.update(req.auth, kind, req.params.id, req.body))));
    router.delete(`/${kind}/:id`, authorize(`${kind}:delete`), wrap(async (req, res) => {
      await catalog.remove(req.auth, kind, req.params.id);
      res.status(204).end();
    }));
  }
  // Activar o desactivar profesionales y servicios (HU-02-E4, HU-03-E4).
  for (const kind of ['employees', 'services']) {
    router.patch(`/${kind}/:id/status`, authorize(`${kind}:write`), wrap(async (req, res) => res.json(await catalog.setActive(req.auth, kind, req.params.id, req.body))));
  }

  router.get('/availability', authorize('availability:read'), wrap(async (req, res) => res.json(await availability.query(req.auth, req.query))));

  router.get('/appointments', authorize('appointments:read'), wrap(async (req, res) => res.json(await appointments.list(req.auth, req.query))));
  router.get('/appointments/:id', authorize('appointments:read'), wrap(async (req, res) => res.json(await appointments.get(req.auth, req.params.id))));
  router.post('/appointments', authorize('appointments:create'), wrap(async (req, res) => res.status(201).json(await appointments.create(req.auth, req.body))));
  router.patch('/appointments/:id/status', authorize('appointments:status'), wrap(async (req, res) => res.json(await appointments.changeStatus(req.auth, req.params.id, req.body))));
  router.post('/appointments/:id/notification', authorize('appointments:notify'), wrap(async (req, res) => res.json(await appointments.resendConfirmation(req.auth, req.params.id))));
  router.patch('/appointments/:id/reschedule', authorize('appointments:reschedule'), wrap(async (req, res) => res.json(await appointments.reschedule(req.auth, req.params.id, req.body))));

  router.get('/dashboard', authorize('dashboard:read'), wrap(async (req, res) => res.json(await dashboard.summary(req.auth, req.query))));

  router.get('/settings', authorize('settings:manage'), wrap(async (req, res) => res.json(await settings.get(req.auth))));
  router.patch('/settings', authorize('settings:manage'), wrap(async (req, res) => res.json(await settings.update(req.auth, req.body))));

  router.get('/users', authorize('users:manage'), wrap(async (req, res) => res.json(await users.list(req.auth))));
  router.post('/users', authorize('users:manage'), wrap(async (req, res) => res.status(201).json(await users.create(req.auth, req.body))));
  router.patch('/users/:id/role', authorize('users:manage'), wrap(async (req, res) => res.json(await users.changeRole(req.auth, req.params.id, req.body))));
  router.get('/notifications', authorize('notifications:read'), wrap(async (req, res) => res.json(await users.notifications(req.auth))));

  return router;
}
