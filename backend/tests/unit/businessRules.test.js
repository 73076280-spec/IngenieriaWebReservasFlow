import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { assertTransition } from '../../src/services/appointmentService.js';
import { createCatalogService } from '../../src/services/catalogService.js';
import { createDashboardService, periodRange } from '../../src/services/dashboardService.js';
import { catalogSchemas, appointmentQuerySchema, statusSchema } from '../../src/validation/schemas.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { MESSAGES, rescheduleTooLate } from '../../src/errors/messages.js';
import { createMemoryRepos } from '../helpers/memoryRepos.js';

const T = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = Date.parse('2026-11-23T15:00:00Z');
const admin = { id: 'u1', tenantId: T, role: 'admin', tenant: { timezone: 'America/Lima' } };
const recep = { ...admin, id: 'u2', role: 'recepcionista' };

describe('HU-06 / HU-10 · Máquina de estados de la cita', () => {
  const ap = (status, start = NOW + 3600e3) => ({ status, start: new Date(start) });

  it('HU-10-E1 / E2 programada → completada o confirmada; confirmada → completada', () => {
    expect(() => assertTransition(ap('programada'), 'completada', NOW)).not.toThrow();
    expect(() => assertTransition(ap('programada'), 'confirmada', NOW)).not.toThrow();
    expect(() => assertTransition(ap('confirmada'), 'completada', NOW)).not.toThrow();
  });

  it('HU-06-E3 cancelar una cita completada: mensaje oficial', () => {
    expect(() => assertTransition(ap('completada'), 'cancelada', NOW)).toThrow(expect.objectContaining({ status: 409, code: 'CANCEL_COMPLETED', message: 'No es posible cancelar una cita ya completada' }));
  });

  it('HU-10-E3 completar una cita cancelada: mensaje oficial', () => {
    expect(() => assertTransition(ap('cancelada'), 'completada', NOW)).toThrow(expect.objectContaining({ code: 'COMPLETE_CANCELLED', message: 'No es posible completar una cita cancelada' }));
  });

  it('HU-10-E4 "no asistió" solo después de la hora de inicio', () => {
    expect(() => assertTransition(ap('programada', NOW + 60e3), 'no_asistio', NOW)).toThrow(expect.objectContaining({ code: 'NO_SHOW_TOO_EARLY' }));
    expect(() => assertTransition(ap('programada', NOW - 60e3), 'no_asistio', NOW)).not.toThrow();
  });

  it('los estados finales no admiten cambios y no se retrocede a programada', () => {
    expect(() => assertTransition(ap('no_asistio'), 'confirmada', NOW)).toThrow(expect.objectContaining({ code: 'FINAL_STATE' }));
    expect(() => assertTransition(ap('cancelada'), 'cancelada', NOW)).toThrow(expect.objectContaining({ code: 'SAME_STATUS' }));
    expect(() => assertTransition(ap('confirmada'), 'programada', NOW)).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  it('HU-06-E2 el motivo de cancelación debe ser uno de la lista', () => {
    expect(statusSchema.safeParse({ status: 'cancelada', reason: 'cliente_no_puede_asistir' }).success).toBe(true);
    expect(statusSchema.safeParse({ status: 'cancelada', reason: 'inventado' }).success).toBe(false);
  });

  it('HU-05-E3 mensaje de plazo con el valor configurado', () => {
    expect(rescheduleTooLate(2)).toBe('No es posible reprogramar con menos de 2 horas de anticipación');
    expect(rescheduleTooLate(1)).toBe('No es posible reprogramar con menos de 1 hora de anticipación');
  });
});

describe('HU-01 / HU-02 / HU-03 · Validaciones con mensajes oficiales', () => {
  const first = (schema, data) => schema.safeParse(data).error?.issues[0].message;

  it('HU-01-E3 correo "juan@correo" → "El correo electrónico no tiene un formato válido"', () => {
    expect(first(catalogSchemas.clients, { name: 'Juan', email: 'juan@correo' })).toBe('El correo electrónico no tiene un formato válido');
    expect(catalogSchemas.clients.safeParse({ name: 'Juan', email: 'juan@correo.pe', phone: '987 654 321', notes: 'Alergia a la penicilina' }).success).toBe(true);
  });

  it('HU-02-E3 sin especialidad → "Debe seleccionar al menos una especialidad"', () => {
    expect(first(catalogSchemas.employees, { name: 'Luis' })).toBe('Debe seleccionar al menos una especialidad');
    expect(first(catalogSchemas.employees, { name: 'Luis', specialty: '  ' })).toBe('Debe seleccionar al menos una especialidad');
  });

  it('HU-02 turnos: inicio antes que fin y sin solapes', () => {
    const base = { name: 'Luis', specialty: 'Barbería' };
    expect(first(catalogSchemas.employees, { ...base, schedule: [{ day: 6, start: '14:00', end: '09:00' }] })).toBe(MESSAGES.SCHEDULE_ORDER);
    expect(first(catalogSchemas.employees, { ...base, schedule: [{ day: 6, start: '09:00', end: '13:00' }, { day: 6, start: '12:00', end: '15:00' }] })).toBe(MESSAGES.SCHEDULE_OVERLAP);
    expect(catalogSchemas.employees.safeParse({ ...base, schedule: [{ day: 6, start: '09:00', end: '13:00' }, { day: 6, start: '14:00', end: '18:00' }] }).success).toBe(true);
  });

  it.each([0, -30])('HU-03-E3 duración %i → "La duración del servicio debe ser mayor que cero"', (duration) => {
    expect(first(catalogSchemas.services, { name: 'Limpieza', duration, price: 45 })).toBe('La duración del servicio debe ser mayor que cero');
  });

  it('HU-12-E3 rango invertido → "La fecha inicial no puede ser posterior a la fecha final"', () => {
    expect(first(appointmentQuerySchema, { from: '2026-12-10', to: '2026-12-01' })).toBe('La fecha inicial no puede ser posterior a la fecha final');
  });

  it('la API devuelve el mensaje oficial como error principal', async () => {
    const app = express();
    app.get('/x', () => { catalogSchemas.clients.parse({ name: 'Juan', email: 'juan@correo' }); });
    app.get('/y', () => { catalogSchemas.clients.parse({ name: 'J' }); });
    app.use(errorHandler({ error: () => {} }));
    const res = await request(app).get('/x');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'El correo electrónico no tiene un formato válido', code: 'VALIDATION' });
    expect((await request(app).get('/y')).body.error).toBe(MESSAGES.NAME_REQUIRED);
  });
});

