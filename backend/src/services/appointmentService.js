import mongoose from 'mongoose';
import { badRequest, conflict, forbidden, notFound } from '../errors/AppError.js';
import { MESSAGES, CANCELLATION_REASONS, rescheduleTooLate } from '../errors/messages.js';
import { bookingSchema, statusSchema, rescheduleSchema, appointmentQuerySchema, oid } from '../validation/schemas.js';
import { assertCan, appointmentScope, assertAppointmentVisible, allowedStatuses } from './policies.js';
import { SLOT_MS, inSchedule, isEligible, slotPoints } from './availabilityService.js';
import { DEFAULT_TZ } from '../utils/time.js';

export { inSchedule };

export const ACTIVE = ['programada', 'confirmada'];
export const FINAL = ['cancelada', 'completada', 'no_asistio'];
const TRANSITIONS = {
  programada: ['confirmada', 'completada', 'cancelada', 'no_asistio'],
  confirmada: ['completada', 'cancelada', 'no_asistio'],
};
const STATUS_LABEL = { programada: 'programada', confirmada: 'confirmada', completada: 'completada', cancelada: 'cancelada', no_asistio: 'no asistió' };

/**
 * Máquina de estados de la cita (HU-06-E3, HU-10). Lanza un 409 con el mensaje oficial
 * cuando la transición no es válida.
 */
export function assertTransition(appointment, next, nowMs = Date.now()) {
  const current = appointment.status;
  if (current === next) throw conflict(`La cita ya se encuentra en estado "${STATUS_LABEL[next]}"`, 'SAME_STATUS');
  if (current === 'completada' && next === 'cancelada') throw conflict(MESSAGES.CANCEL_COMPLETED, 'CANCEL_COMPLETED');
  if (current === 'cancelada' && next === 'completada') throw conflict(MESSAGES.COMPLETE_CANCELLED, 'COMPLETE_CANCELLED');
  if (FINAL.includes(current)) throw conflict(MESSAGES.FINAL_STATE, 'FINAL_STATE');
  if (!TRANSITIONS[current]?.includes(next)) throw conflict(`No es posible cambiar una cita ${STATUS_LABEL[current]} a "${STATUS_LABEL[next]}"`, 'INVALID_TRANSITION');
  if (next === 'no_asistio' && new Date(appointment.start).getTime() > nowMs) throw conflict(MESSAGES.NO_SHOW_TOO_EARLY, 'NO_SHOW_TOO_EARLY');
}

const isDuplicateKey = (err) => err?.code === 11000 || err?.writeErrors?.some?.((e) => e.code === 11000) || /E11000/.test(String(err?.message));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const idOf = (ref) => String(ref?._id ?? ref);

/** Intersección de restricciones sobre una lista de IDs; null = sin restricción. */
function intersect(current, ids) {
  return current === null ? ids : current.filter((id) => ids.includes(id));
}

/**
 * Filtro combinable de citas (HU-12) dentro del alcance del rol. Devuelve null si la
 * combinación no puede tener resultados (p. ej. un cliente que pide citas de otro).
 */
async function buildFilter(repo, q, scope) {
  let clientIds = null;
  if (q.clientId) clientIds = intersect(clientIds, [q.clientId]);
  if (scope.clientId) clientIds = intersect(clientIds, [String(scope.clientId)]);
  if (q.q) {
    const matches = await repo.clients.find({ name: { $regex: escapeRegex(q.q), $options: 'i' } }, '_id').lean();
    clientIds = intersect(clientIds, matches.map((c) => String(c._id)));
  }
  if (clientIds !== null && clientIds.length === 0) return null;
  if (scope.employeeId && q.employeeId && q.employeeId !== String(scope.employeeId)) return null;

  const filter = {};
  if (clientIds !== null) filter.clientId = { $in: clientIds };
  const employeeId = scope.employeeId || q.employeeId;
  if (employeeId) filter.employeeId = employeeId;
  if (q.serviceId) filter.serviceId = q.serviceId;
  if (q.status) filter.status = q.status;
  const range = dateRange(q);
  if (range) filter.start = range;
  return filter;
}

