import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Appointment, Client, Employee, Service } from '../../src/models.js';
import { MESSAGES } from '../../src/errors/messages.js';
import { addDays, localDate, monthStart, weekdayOf, zonedToUtc } from '../../src/utils/time.js';
import { RUN_ID, connectTestDb, cleanupAndDisconnect, trackTenant, trackJti } from './setup.js';

// Flujos funcionales HU-01..HU-10, HU-12 y HU-13 contra reservas_saas_test (mismas salvaguardas que security).
const TZ = 'America/Lima';
const PASS = 'Secreta-12345';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const today = localDate(new Date(), TZ);
const day = (n) => addDays(today, n);
const at = (dateStr, hhmm) => zonedToUtc(dateStr, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ).toISOString();
const bearer = (t) => ({ Authorization: 'Bearer ' + t });

let app;
const ctx = {};

function client(token) {
  const call = (method) => (path, body) => {
    const req = request(app)[method]('/api' + path).set(bearer(token));
    return body === undefined ? req : req.send(body);
  };
  return { get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), del: call('delete') };
}

async function registerOrg(organization, key) {
  const res = await request(app).post('/api/auth/register').send({ organization, name: 'Admin ' + key, email: `admin-${RUN_ID}@${key}.test`, password: PASS });
  expect(res.status).toBe(201);
  trackTenant(res.body.organizationId);
  trackJti(jwt.decode(res.body.token).jti);
  return { id: res.body.organizationId, code: res.body.organizationCode, token: res.body.token, api: client(res.body.token) };
}

