import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { seedDemo } from '../../src/demo/seedDemo.js';
import { RUN_ID, connectTestDb, cleanupAndDisconnect, trackTenant, trackJti } from './setup.js';

// Verifica el script de datos de demostración SOLO en reservas_saas_test.
describe('Datos de demostración (scripts/seed-demo.js)', () => {
  let app;
  let seeded;
  const slug = `demo-${RUN_ID}`;
  const PASS = 'Demo-12345-it';
  const login = async (email) => {
    const res = await request(app).post('/api/auth/login').send({ organization: slug, email, password: PASS });
    if (res.body.token) trackJti(jwt.decode(res.body.token).jti);
    return res;
  };

  beforeAll(async () => {
    ({ app } = await connectTestDb());
    seeded = await seedDemo({ slug, name: `Demo ${RUN_ID}`, password: PASS, bcryptRounds: 4 });
    trackTenant(seeded.tenantId);
  }, 120000);
  afterAll(cleanupAndDisconnect, 120000);

  it('crea la organización con los 4 roles y una cuenta sin rol; no repite si ya existe', async () => {
    expect(seeded).toMatchObject({ created: true, appointments: 12 });
    expect((await seedDemo({ slug, password: PASS })).created).toBe(false);
    for (const email of ['admin', 'recepcion', 'ana', 'juan'].map((u) => `${u}@demo.reservaflow.pe`)) expect((await login(email)).status).toBe(200);
    expect((await login('pendiente@demo.reservaflow.pe')).body.code).toBe('ACCOUNT_PENDING');
  });

  it('el panel del trimestre tiene datos y el cliente ve solo sus citas', async () => {
    const admin = (await login('admin@demo.reservaflow.pe')).body.token;
    const quarter = (await request(app).get('/api/dashboard?period=trimestre').set('Authorization', 'Bearer ' + admin)).body;
    expect(quarter.total).toBeGreaterThanOrEqual(7);
    expect(quarter.byStatus.no_asistio).toBeGreaterThanOrEqual(1);
    const juan = (await login('juan@demo.reservaflow.pe')).body.token;
    const mine = (await request(app).get('/api/appointments').set('Authorization', 'Bearer ' + juan)).body;
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map((a) => a.clientId.name))).toEqual(new Set(['Juan Pérez']));
  });
});