/** El cliente siempre reserva para sí mismo: se ignora cualquier clientId recibido (HU-04-E1). */
function resolveClientId(auth, d) {
  if (auth.role === 'cliente') {
    if (!auth.clientId) throw forbidden('CLIENT_PROFILE_MISSING', MESSAGES.CLIENT_PROFILE_MISSING);
    return auth.clientId;
  }
  if (!d.clientId) throw badRequest('Seleccione el cliente de la cita', 'VALIDATION');
  return d.clientId;
}

function dateRange({ from, to }) {
  if (!from && !to) return null;
  return { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lt: new Date(to) } : {}) };
}

/** Registro, consulta, estados y reprogramación de citas (HU-04..06, HU-09, HU-10, HU-12). */
export function createAppointmentService({ repos, availability, notifier, startSession = () => mongoose.startSession(), now = () => Date.now(), logger = console }) {
  const r = (auth) => ({
    appointments: repos.appointments.forTenant(auth.tenantId),
    slots: repos.slots.forTenant(auth.tenantId),
    clients: repos.clients.forTenant(auth.tenantId),
    employees: repos.employees.forTenant(auth.tenantId),
    services: repos.services.forTenant(auth.tenantId),
  });
  const tzOf = (auth) => auth.tenant?.timezone || DEFAULT_TZ;
  const populate = (q) => q.populate('clientId', 'name phone email').populate('employeeId', 'name specialty').populate('serviceId', 'name duration price');

  async function inTransaction(fn) {
    const session = await startSession();
    let result;
    try {
      await session.withTransaction(async () => { result = await fn(session); });
    } finally {
      await session.endSession();
    }
    return result;
  }

  function validateStart(startIso) {
    const start = new Date(startIso);
    if (start.getTime() % SLOT_MS !== 0) throw badRequest(MESSAGES.SLOT_ALIGNMENT, 'SLOT_ALIGNMENT');
    if (start.getTime() < now()) throw badRequest(MESSAGES.PAST_BOOKING, 'PAST_BOOKING');
    return start;
  }

  const suggestionFor = (auth, service, preferred, start) => (availability ? availability.nearest(auth, { service, preferred, start }) : null);

  async function slotTaken(auth, service, preferred, start) {
    return conflict(MESSAGES.SLOT_TAKEN, 'SLOT_TAKEN', { suggestion: await suggestionFor(auth, service, preferred, start) });
  }

  /** Confirmación por correo sin propagar errores: la reserva ya es definitiva. */
  async function notifyBooking(auth, appointmentId) {
    if (!notifier) return null;
    try {
      return await notifier.confirm(auth, appointmentId);
    } catch {
      logger.error?.(`[correo] No se pudo registrar la confirmación de la cita ${appointmentId}`);
      return { status: 'fallida', error: 'INTERNAL' };
    }
  }

  /** Profesional elegido: habilitado para el servicio y con el horario dentro de su turno (HU-04-E3). */
  async function chosenEmployee(auth, employeeId, service, start, end) {
    const employee = await r(auth).employees.findById(employeeId).lean();
    if (!employee) throw badRequest(MESSAGES.BOOKING_REFS);
    if (!isEligible(employee, service._id)) throw conflict(MESSAGES.EMPLOYEE_NOT_ELIGIBLE, 'EMPLOYEE_NOT_ELIGIBLE');
    if (!inSchedule(start, end, employee, tzOf(auth))) {
      throw conflict(MESSAGES.SLOT_UNAVAILABLE, 'OUT_OF_SCHEDULE', { suggestion: await suggestionFor(auth, service, [employee], start) });
    }
    return employee;
  }

  /** HU-04-E2: profesionales habilitados, en turno y libres, en orden alfabético. */
  async function anyAvailableEmployees(auth, service, start, end) {
    const repo = r(auth);
    const eligible = (await repo.employees.find({ active: { $ne: false } }).sort({ name: 1 }).lean()).filter((e) => isEligible(e, service._id));
    const inShift = eligible.filter((e) => inSchedule(start, end, e, tzOf(auth)));
    if (!inShift.length) throw conflict(MESSAGES.SLOT_UNAVAILABLE, 'OUT_OF_SCHEDULE', { suggestion: await suggestionFor(auth, service, eligible, start) });
    const busy = await repo.slots.find({ employeeId: { $in: inShift.map((e) => e._id) }, at: { $gte: start, $lt: end } }, 'employeeId').lean();
    const busyIds = new Set(busy.map((s) => idOf(s.employeeId)));
    const free = inShift.filter((e) => !busyIds.has(idOf(e._id)));
    if (!free.length) throw await slotTaken(auth, service, inShift, start);
    return free;
  }

  /** Crea la cita y ocupa sus bloques en una transacción; el índice único impide duplicados (HU-09). */
  function book(auth, { clientId, employee, service, start, end }) {
    const repo = r(auth);
    return inTransaction(async (session) => {
      const ap = await repo.appointments.create(
        { clientId, employeeId: employee._id, serviceId: service._id, start, end, priceSnapshot: service.price },
        { session },
      );
      await repo.slots.insertMany(slotPoints(start, end).map((at) => ({ employeeId: employee._id, at, appointmentId: ap._id })), { session });
      return ap;
    });
  }

  return {
    async list(auth, query = {}) {
      assertCan(auth, 'appointments:read');
      const scope = appointmentScope(auth);
      if (scope === null) return [];
      const q = appointmentQuerySchema.parse(query);
      const repo = r(auth);
      const filter = await buildFilter(repo, q, scope);
      if (!filter) return [];
      return populate(repo.appointments.find(filter).sort({ start: 1 })).lean();
    },

    async get(auth, id) {
      assertCan(auth, 'appointments:read');
      const ap = await populate(r(auth).appointments.findById(oid.parse(id))).lean();
      assertAppointmentVisible(auth, ap);
      return ap;
    },

    async create(auth, body) {
      assertCan(auth, 'appointments:create');
      const d = bookingSchema.parse(body);
      const clientId = resolveClientId(auth, d);
      const repo = r(auth);
      const [client, service] = await Promise.all([repo.clients.findById(clientId).lean(), repo.services.findById(d.serviceId).lean()]);
      if (!client || !service) throw badRequest(MESSAGES.BOOKING_REFS);
      if (service.active === false) throw conflict(MESSAGES.SERVICE_INACTIVE, 'SERVICE_INACTIVE');
      const start = validateStart(d.start);
      const end = new Date(+start + service.duration * 60000);
      const candidates = d.employeeId
        ? [await chosenEmployee(auth, d.employeeId, service, start, end)]
        : await anyAvailableEmployees(auth, service, start, end);

      for (const employee of candidates) {
        let ap;
        try {
          ap = await book(auth, { clientId, employee, service, start, end });
        } catch (err) {
          if (!isDuplicateKey(err)) throw err; // otra reserva ganó la carrera: se prueba el siguiente profesional
          continue;
        }
        // HU-04-E1: la cita ya está confirmada en la base; el correo se intenta después y su fallo no la afecta.
        const notification = await notifyBooking(auth, ap._id);
        const plain = typeof ap.toObject === 'function' ? ap.toObject() : ap;
        return { ...plain, notification, confirmation: { code: String(ap._id).slice(-8).toUpperCase(), employeeName: employee.name, serviceName: service.name } };
      }
      throw await slotTaken(auth, service, candidates, start);
    },

    async changeStatus(auth, id, body) {
      assertCan(auth, 'appointments:status');
      const _id = oid.parse(id);
      const d = statusSchema.parse(body);
      const allowed = allowedStatuses(auth.role);
      if (allowed && !allowed.includes(d.status)) throw forbidden('FORBIDDEN', MESSAGES.STATUS_NOT_ALLOWED);
      const repo = r(auth);
      return inTransaction(async (session) => {
        const ap = await repo.appointments.findById(_id).session(session);
        assertAppointmentVisible(auth, ap);
        // HU-06-E4: si otro usuario la modificó después de leerla, no se aplica el cambio.
        if (d.version !== undefined && ap.__v !== d.version) throw conflict(MESSAGES.APPOINTMENT_UPDATED, 'APPOINTMENT_UPDATED', { status: ap.status });
        assertTransition(ap, d.status, now());
        ap.status = d.status;
        if (d.status === 'cancelada') {
          ap.cancellationReason = d.reason || null;
          ap.cancelledAt = new Date(now());
          ap.cancelledBy = auth.id;
        }
        ap.increment();
        await ap.save({ session });
        if (d.status === 'cancelada') await repo.slots.deleteMany({ appointmentId: ap._id }, { session });
        return ap;
      });
    },

    async reschedule(auth, id, body) {
      assertCan(auth, 'appointments:reschedule');
      const _id = oid.parse(id);
      const d = rescheduleSchema.parse(body);
      const repo = r(auth);
      const tz = tzOf(auth);
      const current = await repo.appointments.findById(_id).lean();
      assertAppointmentVisible(auth, current);
      // HU-05-E4: una cita que ya no está activa no se reprograma; se sugiere una nueva reserva.
      if (FINAL.includes(current.status)) {
        throw conflict(MESSAGES.APPOINTMENT_INACTIVE, 'APPOINTMENT_INACTIVE', { status: current.status, serviceId: current.serviceId, employeeId: current.employeeId });
      }
      if (d.version !== undefined && current.__v !== d.version) throw conflict(MESSAGES.APPOINTMENT_UPDATED, 'APPOINTMENT_UPDATED', { status: current.status });
      // HU-05-E3: plazo mínimo configurable para el cliente.
      if (auth.role === 'cliente') {
        const hours = auth.tenant?.settings?.rescheduleMinHours ?? 2;
        if (new Date(current.start).getTime() - now() < hours * 3600000) throw conflict(rescheduleTooLate(hours), 'RESCHEDULE_TOO_LATE', { hours });
      }
      const service = await repo.services.findById(current.serviceId).lean();
      if (!service) throw badRequest(MESSAGES.BOOKING_REFS);
      const employee = await repo.employees.findById(d.employeeId || current.employeeId).lean();
      if (!employee) throw badRequest(MESSAGES.BOOKING_REFS);
      // HU-05-E2: el nuevo profesional debe estar activo y habilitado para el mismo servicio.
      if (!isEligible(employee, service._id)) throw conflict(MESSAGES.EMPLOYEE_NOT_ELIGIBLE, 'EMPLOYEE_NOT_ELIGIBLE');
      const start = validateStart(d.start);
      const end = new Date(+start + service.duration * 60000);
      if (!inSchedule(start, end, employee, tz)) {
        throw conflict(MESSAGES.SLOT_UNAVAILABLE, 'OUT_OF_SCHEDULE', { suggestion: await suggestionFor(auth, service, [employee], start) });
      }
      try {
        return await inTransaction(async (session) => {
          const ap = await repo.appointments.findById(_id).session(session);
          if (!ap || FINAL.includes(ap.status)) throw conflict(MESSAGES.APPOINTMENT_INACTIVE, 'APPOINTMENT_INACTIVE');
          if (d.version !== undefined && ap.__v !== d.version) throw conflict(MESSAGES.APPOINTMENT_UPDATED, 'APPOINTMENT_UPDATED', { status: ap.status });
          await repo.slots.deleteMany({ appointmentId: _id }, { session });
          await repo.slots.insertMany(slotPoints(start, end).map((at) => ({ employeeId: employee._id, at, appointmentId: _id })), { session });
          ap.start = start;
          ap.end = end;
          ap.employeeId = employee._id;
          ap.status = 'programada';
          ap.increment();
          await ap.save({ session });
          return ap;
        });
      } catch (err) {
        if (isDuplicateKey(err)) throw await slotTaken(auth, service, [employee], start);
        throw err;
      }
    },

    /** Historial de citas y asistencia de un cliente (HU-10-E4, HU-01-E2). */
    async clientHistory(auth, clientId) {
      assertCan(auth, 'clients:read');
      const repo = r(auth);
      const client = await repo.clients.findById(oid.parse(clientId)).lean();
      if (!client) throw notFound('Cliente no encontrado');
      const appointments = await populate(repo.appointments.find({ clientId: client._id }).sort({ start: -1 })).lean();
      const summary = { total: appointments.length, programada: 0, confirmada: 0, completada: 0, cancelada: 0, no_asistio: 0 };
      for (const a of appointments) summary[a.status] += 1;
      return { client, summary, appointments };
    },

    /** Reenvío manual de una confirmación fallida (o de un cliente que no tenía correo). */
    async resendConfirmation(auth, id) {
      assertCan(auth, 'appointments:notify');
      if (!notifier) throw conflict('El envío de confirmaciones no está disponible', 'NOTIFICATIONS_UNAVAILABLE');
      return notifier.confirm(auth, oid.parse(id), { retry: true });
    },

    cancellationReasons: () => CANCELLATION_REASONS,
  };
}
