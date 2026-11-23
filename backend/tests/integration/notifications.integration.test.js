import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Appointment } from '../../src/models.js';
import { addDays, localDate, zonedToUtc } from '../../src/utils/time.js';
import { RUN_ID, connectTestDb, cleanupAndDisconnect, trackTenant, trackJti } from './setup.js';

// HU-04-E1 · Confirmación por correo en reservas_saas_test con el transporte en memoria
// (modo de prueba: no se envía ningún correo real).
const TZ = 'America/Lima';
const PASS = 'Secreta-12345';
const day = (n) => addDays(localDate(new Date(), TZ), n);
const at = (d, h) => zonedToUtc(d, h * 60, TZ).toISOString();
const bearer = (t) => ({ Authorization: 'Bearer ' + t });

describe('HU-04-E1 · Confirmación de la reserva por correo', () => {
  let app;
  let mailer;
  const ctx = {};
  const api = (token) => ({
    get: (p) => request(app).get('/api' + p).set(bearer(token)),
    post: (p, b) => request(app).post('/api' + p).set(bearer(token)).send(b),
  });

  async function org(key, name) {
    const res = await request(app).post('/api/auth/register').send({ organization: `${name} ${RUN_ID}`, name: 'Admin', email: `admin-${RUN_ID}@${key}.test`, password: PASS });
    trackTenant(res.body.organizationId);
    trackJti(jwt.decode(res.body.token).jti);
    const a = api(res.body.token);
    const service = (await a.post('/services', { name: 'Limpieza dental', duration: 30, price: 45 })).body;
    const employee = (await a.post('/employees', { name: 'Ana Torres', specialty: 'Odontología', schedule: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, start: '08:00', end: '18:00' })) })).body;
    const client = (await a.post('/clients', { name: 'Juan Pérez', email: `juan-${RUN_ID}@${key}.test` })).body;
    const noEmail = (await a.post('/clients', { name: 'Sin Correo' })).body;
    return { code: res.body.organizationCode, admin: a, service, employee, client, noEmail };
  }

  beforeAll(async () => {
    let services;
    ({ app, services } = await connectTestDb());
    mailer = services.mailer;
    ctx.a = await org('a', 'Clinica Correo');
    ctx.b = await org('b', 'Barberia Correo');
    await ctx.a.admin.post('/users', { name: 'Juan', email: `cli-${RUN_ID}@a.test`, password: PASS, role: 'cliente', clientId: ctx.a.client._id });
    const login = await request(app).post('/api/auth/login').send({ organization: ctx.a.code, email: `cli-${RUN_ID}@a.test`, password: PASS });
    trackJti(jwt.decode(login.body.token).jti);
    ctx.cli = api(login.body.token);
  }, 180000);
  afterAll(cleanupAndDisconnect, 120000);

  it('el cliente reserva: cita "programada" y confirmación al correo de su ficha (modo de prueba)', async () => {
    const before = mailer.outbox.length;
    const res = await ctx.cli.post('/appointments', { serviceId: ctx.a.service._id, employeeId: ctx.a.employee._id, start: at(day(3), 9) });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('programada');
    expect(res.body.notification).toMatchObject({ status: 'simulada', to: ctx.a.client.email, attempts: 1, transport: 'memory' });
    expect(mailer.outbox).toHaveLength(before + 1);
    const mail = mailer.outbox.at(-1);
    expect(mail.to).toBe(ctx.a.client.email);
    expect(mail.subject).toContain(res.body.confirmation.code);
    for (const s of [res.body.confirmation.code, 'Limpieza dental', 'Ana Torres', '09:00 – 09:30']) expect(mail.html).toContain(s);
    // El estado queda registrado en la cita.
    expect((await ctx.cli.get('/appointments/' + res.body._id)).body.notification.status).toBe('simulada');
  });

  it('cliente sin correo: la cita se crea y la confirmación queda "sin_correo"', async () => {
    const before = mailer.outbox.length;
    const res = await ctx.a.admin.post('/appointments', { clientId: ctx.a.noEmail._id, employeeId: ctx.a.employee._id, serviceId: ctx.a.service._id, start: at(day(3), 10) });
    expect(res.status).toBe(201);
    expect(res.body.notification.status).toBe('sin_correo');
    expect(mailer.outbox).toHaveLength(before);
  });

  it('proveedor caído: la reserva se conserva, la confirmación queda "fallida" y un reintento simultáneo no duplica', async () => {
    mailer.failNext(1);
    const res = await ctx.a.admin.post('/appointments', { clientId: ctx.a.client._id, employeeId: ctx.a.employee._id, serviceId: ctx.a.service._id, start: at(day(3), 11) });
    expect(res.status).toBe(201);
    expect(res.body.notification).toMatchObject({ status: 'fallida', error: 'ESIMULATED' });
    const stored = await Appointment.findById(res.body._id).lean();
    expect(stored.status).toBe('programada');
    expect(stored.notification.lastError).toBe('ESIMULATED');

    const before = mailer.outbox.length;
    const [r1, r2] = await Promise.all([
      ctx.a.admin.post(`/appointments/${res.body._id}/notification`),
      ctx.a.admin.post(`/appointments/${res.body._id}/notification`),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect([r1, r2].find((r) => r.status === 409).body.code).toBe('CONFIRMATION_ALREADY_SENT');
    expect([r1, r2].find((r) => r.status === 200).body).toMatchObject({ status: 'simulada', attempts: 2 });
    expect(mailer.outbox).toHaveLength(before + 1);
  });

  it('una confirmación ya generada no se reenvía (409) y el cliente no puede forzar reenvíos (403)', async () => {
    const list = (await ctx.cli.get('/appointments')).body;
    const sent = list.find((a) => a.notification?.status === 'simulada');
    expect((await ctx.a.admin.post(`/appointments/${sent._id}/notification`)).status).toBe(409);
    expect((await ctx.cli.post(`/appointments/${sent._id}/notification`)).status).toBe(403);
  });

  it('aislamiento: otra organización no reenvía ni ve la confirmación ajena; cada correo va a su propio cliente', async () => {
    const own = (await ctx.a.admin.get('/appointments')).body[0];
    expect((await ctx.b.admin.post(`/appointments/${own._id}/notification`)).status).toBe(404);
    const res = await ctx.b.admin.post('/appointments', { clientId: ctx.b.client._id, employeeId: ctx.b.employee._id, serviceId: ctx.b.service._id, start: at(day(4), 9) });
    expect(res.body.notification.to).toBe(ctx.b.client.email);
    expect(mailer.outbox.at(-1).to).toBe(ctx.b.client.email);
    expect(mailer.outbox.at(-1).html).not.toContain('Clinica Correo');
  });
});
