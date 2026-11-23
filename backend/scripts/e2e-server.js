// Servidor para la prueba E2E de la interfaz. Expone la API real conectada SOLO a
// reservas_saas_test, con las mismas salvaguardas que la integración (URI de .env.test,
// base forzada, sin escrituras automáticas, privilegios mínimos verificados).
// Uso: E2E_TAG=e2e-xxxxxx node scripts/e2e-server.js   (escucha en 127.0.0.1:4100)
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectTestDb, TEST_SECRET, TEST_DB } from '../tests/integration/setup.js';
import { Tenant, User, Client, Employee, Service, Appointment, Slot, Notification } from '../src/models.js';

const TAG = process.env.E2E_TAG || '';
const PORT = Number(process.env.E2E_PORT || 4100);
const ORIGIN = process.env.E2E_ORIGIN || 'http://127.0.0.1:5174';
if (!/^e2e-[a-z0-9]{6}$/.test(TAG)) throw new Error('E2E_TAG debe tener el formato e2e-xxxxxx');

const { app, services } = await connectTestDb({ clientOrigins: [ORIGIN] });
const server = express();

// Limpieza: solo organizaciones cuyo nombre contiene la etiqueta de esta ejecución, y solo en la base de pruebas.
async function cleanup() {
  if (mongoose.connection.name !== TEST_DB) throw new Error('Base no permitida');
  const ids = (await Tenant.find({ name: { $regex: TAG } }, '_id').lean()).map((t) => t._id);
  if (ids.length) {
    for (const M of [User, Client, Employee, Service, Appointment, Slot, Notification]) await M.deleteMany({ tenantId: { $in: ids } });
    await Tenant.deleteMany({ _id: { $in: ids } });
  }
  return ids.length;
}

// HU-15-E4: devuelve una copia vencida del token recibido (solo existe en este servidor de pruebas).
server.post('/__e2e/expire', express.json(), (req, res) => {
  const p = jwt.verify(req.body.token, TEST_SECRET, { algorithms: ['HS256'] });
  res.json({ token: jwt.sign({ sub: p.sub, tid: p.tid, exp: Math.floor(Date.now() / 1000) - 60 }, TEST_SECRET, { algorithm: 'HS256', jwtid: p.jti + '-vencido' }) });
});
// HU-04-E1: correos generados por el transporte en memoria (modo de prueba, nunca se envían).
server.get('/__e2e/outbox', (req, res) => {
  res.json(services.mailer.outbox.slice(-5).map(({ to, subject, html }) => ({ to, subject, html })));
});
server.post('/__e2e/shutdown', async (req, res) => {
  const removed = await cleanup();
  res.json({ removed });
  await mongoose.disconnect();
  setTimeout(() => process.exit(0), 100);
});
server.use(app);
server.listen(PORT, '127.0.0.1', () => console.log(`E2E API en http://127.0.0.1:${PORT}/api · base ${mongoose.connection.name} · etiqueta ${TAG}`));