describe('HU-01-E4 / HU-02-E4 / HU-03-E4 · Eliminar y desactivar', () => {
  function setup() {
    const mem = createMemoryRepos();
    const service = createCatalogService({ repos: mem.repos, now: () => NOW });
    return { mem, service };
  }

  it('HU-01-E4 la recepcionista no elimina un cliente con citas pendientes y recibe la advertencia', async () => {
    const { mem, service } = setup();
    const client = mem.seed('clients', T, { name: 'Ana' });
    mem.seed('appointments', T, { clientId: client._id, status: 'programada', start: new Date(NOW + 86400e3) });
    await expect(service.remove(recep, 'clients', client._id)).rejects.toMatchObject({ status: 409, code: 'HAS_ACTIVE_APPOINTMENTS', details: { count: 1 } });
    expect(MESSAGES.CLIENT_HAS_ACTIVE).toContain('Primero debe cancelar o reasignar sus citas pendientes');
    expect(mem.data.clients).toHaveLength(1);
  });

  it('la recepcionista elimina un cliente sin citas', async () => {
    const { mem, service } = setup();
    const client = mem.seed('clients', T, { name: 'Sin citas' });
    await service.remove(recep, 'clients', client._id);
    expect(mem.data.clients).toHaveLength(0);
  });

  it('HU-02-E4 no se desactiva un profesional con citas futuras; sin citas sí', async () => {
    const { mem, service } = setup();
    const emp = mem.seed('employees', T, { name: 'Luis', active: true });
    const ap = mem.seed('appointments', T, { employeeId: emp._id, status: 'confirmada', start: new Date(NOW + 7 * 86400e3) });
    await expect(service.setActive(admin, 'employees', emp._id, { active: false })).rejects.toMatchObject({ code: 'HAS_FUTURE_APPOINTMENTS', details: { count: 1 } });
    expect(emp.active).toBe(true);
    ap.status = 'cancelada';
    await service.setActive(admin, 'employees', emp._id, { active: false });
    expect(emp.active).toBe(false);
  });

  it('HU-03-E4 un servicio con citas no se elimina: se sugiere desactivarlo', async () => {
    const { mem, service } = setup();
    const svc = mem.seed('services', T, { name: 'Limpieza dental', duration: 30, price: 45 });
    mem.seed('appointments', T, { serviceId: svc._id, status: 'programada', start: new Date(NOW + 86400e3) });
    await expect(service.remove(admin, 'services', svc._id)).rejects.toMatchObject({ code: 'HAS_APPOINTMENTS', details: { suggestion: 'deactivate', future: 1 } });
    expect(mem.data.services).toHaveLength(1);
    await service.setActive(admin, 'services', svc._id, { active: false });
    expect(svc.active).toBe(false);
  });

  it('la recepcionista no puede desactivar servicios', async () => {
    const { mem, service } = setup();
    const svc = mem.seed('services', T, { name: 'X', duration: 30, price: 1 });
    await expect(service.setActive(recep, 'services', svc._id, { active: false })).rejects.toMatchObject({ status: 403 });
  });
});

describe('HU-13 · Panel de indicadores', () => {
  it('periodos: mes actual, trimestre (3 meses) y año (12 meses) en hora de Lima', () => {
    const now = Date.parse('2026-11-23T15:00:00Z');
    expect(periodRange('mes', now).from.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(periodRange('trimestre', now).from.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(periodRange('anio', now).from.toISOString()).toBe('2025-12-01T05:00:00.000Z');
    expect(periodRange('mes', now).to.toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });

  it('HU-13-E3 una falla de la base responde 503 amigable sin datos parciales', async () => {
    const failing = { forTenant: () => ({ tenantId: T, aggregate: async () => { throw new Error('connection reset'); }, countDocuments: async () => 3 }) };
    const svc = createDashboardService({ repos: { appointments: failing }, now: () => NOW, logger: { error: () => {} } });
    await expect(svc.summary(admin, {})).rejects.toMatchObject({ status: 503, code: 'DASHBOARD_UNAVAILABLE', message: MESSAGES.DASHBOARD_UNAVAILABLE });
  });

  it('HU-13-E4 organización sin citas: indicadores en cero y bienvenida', async () => {
    const empty = { forTenant: () => ({ tenantId: T, aggregate: async () => [], countDocuments: async () => 0 }) };
    const res = await createDashboardService({ repos: { appointments: empty }, now: () => NOW }).summary(admin, {});
    expect(res).toMatchObject({ period: 'mes', total: 0, scheduled: 0, attended: 0, topService: null, topClients: [], hasAppointments: false, message: MESSAGES.DASHBOARD_WELCOME });
  });

  it('el panel solo es para el administrador', async () => {
    const svc = createDashboardService({ repos: {}, now: () => NOW });
    await expect(svc.summary(recep, {})).rejects.toMatchObject({ status: 403 });
  });
});
