import { describe, it, expect } from 'vitest';
import { freeStarts, isEligible, inSchedule, createAvailabilityService } from '../../src/services/availabilityService.js';
import { zonedToUtc, localDate, weekdayOf, addDays, monthStart } from '../../src/utils/time.js';
import { MESSAGES } from '../../src/errors/messages.js';
import { createMemoryRepos } from '../helpers/memoryRepos.js';

const TZ = 'America/Lima';
const T = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MONDAY = '2026-11-30';
const at = (date, hhmm) => zonedToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ);
const hm = (ms) => new Date(ms).toLocaleTimeString('es-PE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

describe('Utilidades de zona horaria', () => {
  it('convierte hora local de Lima (UTC-5) a UTC y viceversa', () => {
    expect(at(MONDAY, '09:00').toISOString()).toBe('2026-11-30T14:00:00.000Z');
    expect(localDate(new Date('2026-12-01T03:00:00Z'), TZ)).toBe(MONDAY); // 22:00 del lunes en Lima
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(monthStart(new Date('2026-11-23T12:00:00Z'), TZ, 2)).toBe('2026-09-01');
  });
});

describe('HU-07 · Cálculo de bloques disponibles', () => {
  const schedule = [{ day: 1, start: '09:00', end: '12:00' }];
  const past = Date.parse('2026-11-01T00:00:00Z');

  it('HU-07-E1 devuelve inicios cada 15 minutos cuyo bloque completo cabe en el turno', () => {
    const starts = freeStarts({ dateStr: MONDAY, tz: TZ, schedule, duration: 30, nowMs: past });
    expect(starts.map(hm)).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30']);
  });

  it('HU-09-E1 un bloque ocupado (cita de 10:00 a 10:30) no se ofrece ni se solapa', () => {
    const busy = new Set([at(MONDAY, '10:00').getTime(), at(MONDAY, '10:15').getTime()]);
    const starts = freeStarts({ dateStr: MONDAY, tz: TZ, schedule, duration: 30, busy, nowMs: past }).map(hm);
    expect(starts).not.toContain('09:45');
    expect(starts).not.toContain('10:00');
    expect(starts).not.toContain('10:15');
    expect(starts).toContain('09:30');
    expect(starts).toContain('10:30');
  });

  it('no ofrece horarios ya pasados ni días sin turno', () => {
    const nowMs = at(MONDAY, '10:05').getTime();
    expect(freeStarts({ dateStr: MONDAY, tz: TZ, schedule, duration: 30, nowMs })[0]).toBe(at(MONDAY, '10:15').getTime());
    expect(freeStarts({ dateStr: addDays(MONDAY, 1), tz: TZ, schedule, duration: 30, nowMs: past })).toEqual([]);
  });

  it('elegibilidad: activo y habilitado para el servicio; sin servicios = generalista', () => {
    expect(isEligible({ active: true, serviceIds: [] }, 's1')).toBe(true);
    expect(isEligible({ serviceIds: ['s1'] }, 's1')).toBe(true);
    expect(isEligible({ serviceIds: ['s2'] }, 's1')).toBe(false);
    expect(isEligible({ active: false, serviceIds: [] }, 's1')).toBe(false);
  });

  it('HU-04-E3 una cita fuera del turno no está dentro del horario laboral', () => {
    const emp = { schedule };
    expect(inSchedule(at(MONDAY, '11:30'), at(MONDAY, '12:00'), emp, TZ)).toBe(true);
    expect(inSchedule(at(MONDAY, '11:45'), at(MONDAY, '12:15'), emp, TZ)).toBe(false);
    expect(inSchedule(at(MONDAY, '20:00'), at(MONDAY, '20:30'), emp, TZ)).toBe(false);
  });
});

describe('HU-07 · Servicio de disponibilidad', () => {
  const nowMs = at('2026-11-23', '08:00').getTime(); // lunes 23 a las 08:00 en Lima
  const auth = { tenantId: T, role: 'cliente', tenant: { timezone: TZ } };

  function setup() {
    const mem = createMemoryRepos();
    const service = mem.seed('services', T, { name: 'Corte de cabello', duration: 30, price: 20 });
    const other = mem.seed('services', T, { name: 'Tinte', duration: 60, price: 80 });
    const weekdays = [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '11:00' }));
    const ana = mem.seed('employees', T, { name: 'Ana', serviceIds: [service._id], schedule: weekdays });
    const beto = mem.seed('employees', T, { name: 'Beto', serviceIds: [], schedule: [{ day: 1, start: '10:00', end: '12:00' }] });
    mem.seed('employees', T, { name: 'Carla', serviceIds: [other._id], schedule: weekdays }); // no habilitada
    mem.seed('employees', T, { name: 'Dora', active: false, serviceIds: [], schedule: weekdays }); // inactiva
    const svc = createAvailabilityService({ repos: mem.repos, now: () => nowMs });
    return { mem, svc, service, ana, beto };
  }

  it('HU-07-E1 con profesional: bloques según duración y agenda del profesional', async () => {
    const { svc, service, ana } = setup();
    const res = await svc.query(auth, { serviceId: service._id, employeeId: ana._id, date: MONDAY });
    expect(res.slots.map((s) => hm(Date.parse(s.start)))).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30']);
    expect(res.message).toBeUndefined();
  });

  it('HU-07-E2 sin profesional: une la agenda de los habilitados (no los inhabilitados ni inactivos)', async () => {
    const { svc, service } = setup();
    const res = await svc.query(auth, { serviceId: service._id, date: MONDAY });
    const names = new Set(res.slots.flatMap((s) => s.employees.map((e) => e.name)));
    expect([...names].sort()).toEqual(['Ana', 'Beto']);
    const at1030 = res.slots.find((s) => hm(Date.parse(s.start)) === '10:30');
    expect(at1030.employees.map((e) => e.name)).toEqual(['Ana', 'Beto']);
    expect(res.slots.at(-1).employees.map((e) => e.name)).toEqual(['Beto']); // 11:30 solo Beto
  });

  it('HU-07-E3 fecha pasada: 400 con el mensaje oficial y sin consultar la agenda', async () => {
    const { svc, service, mem } = setup();
    await expect(svc.query(auth, { serviceId: service._id, date: '2026-11-22' })).rejects.toMatchObject({ status: 400, code: 'PAST_DATE', message: MESSAGES.PAST_DATE });
    expect(MESSAGES.PAST_DATE).toBe('No es posible consultar disponibilidad para fechas pasadas');
    expect(mem.calls.filter((c) => c.kind === 'slots')).toHaveLength(0);
  });

  it('rechaza fechas a más de 90 días', async () => {
    const { svc, service } = setup();
    await expect(svc.query(auth, { serviceId: service._id, date: addDays('2026-11-23', 91) })).rejects.toMatchObject({ code: 'DATE_TOO_FAR' });
  });

  it('HU-07-E4 agenda completa: mensaje oficial y fechas cercanas con disponibilidad', async () => {
    const { svc, service, ana, mem } = setup();
    for (let m = 9 * 60; m < 11 * 60; m += 15) mem.seed('slots', T, { employeeId: ana._id, at: zonedToUtc(MONDAY, m, TZ), appointmentId: 'x' });
    const res = await svc.query(auth, { serviceId: service._id, employeeId: ana._id, date: MONDAY });
    expect(res.slots).toEqual([]);
    expect(res.message).toBe('No hay horarios disponibles para esta fecha');
    expect(res.suggestions.map((s) => s.date)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03']);
    expect(res.suggestions.every((s) => s.available > 0)).toBe(true);
  });

  it('HU-09-E2 sugiere el inicio libre más cercano con el mismo profesional', async () => {
    const { svc, service, ana, mem } = setup();
    for (const t of ['09:00', '09:15', '09:30', '09:45']) mem.seed('slots', T, { employeeId: ana._id, at: at(MONDAY, t), appointmentId: 'x' });
    const s = await svc.nearest(auth, { service, preferred: [ana], start: at(MONDAY, '09:15') });
    expect(hm(Date.parse(s.start))).toBe('10:00');
    expect(s.employee.name).toBe('Ana');
  });

  it('un profesional no habilitado para el servicio se rechaza', async () => {
    const { svc, service, mem } = setup();
    const carla = mem.data.employees.find((e) => e.name === 'Carla');
    await expect(svc.query(auth, { serviceId: service._id, employeeId: carla._id, date: MONDAY })).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_ELIGIBLE' });
  });
});
