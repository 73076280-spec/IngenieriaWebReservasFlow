import { badRequest, conflict } from '../errors/AppError.js';
import { MESSAGES } from '../errors/messages.js';
import { availabilityQuerySchema } from '../validation/schemas.js';
import { assertCan } from './policies.js';
import { DEFAULT_TZ, addDays, daysBetween, hhmmToMinutes, localDate, weekdayOf, zonedParts, zonedToUtc } from '../utils/time.js';

export const SLOT_MINUTES = 15;
export const SLOT_MS = SLOT_MINUTES * 60000;
export const MAX_DAYS_AHEAD = 90;
const SUGGESTION_DAYS = 14;
const MAX_SUGGESTIONS = 3;

const idOf = (ref) => String(ref?._id ?? ref);

/** Profesional activo y habilitado para el servicio. serviceIds vacío = atiende todos los servicios. */
export function isEligible(employee, serviceId) {
  if (!employee || employee.active === false) return false;
  const ids = employee.serviceIds || [];
  return ids.length === 0 || ids.some((id) => idOf(id) === String(serviceId));
}

/** true si [start, end) cae completo dentro de un turno del profesional (mismo día local). */
export function inSchedule(start, end, employee, tz = DEFAULT_TZ) {
  const a = zonedParts(start, tz);
  const b = zonedParts(new Date(end.getTime() - 1), tz);
  if (a.year !== b.year || a.month !== b.month || a.day !== b.day) return false; // sin turnos que crucen la medianoche
  const startMin = a.hour * 60 + a.minute;
  const endMin = b.hour * 60 + b.minute + 1;
  return (employee.schedule || []).some((s) => s.day === a.weekday && startMin >= hhmmToMinutes(s.start) && endMin <= hhmmToMinutes(s.end));
}

/** Bloques de 15 minutos que ocupa una cita. */
export function slotPoints(start, end) {
  const points = [];
  for (let t = +start; t < +end; t += SLOT_MS) points.push(new Date(t));
  return points;
}

/**
 * Inicios libres de un profesional en una fecha local: dentro de cada turno del día,
 * con el bloque completo libre, posteriores a `nowMs`. `busy` contiene los instantes
 * (ms) de los bloques ocupados del profesional.
 */
function blockIsFree(start, duration, busy) {
  for (let t = start; t < start + duration * 60000; t += SLOT_MS) if (busy.has(t)) return false;
  return true;
}

export function freeStarts({ dateStr, tz = DEFAULT_TZ, schedule = [], duration, busy = new Set(), nowMs = Date.now() }) {
  const day = weekdayOf(dateStr);
  const starts = new Set();
  for (const s of schedule.filter((x) => x.day === day)) {
    const open = Math.ceil(hhmmToMinutes(s.start) / SLOT_MINUTES) * SLOT_MINUTES;
    const close = hhmmToMinutes(s.end);
    for (let m = open; m + duration <= close; m += SLOT_MINUTES) {
      const start = zonedToUtc(dateStr, m, tz).getTime();
      if (start > nowMs && blockIsFree(start, duration, busy)) starts.add(start);
    }
  }
  return [...starts].sort((a, b) => a - b);
}

/** Inicio libre más cercano a `requested` entre varios días; en empate, el posterior. */
function closestStart(startMaps, requested) {
  let best = null;
  for (const byStart of startMaps) {
    for (const [t, emps] of byStart) {
      const distance = Math.abs(t - requested);
      if (!best || distance < best.distance || (distance === best.distance && t > best.t)) best = { t, distance, employee: emps[0] };
    }
  }
  return best;
}

