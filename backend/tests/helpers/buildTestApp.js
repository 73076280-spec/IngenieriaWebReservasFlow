import { vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/services/authService.js';
import { createFakeAuthStore } from './fakeAuthStore.js';

export const TEST_SECRET = 'secreto-de-pruebas-unitarias-de-al-menos-32-caracteres';
export const PASSWORD = 'Secreta-123';

const spyService = (methods) => Object.fromEntries(methods.map((m) => [m, vi.fn(async () => ({ ok: true }))]));

/**
 * App real (rutas, middlewares, política RBAC, manejo de errores) con autenticación
 * en memoria y servicios de negocio sustituidos por espías: verifica qué llega
 * —o no llega— a la capa de servicio sin red ni base de datos.
 */
export function buildTestApp() {
  const store = createFakeAuthStore();
  const authService = createAuthService({ store, jwtSecret: TEST_SECRET, jwtExpiresIn: '8h', bcryptRounds: 4 });
  const services = {
    catalog: { kinds: ['clients', 'employees', 'services'], ...spyService(['list', 'create', 'update', 'remove', 'setActive']) },
    availability: spyService(['query']),
    appointments: spyService(['list', 'get', 'create', 'changeStatus', 'reschedule', 'clientHistory', 'resendConfirmation']),
    dashboard: spyService(['summary']),
    users: spyService(['list', 'create', 'changeRole', 'notifications']),
    settings: spyService(['get', 'update']),
  };
  const config = { clientOrigins: ['http://localhost:5173'], authRateLimit: 1000 };
  const app = createApp({ config, authService, services, logger: { error: () => {} } });

  const orgA = store.addTenant({ name: 'Clínica Dental Sonrisa Real', slug: 'sonrisa-real' });
  const orgB = store.addTenant({ name: 'Barbería Estilo Urbano', slug: 'estilo-urbano' });
  const users = {
    admin: store.addUser(orgA, { email: 'admin@sonrisa.test', role: 'admin', password: PASSWORD }),
    recepcionista: store.addUser(orgA, { email: 'recepcion@sonrisa.test', role: 'recepcionista', password: PASSWORD }),
    profesional: store.addUser(orgA, { email: 'pro@sonrisa.test', role: 'profesional', password: PASSWORD, employeeId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
    cliente: store.addUser(orgA, { email: 'cliente@sonrisa.test', role: 'cliente', password: PASSWORD }),
    adminB: store.addUser(orgB, { email: 'admin@urbano.test', role: 'admin', password: PASSWORD }),
  };
  return { app, store, authService, services, orgA, orgB, users };
}
