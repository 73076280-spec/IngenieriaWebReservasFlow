import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { createServices } from '../../src/container.js';
import { createAuthService } from '../../src/services/authService.js';
import { createMongoAuthStore } from '../../src/repositories/authStore.js';
import { Tenant, User, Client, Employee, Service, Appointment, Slot, RevokedToken, Notification } from '../../src/models.js';
import { TEST_DB, readTestUri, assertSafeTestUri, assertLeastPrivilege, SAFE_CONNECT_OPTIONS } from './guards.js';

export { TEST_DB };
export const RUN_ID = 'it-' + randomBytes(3).toString('hex');

// Secreto exclusivo de pruebas (nunca el de .env). Lo usa también el servidor E2E para emitir un token vencido.
export const TEST_SECRET = 'secreto-integracion-de-al-menos-32-caracteres-xx';
const MODELS = [Tenant, User, Client, Employee, Service, Appointment, Slot, RevokedToken, Notification];
const createdTenants = new Set();
const createdJtis = new Set();
let verified = false;

/**
 * Orden de las salvaguardas:
 *  1. URI leída solo de .env.test y validada sin conectar (base exacta, usuario presente).
 *  2. Conexión con dbName forzado y sin autoIndex/autoCreate: nada se escribe al conectar.
 *  3. connectionStatus: el usuario solo tiene roles sobre reservas_saas_test.
 *  4. Solo entonces se crean índices (createIndexes, nunca syncIndexes, que puede borrar).
 */
export async function connectTestDb({ clientOrigins = ['http://localhost:5173'] } = {}) {
  const uri = readTestUri();
  assertSafeTestUri(uri);
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(uri, SAFE_CONNECT_OPTIONS);
  try {
    if (mongoose.connection.name !== TEST_DB) throw new Error(`Base "${mongoose.connection.name}" rechazada`);
    assertLeastPrivilege(await mongoose.connection.db.command({ connectionStatus: 1 }));
  } catch (err) {
    await mongoose.disconnect();
    throw err;
  }
  verified = true;
  for (const M of MODELS) await M.createIndexes();
  const authService = createAuthService({ store: createMongoAuthStore(), jwtSecret: TEST_SECRET, bcryptRounds: 4 });
  // Correo en memoria (modo de prueba): nunca se envían correos reales desde las pruebas.
  const services = createServices({ bcryptRounds: 4, mail: { transport: 'memory' } });
  const app = createApp({ config: { clientOrigins, authRateLimit: 10000, bcryptRounds: 4 }, authService, services, logger: { error: () => {} } });
  return { app, authService, services };
}

export const trackTenant = (id) => createdTenants.add(String(id));
export const trackJti = (jti) => createdJtis.add(jti);

/** Borra únicamente los documentos creados por esta ejecución (por tenantId / jti propios). */
export async function cleanupAndDisconnect() {
  if (mongoose.connection.readyState !== 1) return;
  try {
    if (!verified || mongoose.connection.name !== TEST_DB) return;
    const ids = [...createdTenants].map((id) => new mongoose.Types.ObjectId(id));
    if (ids.length) {
      for (const M of [User, Client, Employee, Service, Appointment, Slot, Notification]) await M.deleteMany({ tenantId: { $in: ids } });
      await Tenant.deleteMany({ _id: { $in: ids } });
    }
    if (createdJtis.size) await RevokedToken.deleteMany({ jti: { $in: [...createdJtis] } });
  } finally {
    await mongoose.disconnect();
  }
}