/** Consulta de disponibilidad (HU-07) y sugerencias ante conflicto (HU-09-E2). */
export function createAvailabilityService({ repos, now = () => Date.now() }) {
  const r = (auth) => ({
    employees: repos.employees.forTenant(auth.tenantId),
    services: repos.services.forTenant(auth.tenantId),
    slots: repos.slots.forTenant(auth.tenantId),
  });
  const tzOf = (auth) => auth.tenant?.timezone || DEFAULT_TZ;

  /** Bloques ocupados por profesional entre dos fechas locales [fromDate, toDate). */
  async function busyByEmployee(auth, employees, fromDate, toDate) {
    const tz = tzOf(auth);
    const rows = await r(auth).slots
      .find({ employeeId: { $in: employees.map((e) => e._id) }, at: { $gte: zonedToUtc(fromDate, 0, tz), $lt: zonedToUtc(toDate, 0, tz) } }, 'employeeId at')
      .lean();
    const map = new Map(employees.map((e) => [idOf(e._id), new Set()]));
    for (const row of rows) map.get(idOf(row.employeeId))?.add(new Date(row.at).getTime());
    return map;
  }

  /** Mapa inicio(ms) → profesionales libres, para una fecha. */
  function startsForDay(auth, employees, service, dateStr, busy) {
    const tz = tzOf(auth);
    const byStart = new Map();
    for (const e of employees) {
      for (const t of freeStarts({ dateStr, tz, schedule: e.schedule, duration: service.duration, busy: busy.get(idOf(e._id)), nowMs: now() })) {
        if (!byStart.has(t)) byStart.set(t, []);
        byStart.get(t).push({ _id: e._id, name: e.name });
      }
    }
    return byStart;
  }

  async function eligibleEmployees(auth, serviceId, employeeId) {
    const repo = r(auth);
    if (employeeId) {
      const e = await repo.employees.findById(employeeId).lean();
      if (!isEligible(e, serviceId)) throw badRequest(MESSAGES.EMPLOYEE_NOT_ELIGIBLE, 'EMPLOYEE_NOT_ELIGIBLE');
      return [e];
    }
    const all = await repo.employees.find({ active: { $ne: false } }).sort({ name: 1 }).lean();
    return all.filter((e) => isEligible(e, serviceId));
  }

  async function activeService(auth, serviceId) {
    const service = await r(auth).services.findById(serviceId).lean();
    if (!service) throw badRequest(MESSAGES.BOOKING_REFS);
    if (service.active === false) throw conflict(MESSAGES.SERVICE_INACTIVE, 'SERVICE_INACTIVE');
    return service;
  }

  return {
    eligibleEmployees,

    async query(auth, rawQuery = {}) {
      assertCan(auth, 'availability:read');
      const q = availabilityQuerySchema.parse(rawQuery);
      const tz = tzOf(auth);
      const today = localDate(new Date(now()), tz);
      if (q.date < today) throw badRequest(MESSAGES.PAST_DATE, 'PAST_DATE'); // HU-07-E3: no se calcula nada
      if (daysBetween(today, q.date) > MAX_DAYS_AHEAD) throw badRequest(MESSAGES.DATE_TOO_FAR, 'DATE_TOO_FAR');
      const service = await activeService(auth, q.serviceId);
      const employees = await eligibleEmployees(auth, q.serviceId, q.employeeId);

      const busy = await busyByEmployee(auth, employees, q.date, addDays(q.date, 1));
      const byStart = startsForDay(auth, employees, service, q.date, busy);
      const slots = [...byStart.keys()].sort((a, b) => a - b).map((t) => ({
        start: new Date(t).toISOString(),
        end: new Date(t + service.duration * 60000).toISOString(),
        employees: byStart.get(t),
      }));
      const result = {
        date: q.date,
        timezone: tz,
        service: { _id: service._id, name: service.name, duration: service.duration },
        employeeId: q.employeeId || null,
        slots,
      };
      if (slots.length) return result;

      // HU-07-E4: agenda llena → mensaje y fechas cercanas con disponibilidad (una sola consulta de bloques).
      const lastDay = addDays(today, MAX_DAYS_AHEAD);
      const from = addDays(q.date, 1);
      const to = addDays(q.date, 1 + SUGGESTION_DAYS) < lastDay ? addDays(q.date, 1 + SUGGESTION_DAYS) : addDays(lastDay, 1);
      const suggestions = [];
      if (from <= lastDay) {
        const busyAhead = await busyByEmployee(auth, employees, from, to);
        for (let d = from; d < to && suggestions.length < MAX_SUGGESTIONS; d = addDays(d, 1)) {
          const starts = startsForDay(auth, employees, service, d, busyAhead);
          if (starts.size) suggestions.push({ date: d, available: starts.size, firstStart: new Date(Math.min(...starts.keys())).toISOString() });
        }
      }
      return { ...result, message: MESSAGES.NO_AVAILABILITY, suggestions };
    },

    /**
     * Inicio libre más cercano (antes o después, siempre futuro) al solicitado, primero con
     * los profesionales preferidos y luego con el resto de habilitados (HU-09-E2).
     */
    async nearest(auth, { service, preferred = [], start }) {
      const tz = tzOf(auth);
      const requested = new Date(start).getTime();
      const baseDay = localDate(new Date(Math.max(requested, now())), tz);
      const days = [addDays(baseDay, -1), baseDay, ...Array.from({ length: 7 }, (_, i) => addDays(baseDay, i + 1))];
      const all = await eligibleEmployees(auth, service._id);
      const preferredIds = new Set(preferred.map((e) => idOf(e._id ?? e)));
      const groups = [all.filter((e) => preferredIds.has(idOf(e._id))), all.filter((e) => !preferredIds.has(idOf(e._id)))];
      for (const group of groups) {
        if (!group.length) continue;
        const busy = await busyByEmployee(auth, group, days[0], addDays(days.at(-1), 1));
        const best = closestStart(days.map((d) => startsForDay(auth, group, service, d, busy)), requested);
        if (best) return { start: new Date(best.t).toISOString(), end: new Date(best.t + service.duration * 60000).toISOString(), employee: best.employee };
      }
      return null;
    },
  };
}
