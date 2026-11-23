import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Tenant } from '../../src/models.js';
import { localDate } from '../../src/utils/time.js';
import { RUN_ID, connectTestDb, cleanupAndDisconnect, trackTenant, trackJti } from './setup.js';

// Requiere backend/.env.test con MONGO_URI_TEST (usuario exclusivo, base reservas_saas_test).
// Sin configuración válida la suite FALLA (no se omite) para que nunca parezca aprobada.
describe('Integración · seguridad multiinquilino y regresión de flujos', () => {
  let app;
  const PASS = 'Secreta-12345';
  const orgs = {};
  const bearer = (t) => ({ Authorization: 'Bearer ' + t });
  const tomorrowAt = (h, m = 0) => {
    // Hora local de Lima (UTC-5, sin horario de verano) para mañana.
    const d = new Date(Date.now() + 24 * 3600e3);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h + 5, m)).toISOString();
  };

  async function registerOrg(key, organization) {
    const res = await request(app).post('/api/auth/register').send({ organization, name: 'Admin ' + key, email: `admin-${RUN_ID}@${key}.test`, password: PASS });
    expect(res.status).toBe(201);
    trackTenant(res.body.organizationId);
    trackJti(jwt.decode(res.body.token).jti);
    orgs[key] = { id: res.body.organizationId, code: res.body.organizationCode, token: res.body.token };
  }
  async function loginAs(key, email, password = PASS) {
    const res = await request(app).post('/api/auth/login').send({ organization: orgs[key].code, email, password });
    if (res.body.token) trackJti(jwt.decode(res.body.token).jti);
    return res;
  }

  beforeAll(async () => {
    ({ app } = await connectTestDb());
    await registerOrg('a', `Clinica Dental Sonrisa Real ${RUN_ID}`);
    await registerOrg('b', `Barberia Estilo Urbano ${RUN_ID}`);
    // Datos de negocio de cada organización.
    for (const k of ['a', 'b']) {
      const t = bearer(orgs[k].token);
      orgs[k].client = (await request(app).post('/api/clients').set(t).send({ name: `Cliente ${k}`, email: `c@${k}.test`, phone: '999888777' })).body;
      orgs[k].employee = (await request(app).post('/api/employees').set(t).send({ name: `Pro ${k}`, specialty: 'General', schedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '08:00', end: '18:00' })) })).body;
      orgs[k].service = (await request(app).post('/api/services').set(t).send({ name: `Servicio ${k}`, duration: 30, price: 45 })).body;
      const ap = await request(app).post('/api/appointments').set(t).send({ clientId: orgs[k].client._id, employeeId: orgs[k].employee._id, serviceId: orgs[k].service._id, start: tomorrowAt(10) });
      expect(ap.status).toBe(201);
      orgs[k].appointment = ap.body;
    }
  }, 120000);

  afterAll(cleanupAndDisconnect, 120000);

  it('HU-14-E1 cada organización ve solo sus clientes y citas', async () => {
    for (const [mine, other] of [['a', 'b'], ['b', 'a']]) {
      const t = bearer(orgs[mine].token);
      const clients = (await request(app).get('/api/clients').set(t)).body;
      const appts = (await request(app).get('/api/appointments').set(t)).body;
      expect(clients.map((c) => c._id)).toEqual([orgs[mine].client._id]);
      expect(appts.map((x) => x._id)).toEqual([orgs[mine].appointment._id]);
      expect(JSON.stringify([clients, appts])).not.toContain(orgs[other].client._id);
    }
  });

  it('HU-14-E2 el servicio se guarda con el tenantId de la sesión y se rechaza un tenantId enviado', async () => {
    expect(orgs.a.service.tenantId).toBe(orgs.a.id);
    const res = await request(app).post('/api/services').set(bearer(orgs.a.token)).send({ name: 'Intruso', duration: 30, price: 1, tenantId: orgs.b.id });
    expect(res.status).toBe(400);
    const listB = (await request(app).get('/api/services').set(bearer(orgs.b.token))).body;
    expect(listB.some((s) => s.name === 'Intruso')).toBe(false);
  });

  it('HU-14-E3 una cita de otra organización por ID responde 404 sin datos', async () => {
    const res = await request(app).get('/api/appointments/' + orgs.b.appointment._id).set(bearer(orgs.a.token));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(orgs.b.client._id);
    const own = await request(app).get('/api/appointments/' + orgs.a.appointment._id).set(bearer(orgs.a.token));
    expect(own.status).toBe(200);
  });

  it('HU-14-E3 no se puede modificar, cancelar ni eliminar registros ajenos', async () => {
    const t = bearer(orgs.a.token);
    expect((await request(app).put('/api/clients/' + orgs.b.client._id).set(t).send({ name: 'Hackeado' })).status).toBe(404);
    expect((await request(app).delete('/api/services/' + orgs.b.service._id).set(t)).status).toBe(404);
    expect((await request(app).patch(`/api/appointments/${orgs.b.appointment._id}/status`).set(t).send({ status: 'cancelada' })).status).toBe(404);
    const b = bearer(orgs.b.token);
    expect((await request(app).get('/api/clients').set(b)).body[0].name).toBe('Cliente b');
    expect((await request(app).get('/api/appointments/' + orgs.b.appointment._id).set(b)).body.status).toBe('programada');
  });

  it('HU-11-E1 / HU-11-E2 el administrador crea una recepcionista y luego la cambia a profesional', async () => {
    const admin = bearer(orgs.a.token);
    const email = `recep-${RUN_ID}@a.test`;
    const created = await request(app).post('/api/users').set(admin).send({ name: 'Recepción', email, password: PASS, role: 'recepcionista' });
    expect(created.status).toBe(201);
    expect(created.body.passwordHash).toBeUndefined();
    const token = (await loginAs('a', email)).body.token;
    expect((await request(app).post('/api/clients').set(bearer(token)).send({ name: 'Nuevo cliente' })).status).toBe(201);
    expect((await request(app).get('/api/dashboard').set(bearer(token))).status).toBe(403);
    const changed = await request(app).patch(`/api/users/${created.body._id}/role`).set(admin).send({ role: 'profesional', employeeId: orgs.a.employee._id });
    expect(changed.status).toBe(200);
    expect((await request(app).post('/api/clients').set(bearer(token)).send({ name: 'Otro' })).status).toBe(403);
    // Como profesional solo ve las citas de su perfil.
    const appts = (await request(app).get('/api/appointments').set(bearer(token))).body;
    expect(appts.every((x) => x.employeeId._id === orgs.a.employee._id)).toBe(true);
  });

  it('un administrador no puede quitarse su propio rol', async () => {
    const me = jwt.decode(orgs.a.token).sub;
    const res = await request(app).patch(`/api/users/${me}/role`).set(bearer(orgs.a.token)).send({ role: 'recepcionista' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_DEMOTION');
  });

  it('HU-11-E4 cuenta sin rol: no entra y el administrador ve el aviso', async () => {
    const email = `sinrol-${RUN_ID}@a.test`;
    expect((await request(app).post('/api/users').set(bearer(orgs.a.token)).send({ name: 'Sin rol', email, password: PASS })).status).toBe(201);
    const res = await loginAs('a', email);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_PENDING');
    const notes = (await request(app).get('/api/notifications').set(bearer(orgs.a.token))).body;
    expect(notes.some((n) => n.type === 'cuenta_pendiente' && n.message.includes(email))).toBe(true);
    const notesB = (await request(app).get('/api/notifications').set(bearer(orgs.b.token))).body;
    expect(notesB).toHaveLength(0);
  });

  it('HU-15-E2 el token cerrado queda revocado en la base', async () => {
    const res = await loginAs('b', `admin-${RUN_ID}@b.test`);
    expect((await request(app).post('/api/auth/logout').set(bearer(res.body.token))).status).toBe(204);
    const reuse = await request(app).get('/api/clients').set(bearer(res.body.token));
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('SESSION_REVOKED');
  });

  it('HU-15-E3 credenciales incorrectas con mensaje oficial', async () => {
    const res = await loginAs('a', `admin-${RUN_ID}@a.test`, 'incorrecta-999');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Las credenciales ingresadas no son válidas');
  });

  it('regresión: cancelar libera el horario y se puede volver a reservar (HU-06-E1, HU-09-E4)', async () => {
    const t = bearer(orgs.a.token);
    const body = { clientId: orgs.a.client._id, employeeId: orgs.a.employee._id, serviceId: orgs.a.service._id, start: tomorrowAt(14) };
    const first = await request(app).post('/api/appointments').set(t).send(body);
    expect(first.status).toBe(201);
    expect((await request(app).post('/api/appointments').set(t).send(body)).status).toBe(409);
    expect((await request(app).patch(`/api/appointments/${first.body._id}/status`).set(t).send({ status: 'cancelada' })).status).toBe(200);
    expect((await request(app).post('/api/appointments').set(t).send(body)).status).toBe(201);
  });

  it('regresión: reprogramar conserva el ID de la cita (HU-05-E1)', async () => {
    const t = bearer(orgs.a.token);
    const res = await request(app).patch(`/api/appointments/${orgs.a.appointment._id}/reschedule`).set(t).send({ start: tomorrowAt(16) });
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(orgs.a.appointment._id);
    expect(res.body.start).toBe(tomorrowAt(16));
  });

  it('regresión: el precio de la cita no cambia al editar el servicio (HU-03-E2)', async () => {
    const t = bearer(orgs.a.token);
    expect((await request(app).put('/api/services/' + orgs.a.service._id).set(t).send({ name: orgs.a.service.name, duration: 30, price: 60 })).status).toBe(200);
    expect((await request(app).get('/api/appointments/' + orgs.a.appointment._id).set(t)).body.priceSnapshot).toBe(45);
  });

  it('regresión: el panel del administrador cuenta solo citas propias', async () => {
    const res = await request(app).get('/api/dashboard').set(bearer(orgs.b.token));
    expect(res.status).toBe(200);
    // El panel muestra el mes actual (HU-13): la cita de mañana cuenta salvo que mañana sea otro mes.
    const sameMonth = localDate(new Date(), 'America/Lima').slice(0, 7) === localDate(new Date(tomorrowAt(10)), 'America/Lima').slice(0, 7);
    expect(res.body.total).toBe(sameMonth ? 1 : 0);
    expect(res.body.hasAppointments).toBe(true);
  });

  // Se ejecuta al final porque bloquea a la organización B.
  it('HU-14-E4 organización suspendida: bloquea login y token previo', async () => {
    const before = await loginAs('b', `admin-${RUN_ID}@b.test`);
    await Tenant.updateOne({ _id: orgs.b.id }, { $set: { status: 'suspendida' } });
    const login = await loginAs('b', `admin-${RUN_ID}@b.test`);
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('TENANT_SUSPENDED');
    const op = await request(app).get('/api/clients').set(bearer(before.body.token));
    expect(op.status).toBe(403);
    expect((await request(app).get('/api/clients').set(bearer(orgs.a.token))).status).toBe(200);
  });
});