async function addUser(org, key, body) {
  const created = await org.api.post('/users', { name: key, email: `${key}-${RUN_ID}@x.test`, password: PASS, ...body });
  expect(created.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({ organization: org.code, email: `${key}-${RUN_ID}@x.test`, password: PASS });
  expect(login.status).toBe(200);
  trackJti(jwt.decode(login.body.token).jti);
  return { user: created.body, token: login.body.token, api: client(login.body.token) };
}

const hhmmOf = (iso) => new Date(iso).toLocaleTimeString('es-PE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

beforeAll(async () => {
  ({ app } = await connectTestDb());
  const org = await registerOrg(`Clinica Dental Sonrisa Real ${RUN_ID}`, 'a');
  ctx.org = org;
  const admin = org.api;
  const svc = async (name, duration, price) => (await admin.post('/services', { name, duration, price })).body;
  ctx.limpieza = await svc('Limpieza dental', 30, 45);
  ctx.blanqueamiento = await svc('Blanqueamiento', 60, 120);
  ctx.consulta = await svc('Consulta', 15, 30);
  const emp = async (name, serviceIds, start, end, days = ALL_DAYS) =>
    (await admin.post('/employees', { name, specialty: 'Odontología', serviceIds, schedule: days.map((d) => ({ day: d, start, end })) })).body;
  ctx.ana = await emp('Ana', [ctx.limpieza._id, ctx.consulta._id], '09:00', '18:00');
  ctx.beto = await emp('Beto', [], '09:00', '18:00');
  ctx.carla = await emp('Carla', [ctx.blanqueamiento._id], '09:00', '13:00');
  const cli = async (name) => (await admin.post('/clients', { name, email: `${name.toLowerCase()}-${RUN_ID}@cli.test`, phone: '987654321' })).body;
  ctx.juan = await cli('Juan');
  ctx.maria = await cli('Maria');
  ctx.pedro = await cli('Pedro');
  ctx.recep = await addUser(org, 'recep', { role: 'recepcionista' });
  ctx.pro = await addUser(org, 'pro', { role: 'profesional', employeeId: ctx.ana._id });
  ctx.cli = await addUser(org, 'cli', { role: 'cliente', clientId: ctx.juan._id });
  ctx.other = await registerOrg(`Barberia Estilo Urbano ${RUN_ID}`, 'b');
}, 180000);

afterAll(cleanupAndDisconnect, 120000);

describe('HU-01 · Gestión de clientes', () => {
  it('HU-01-E1 la recepcionista registra un cliente con notas y solo aparece en su organización', async () => {
    const res = await ctx.recep.api.post('/clients', { name: 'Lucia Ramos', email: `lucia-${RUN_ID}@cli.test`, phone: '+51 987 111 222', notes: 'Prefiere turno mañana' });
    expect(res.status).toBe(201);
    expect(res.body.tenantId).toBe(ctx.org.id);
    expect((await ctx.recep.api.get('/clients')).body.some((c) => c._id === res.body._id && c.notes === 'Prefiere turno mañana')).toBe(true);
    expect((await ctx.other.api.get('/clients')).body.some((c) => c._id === res.body._id)).toBe(false);
  });

  it('HU-01-E2 editar el teléfono conserva el ID y el historial de citas', async () => {
    const ap = await ctx.recep.api.post('/appointments', { clientId: ctx.pedro._id, employeeId: ctx.beto._id, serviceId: ctx.consulta._id, start: at(day(6), '09:00') });
    expect(ap.status).toBe(201);
    const upd = await ctx.recep.api.put('/clients/' + ctx.pedro._id, { name: 'Pedro', phone: '912345678' });
    expect(upd.status).toBe(200);
    expect(upd.body._id).toBe(ctx.pedro._id);
    const history = (await ctx.recep.api.get(`/clients/${ctx.pedro._id}/history`)).body;
    expect(history.appointments.map((a) => a._id)).toContain(ap.body._id);
    expect(history.client.phone).toBe('912345678');
  });

  it('HU-01-E3 correo "juan@correo": mensaje oficial y no se guarda', async () => {
    const before = (await ctx.recep.api.get('/clients')).body.length;
    const res = await ctx.recep.api.post('/clients', { name: 'Juan Correo', email: 'juan@correo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El correo electrónico no tiene un formato válido');
    expect((await ctx.recep.api.get('/clients')).body.length).toBe(before);
  });

  it('HU-01-E4 la recepcionista no elimina un cliente con citas pendientes', async () => {
    const res = await ctx.recep.api.del('/clients/' + ctx.pedro._id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HAS_ACTIVE_APPOINTMENTS');
    expect(res.body.error).toContain('Primero debe cancelar o reasignar sus citas pendientes');
    expect((await ctx.recep.api.get('/clients')).body.some((c) => c._id === ctx.pedro._id)).toBe(true);
    const free = await ctx.recep.api.post('/clients', { name: 'Temporal' });
    expect((await ctx.recep.api.del('/clients/' + free.body._id)).status).toBe(204);
  });
});

describe('HU-02 · Gestión de profesionales', () => {
  it('HU-02-E1 registro con especialidad y turno: solo admite citas dentro de su turno', async () => {
    const res = await ctx.org.api.post('/employees', { name: 'Luis', specialty: 'Ortodoncia', schedule: [1, 2, 3, 4, 5].map((d) => ({ day: d, start: '09:00', end: '13:00' })) });
    expect(res.status).toBe(201);
    expect(res.body.active).toBe(true);
    ctx.luis = res.body;
    let weekday = 1;
    while (![1, 2, 3, 4, 5].includes(weekdayOf(day(weekday)))) weekday++;
    const date = day(weekday + 7);
    const out = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.luis._id, serviceId: ctx.consulta._id, start: at(date, '15:00') });
    expect(out.status).toBe(409);
    expect(out.body.code).toBe('OUT_OF_SCHEDULE');
  });

  it('HU-02-E2 agregar el sábado se refleja en la disponibilidad', async () => {
    let n = 1;
    while (weekdayOf(day(n)) !== 6) n++;
    const saturday = day(n);
    const q = `/availability?serviceId=${ctx.consulta._id}&employeeId=${ctx.luis._id}&date=${saturday}`;
    expect((await ctx.org.api.get(q)).body.slots).toEqual([]);
    const schedule = [1, 2, 3, 4, 5, 6].map((d) => ({ day: d, start: '09:00', end: '13:00' }));
    expect((await ctx.org.api.put('/employees/' + ctx.luis._id, { name: 'Luis', specialty: 'Ortodoncia', schedule })).status).toBe(200);
    const after = (await ctx.org.api.get(q)).body;
    expect(after.slots.length).toBe(16);
    expect(hhmmOf(after.slots[0].start)).toBe('09:00');
  });

  it('HU-02-E3 sin especialidad: mensaje oficial y no se guarda', async () => {
    const res = await ctx.org.api.post('/employees', { name: 'Sin especialidad', schedule: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Debe seleccionar al menos una especialidad');
    expect((await ctx.org.api.get('/employees')).body.some((e) => e.name === 'Sin especialidad')).toBe(false);
  });

  it('HU-02-E4 desactivar un profesional con citas futuras exige reasignarlas', async () => {
    const ap = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.luis._id, serviceId: ctx.consulta._id, start: (await ctx.org.api.get(`/availability?serviceId=${ctx.consulta._id}&employeeId=${ctx.luis._id}&date=${day(8)}`)).body.slots[0]?.start ?? at(day(9), '09:00') });
    expect(ap.status).toBe(201);
    const res = await ctx.org.api.patch(`/employees/${ctx.luis._id}/status`, { active: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HAS_FUTURE_APPOINTMENTS');
    expect(res.body.details.count).toBe(1);
    expect((await ctx.org.api.get('/employees')).body.find((e) => e._id === ctx.luis._id).active).toBe(true);
    // Reasignación (HU-05-E2) y luego la desactivación sí procede.
    const moved = await ctx.recep.api.patch(`/appointments/${ap.body._id}/reschedule`, { start: ap.body.start, employeeId: ctx.beto._id });
    expect(moved.status).toBe(200);
    expect((await ctx.org.api.patch(`/employees/${ctx.luis._id}/status`, { active: false })).status).toBe(200);
    const avail = await ctx.org.api.get(`/availability?serviceId=${ctx.consulta._id}&employeeId=${ctx.luis._id}&date=${day(8)}`);
    expect(avail.body.code).toBe('EMPLOYEE_NOT_ELIGIBLE');
  });
});

describe('HU-03 · Gestión de servicios', () => {
  it('HU-03-E1 servicio de 30 min y S/ 45 disponible para reservar', async () => {
    const res = await ctx.org.api.post('/services', { name: 'Cambio de aceite', duration: 30, price: 45 });
    expect(res.status).toBe(201);
    const avail = await ctx.cli.api.get(`/availability?serviceId=${res.body._id}&date=${day(3)}`);
    expect(avail.status).toBe(200);
    expect(avail.body.slots.length).toBeGreaterThan(0);
  });

  it.each([0, -15])('HU-03-E3 duración %i: mensaje oficial y no se guarda', async (duration) => {
    const res = await ctx.org.api.post('/services', { name: 'Servicio inválido', duration, price: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('La duración del servicio debe ser mayor que cero');
    expect((await ctx.org.api.get('/services')).body.some((s) => s.name === 'Servicio inválido')).toBe(false);
  });

  it('HU-03-E4 un servicio con citas futuras no se elimina: se sugiere desactivarlo', async () => {
    const svc = (await ctx.org.api.post('/services', { name: 'Fluorización', duration: 15, price: 25 })).body;
    const ap = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.beto._id, serviceId: svc._id, start: at(day(6), '12:00') });
    expect(ap.status).toBe(201);
    const del = await ctx.org.api.del('/services/' + svc._id);
    expect(del.status).toBe(409);
    expect(del.body.details).toMatchObject({ suggestion: 'deactivate', future: 1 });
    expect((await ctx.org.api.patch(`/services/${svc._id}/status`, { active: false })).status).toBe(200);
    const blocked = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.beto._id, serviceId: svc._id, start: at(day(6), '13:00') });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('SERVICE_INACTIVE');
    expect((await ctx.recep.api.get('/appointments/' + ap.body._id)).body.status).toBe('programada');
  });
});

describe('HU-04 · Registro de citas (portal del cliente)', () => {
  it('HU-04-E1 el cliente reserva para sí mismo: cita programada y comprobante', async () => {
    const res = await ctx.cli.api.post('/appointments', { serviceId: ctx.limpieza._id, employeeId: ctx.ana._id, start: at(day(3), '09:00'), clientId: ctx.maria._id });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('programada');
    expect(res.body.clientId).toBe(ctx.juan._id); // se ignora el clientId enviado
    expect(res.body.confirmation.code).toHaveLength(8);
    const mine = (await ctx.cli.api.get('/appointments')).body;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((a) => a.clientId._id === ctx.juan._id)).toBe(true);
    ctx.juanAppointment = res.body;
  });

  it('el cliente no ve citas de otros clientes (404)', async () => {
    const otherAp = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.beto._id, serviceId: ctx.consulta._id, start: at(day(3), '15:00') });
    expect(otherAp.status).toBe(201);
    expect((await ctx.cli.api.get('/appointments/' + otherAp.body._id)).status).toBe(404);
    expect((await ctx.cli.api.patch(`/appointments/${otherAp.body._id}/status`, { status: 'cancelada' })).status).toBe(404);
    expect((await ctx.cli.api.patch(`/appointments/${ctx.juanAppointment._id}/status`, { status: 'completada' })).status).toBe(403);
  });

  it('HU-04-E2 "cualquier profesional": asigna al primer profesional habilitado y libre', async () => {
    const start = at(day(3), '10:00');
    expect((await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.ana._id, serviceId: ctx.limpieza._id, start })).status).toBe(201);
    const res = await ctx.cli.api.post('/appointments', { serviceId: ctx.limpieza._id, start });
    expect(res.status).toBe(201);
    expect(res.body.employeeId).toBe(ctx.beto._id); // Ana ocupada; Carla no está habilitada para limpieza
  });

  it('HU-04-E3 fuera del horario laboral: mensaje oficial y sin crear la cita', async () => {
    const before = (await ctx.cli.api.get('/appointments')).body.length;
    const res = await ctx.cli.api.post('/appointments', { serviceId: ctx.limpieza._id, employeeId: ctx.ana._id, start: at(day(3), '20:00') });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('El horario seleccionado no está disponible');
    expect((await ctx.cli.api.get('/appointments')).body.length).toBe(before);
  });
});

describe('HU-07 · Consulta de disponibilidad', () => {
  it('HU-07-E1 bloques del profesional según la duración del servicio', async () => {
    const res = await ctx.cli.api.get(`/availability?serviceId=${ctx.blanqueamiento._id}&employeeId=${ctx.carla._id}&date=${day(10)}`);
    expect(res.status).toBe(200);
    expect(res.body.slots.map((s) => hhmmOf(s.start))).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00']);
  });

  it('HU-07-E2 sin profesional combina solo a los habilitados para el servicio', async () => {
    const res = await ctx.cli.api.get(`/availability?serviceId=${ctx.blanqueamiento._id}&date=${day(10)}`);
    const names = new Set(res.body.slots.flatMap((s) => s.employees.map((e) => e.name)));
    expect([...names].sort()).toEqual(['Beto', 'Carla']); // Ana no ofrece blanqueamiento
  });

  it('HU-07-E3 fecha pasada: mensaje oficial', async () => {
    const res = await ctx.cli.api.get(`/availability?serviceId=${ctx.limpieza._id}&date=${day(-1)}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No es posible consultar disponibilidad para fechas pasadas');
  });

  it('HU-07-E4 agenda completa: mensaje oficial y fechas cercanas con disponibilidad', async () => {
    const date = day(11);
    for (const h of ['09:00', '10:00', '11:00', '12:00']) {
      expect((await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.carla._id, serviceId: ctx.blanqueamiento._id, start: at(date, h) })).status).toBe(201);
    }
    const res = (await ctx.cli.api.get(`/availability?serviceId=${ctx.blanqueamiento._id}&employeeId=${ctx.carla._id}&date=${date}`)).body;
    expect(res.slots).toEqual([]);
    expect(res.message).toBe('No hay horarios disponibles para esta fecha');
    expect(res.suggestions.map((s) => s.date)).toEqual([day(12), day(13), day(14)]);
  });
});

describe('HU-09 · Prevención de reservas duplicadas', () => {
  it('HU-09-E1 el bloque ocupado no se ofrece y el alta superpuesta se rechaza', async () => {
    const date = day(4);
    expect((await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.ana._id, serviceId: ctx.limpieza._id, start: at(date, '15:00') })).status).toBe(201);
    const slots = (await ctx.cli.api.get(`/availability?serviceId=${ctx.limpieza._id}&employeeId=${ctx.ana._id}&date=${date}`)).body.slots.map((s) => hhmmOf(s.start));
    expect(slots).not.toContain('14:45');
    expect(slots).not.toContain('15:00');
    expect(slots).not.toContain('15:15');
    expect(slots).toContain('15:30');
    const dup = await ctx.cli.api.post('/appointments', { serviceId: ctx.limpieza._id, employeeId: ctx.ana._id, start: at(date, '15:15') });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('SLOT_TAKEN');
  });

  it('HU-09-E2 el conflicto sugiere el horario libre más cercano con el mismo profesional', async () => {
    const dup = await ctx.cli.api.post('/appointments', { serviceId: ctx.limpieza._id, employeeId: ctx.ana._id, start: at(day(4), '15:00') });
    expect(dup.status).toBe(409);
    expect(dup.body.details.suggestion.employee._id).toBe(ctx.ana._id);
    expect(['14:30', '15:30']).toContain(hhmmOf(dup.body.details.suggestion.start));
  });

  it('HU-09-E3 dos reservas simultáneas: solo una se crea y la otra recibe SLOT_TAKEN', async () => {
    const start = at(day(5), '11:00');
    const body = (clientId) => ({ clientId, employeeId: ctx.beto._id, serviceId: ctx.consulta._id, start });
    const results = await Promise.all([ctx.recep.api.post('/appointments', body(ctx.maria._id)), ctx.org.api.post('/appointments', body(ctx.pedro._id))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409).body.code).toBe('SLOT_TAKEN');
    const sameSlot = await Appointment.countDocuments({ tenantId: ctx.org.id, employeeId: ctx.beto._id, start: new Date(start), status: { $ne: 'cancelada' } });
    expect(sameSlot).toBe(1);
  });
});

describe('HU-05 · Reprogramación', () => {
  it('HU-05-E1 el cliente reprograma su cita con el mismo profesional y conserva el ID', async () => {
    const res = await ctx.cli.api.patch(`/appointments/${ctx.juanAppointment._id}/reschedule`, { start: at(day(3), '11:00') });
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(ctx.juanAppointment._id);
    expect(res.body.employeeId).toBe(ctx.ana._id);
  });

  it('HU-05-E2 cambio de profesional: reasigna y libera el horario anterior', async () => {
    const res = await ctx.cli.api.patch(`/appointments/${ctx.juanAppointment._id}/reschedule`, { start: at(day(3), '12:00'), employeeId: ctx.beto._id });
    expect(res.status).toBe(200);
    expect(res.body.employeeId).toBe(ctx.beto._id);
    const anaSlots = (await ctx.cli.api.get(`/availability?serviceId=${ctx.limpieza._id}&employeeId=${ctx.ana._id}&date=${day(3)}`)).body.slots.map((s) => hhmmOf(s.start));
    expect(anaSlots).toContain('11:00');
    const notEligible = await ctx.cli.api.patch(`/appointments/${ctx.juanAppointment._id}/reschedule`, { start: at(day(3), '12:00'), employeeId: ctx.carla._id });
    expect(notEligible.body.code).toBe('EMPLOYEE_NOT_ELIGIBLE');
  });

  it('HU-05-E3 el cliente no reprograma con menos de 2 horas de anticipación', async () => {
    const soon = await Appointment.create({ tenantId: ctx.org.id, clientId: ctx.juan._id, employeeId: ctx.ana._id, serviceId: ctx.limpieza._id, start: new Date(Date.now() + 30 * 60000), end: new Date(Date.now() + 60 * 60000), priceSnapshot: 45 });
    const res = await ctx.cli.api.patch(`/appointments/${soon._id}/reschedule`, { start: at(day(5), '16:00') });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No es posible reprogramar con menos de 2 horas de anticipación');
    expect(new Date((await ctx.recep.api.get('/appointments/' + soon._id)).body.start).getTime()).toBe(soon.start.getTime());
    // El plazo es configurable por el administrador.
    expect((await ctx.org.api.patch('/settings', { rescheduleMinHours: 3 })).body.rescheduleMinHours).toBe(3);
    expect((await ctx.cli.api.patch(`/appointments/${soon._id}/reschedule`, { start: at(day(5), '16:00') })).body.error).toBe('No es posible reprogramar con menos de 3 horas de anticipación');
    await ctx.org.api.patch('/settings', { rescheduleMinHours: 2 });
    expect((await ctx.recep.api.get('/settings')).status).toBe(403);
  });

  it('HU-05-E4 una cita cancelada no se reprograma y se sugiere una nueva reserva', async () => {
    const ap = await ctx.cli.api.post('/appointments', { serviceId: ctx.consulta._id, employeeId: ctx.ana._id, start: at(day(7), '09:00') });
    expect((await ctx.cli.api.patch(`/appointments/${ap.body._id}/status`, { status: 'cancelada', reason: 'cliente_no_puede_asistir' })).status).toBe(200);
    const res = await ctx.cli.api.patch(`/appointments/${ap.body._id}/reschedule`, { start: at(day(7), '10:00') });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('APPOINTMENT_INACTIVE');
    expect(res.body.error).toBe(MESSAGES.APPOINTMENT_INACTIVE);
    expect((await ctx.cli.api.get('/appointments/' + ap.body._id)).body.status).toBe('cancelada');
  });
});

describe('HU-06 · Cancelación', () => {
  it('HU-06-E1 / E2 cancelación con motivo: libera el horario y guarda el motivo', async () => {
    const start = at(day(5), '14:00');
    const ap = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.ana._id, serviceId: ctx.consulta._id, start });
    const res = await ctx.recep.api.patch(`/appointments/${ap.body._id}/status`, { status: 'cancelada', reason: 'cliente_no_puede_asistir', version: ap.body.__v });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelada', cancellationReason: 'cliente_no_puede_asistir' });
    expect(res.body.cancelledAt).toBeTruthy();
    expect((await ctx.cli.api.post('/appointments', { serviceId: ctx.consulta._id, employeeId: ctx.ana._id, start })).status).toBe(201);
  });

  it('HU-06-E3 cancelar una cita completada: mensaje oficial y estado intacto', async () => {
    const ap = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.ana._id, serviceId: ctx.consulta._id, start: at(day(5), '16:00') });
    expect((await ctx.recep.api.patch(`/appointments/${ap.body._id}/status`, { status: 'completada' })).status).toBe(200);
    const res = await ctx.recep.api.patch(`/appointments/${ap.body._id}/status`, { status: 'cancelada' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No es posible cancelar una cita ya completada');
    expect((await ctx.recep.api.get('/appointments/' + ap.body._id)).body.status).toBe('completada');
  });

  it('HU-06-E4 dos acciones simultáneas: se aplica la primera y la segunda recibe APPOINTMENT_UPDATED', async () => {
    const ap = await ctx.cli.api.post('/appointments', { serviceId: ctx.consulta._id, employeeId: ctx.ana._id, start: at(day(5), '17:00') });
    const version = ap.body.__v;
    const [a, b] = await Promise.all([
      ctx.recep.api.patch(`/appointments/${ap.body._id}/status`, { status: 'cancelada', reason: 'cliente_no_puede_asistir', version }),
      ctx.cli.api.patch(`/appointments/${ap.body._id}/status`, { status: 'cancelada', version }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a, b].find((r) => r.status === 409).body.code).toBe('APPOINTMENT_UPDATED');
    const final = (await ctx.recep.api.get('/appointments/' + ap.body._id)).body;
    expect(final.status).toBe('cancelada');
    expect(final.__v).toBe(version + 1);
  });
});

describe('HU-10 · Estados de la cita', () => {
  it('HU-10-E2 confirmar se refleja en la agenda del profesional', async () => {
    const ap = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.ana._id, serviceId: ctx.consulta._id, start: at(day(6), '10:00') });
    expect((await ctx.recep.api.patch(`/appointments/${ap.body._id}/status`, { status: 'confirmada' })).status).toBe(200);
    const agenda = (await ctx.pro.api.get(`/appointments?from=${day(6)}&to=${day(7)}`)).body;
    expect(agenda.find((a) => a._id === ap.body._id).status).toBe('confirmada');
    expect(agenda.every((a) => a.employeeId._id === ctx.ana._id)).toBe(true);
  });

  it('HU-10-E3 completar una cita cancelada: mensaje oficial', async () => {
    const ap = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.ana._id, serviceId: ctx.consulta._id, start: at(day(6), '11:00') });
    await ctx.recep.api.patch(`/appointments/${ap.body._id}/status`, { status: 'cancelada' });
    const res = await ctx.recep.api.patch(`/appointments/${ap.body._id}/status`, { status: 'completada' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No es posible completar una cita cancelada');
  });

  it('HU-10-E4 "no asistió" tras la hora de inicio y queda en el historial del cliente', async () => {
    const past = await Appointment.create({ tenantId: ctx.org.id, clientId: ctx.maria._id, employeeId: ctx.ana._id, serviceId: ctx.consulta._id, start: new Date(Date.now() - 2 * 3600e3), end: new Date(Date.now() - 2 * 3600e3 + 15 * 60000), priceSnapshot: 30 });
    const future = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.ana._id, serviceId: ctx.consulta._id, start: at(day(6), '12:00') });
    expect((await ctx.recep.api.patch(`/appointments/${future.body._id}/status`, { status: 'no_asistio' })).body.code).toBe('NO_SHOW_TOO_EARLY');
    expect((await ctx.recep.api.patch(`/appointments/${past._id}/status`, { status: 'no_asistio' })).status).toBe(200);
    const history = (await ctx.recep.api.get(`/clients/${ctx.maria._id}/history`)).body;
    expect(history.summary.no_asistio).toBe(1);
    expect(history.appointments.find((a) => a._id === String(past._id)).status).toBe('no_asistio');
  });

  it('el profesional solo puede confirmar, completar o marcar inasistencia en sus citas', async () => {
    const own = await ctx.recep.api.post('/appointments', { clientId: ctx.maria._id, employeeId: ctx.ana._id, serviceId: ctx.consulta._id, start: at(day(6), '13:00') });
    expect((await ctx.pro.api.patch(`/appointments/${own.body._id}/status`, { status: 'cancelada' })).status).toBe(403);
    expect((await ctx.pro.api.patch(`/appointments/${own.body._id}/status`, { status: 'confirmada' })).status).toBe(200);
  });
});

describe('HU-12 · Búsqueda y filtrado', () => {
  it('HU-12-E1 por nombre de cliente: solo sus citas, ordenadas por fecha', async () => {
    const res = await ctx.recep.api.get('/appointments?q=pedr');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((a) => a.clientId._id === ctx.pedro._id)).toBe(true);
    const starts = res.body.map((a) => Date.parse(a.start));
    expect([...starts].sort((x, y) => x - y)).toEqual(starts);
  });

  it('HU-12-E2 profesional + rango de fechas: solo la intersección', async () => {
    const res = await ctx.recep.api.get(`/appointments?employeeId=${ctx.carla._id}&from=${at(day(11), '00:00')}&to=${at(day(12), '00:00')}`);
    expect(res.body).toHaveLength(4);
    expect(res.body.every((a) => a.employeeId._id === ctx.carla._id && localDate(new Date(a.start), TZ) === day(11))).toBe(true);
  });

  it('HU-12-E3 rango invertido: mensaje oficial', async () => {
    const res = await ctx.recep.api.get(`/appointments?from=${day(10)}&to=${day(2)}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('La fecha inicial no puede ser posterior a la fecha final');
  });

  it('HU-12-E4 servicio sin citas en el periodo: lista vacía', async () => {
    const svc = (await ctx.org.api.post('/services', { name: 'Ortopantomografía', duration: 15, price: 60 })).body;
    const res = await ctx.recep.api.get(`/appointments?serviceId=${svc._id}&from=${day(0)}&to=${day(30)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('HU-13 · Panel de control', () => {
  it('HU-13-E4 organización nueva: indicadores en cero y bienvenida', async () => {
    ctx.taller = await registerOrg(`Taller Mecanico RapiFix ${RUN_ID}`, 'c');
    const res = await ctx.taller.api.get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, scheduled: 0, attended: 0, topService: null, hasAppointments: false, message: MESSAGES.DASHBOARD_WELCOME });
  });

  it('HU-13-E1 / E2 mes actual y último trimestre con servicio más solicitado y tres clientes frecuentes', async () => {
    const tid = ctx.taller.id;
    const [aceite, frenos] = await Service.create([{ tenantId: tid, name: 'Cambio de aceite', duration: 30, price: 45 }, { tenantId: tid, name: 'Frenos', duration: 60, price: 150 }]);
    const emp = await Employee.create({ tenantId: tid, name: 'Mecánico', specialty: 'General' });
    const people = await Client.create(['Ana', 'Bruno', 'Ciro', 'Dina'].map((name) => ({ tenantId: tid, name })));
    const thisMonth = monthStart(new Date(), TZ, 0);
    const lastMonth = monthStart(new Date(), TZ, 1);
    const mk = (date, client, service, status = 'completada', extra = {}) => ({ tenantId: tid, clientId: client._id, employeeId: emp._id, serviceId: service._id, start: zonedToUtc(date, 10 * 60, TZ), end: zonedToUtc(date, 10 * 60 + 30, TZ), priceSnapshot: 45, status, ...extra });
    await Appointment.create([
      mk(thisMonth, people[0], aceite), mk(addDays(thisMonth, 1), people[0], aceite), mk(addDays(thisMonth, 2), people[0], frenos),
      mk(addDays(thisMonth, 3), people[1], aceite), mk(addDays(thisMonth, 4), people[1], aceite, 'programada'),
      mk(addDays(thisMonth, 5), people[2], aceite, 'confirmada'),
      mk(addDays(thisMonth, 6), people[3], frenos, 'cancelada', { cancellationReason: 'cliente_no_puede_asistir' }),
      ...[10, 11, 12, 13, 14].map((d) => mk(addDays(lastMonth, d), people[3], frenos)),
    ]);
    const month = (await ctx.taller.api.get('/dashboard?period=mes')).body;
    expect(month.total).toBe(7);
    expect(month.scheduled).toBe(2);
    expect(month.attended).toBe(4);
    expect(month.topService.name).toBe('Cambio de aceite');
    expect(month.topClients.map((c) => c.name)).toEqual(['Ana', 'Bruno', 'Ciro']);
    expect(month.cancellationsByReason).toEqual([{ reason: 'cliente_no_puede_asistir', label: 'Cliente no puede asistir', count: 1 }]);
    const quarter = (await ctx.taller.api.get('/dashboard?period=trimestre')).body;
    expect(quarter.total).toBe(12);
    expect(quarter.topService.name).toBe('Frenos'); // 6 frente a 5 de cambio de aceite
    expect(quarter.topClients[0].name).toBe('Dina');
    // Aislamiento: el panel de la otra organización no cambia.
    expect((await ctx.other.api.get('/dashboard')).body.total).toBe(0);
  });
});
