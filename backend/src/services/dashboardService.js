import { AppError } from '../errors/AppError.js';
import { MESSAGES, CANCELLATION_REASONS } from '../errors/messages.js';
import { dashboardQuerySchema } from '../validation/schemas.js';
import { assertCan } from './policies.js';
import { DEFAULT_TZ, monthStart, nextMonthStart, zonedToUtc } from '../utils/time.js';

const MONTHS_BACK = { mes: 0, trimestre: 2, anio: 11 };
const STATUSES = ['programada', 'confirmada', 'completada', 'cancelada', 'no_asistio'];

/** Rango [from, to) del periodo en la zona horaria de la organización. */
export function periodRange(period, nowMs = Date.now(), tz = DEFAULT_TZ) {
  const current = monthStart(new Date(nowMs), tz, 0);
  const fromStr = monthStart(new Date(nowMs), tz, MONTHS_BACK[period]);
  return { from: zonedToUtc(fromStr, 0, tz), to: zonedToUtc(nextMonthStart(current), 0, tz) };
}

// Nombre del documento relacionado sin salir de la organización (defensa en profundidad).
const lookupInTenant = (from, tenantId, as) => ({
  $lookup: {
    from,
    let: { ref: '$_id' },
    pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$_id', '$$ref'] }, { $eq: ['$tenantId', tenantId] }] } } }, { $project: { name: 1 } }],
    as,
  },
});

/** Indicadores por periodo (HU-13), exclusivos del administrador (HU-11-E1/E3). */
export function createDashboardService({ repos, now = () => Date.now(), logger = console }) {
  return {
    async summary(auth, query = {}) {
      assertCan(auth, 'dashboard:read');
      const { period } = dashboardQuerySchema.parse(query);
      const tz = auth.tenant?.timezone || DEFAULT_TZ;
      const { from, to } = periodRange(period, now(), tz);
      const appointments = repos.appointments.forTenant(auth.tenantId);
      const tid = appointments.tenantId;
      const inPeriod = { start: { $gte: from, $lt: to } };
      const notCancelled = { ...inPeriod, status: { $ne: 'cancelada' } };
      let byStatus, services, clients, reasons, everCount;
      try {
        // Todas las consultas o ninguna: un fallo no deja indicadores incompletos (HU-13-E3).
        [byStatus, services, clients, reasons, everCount] = await Promise.all([
          appointments.aggregate([{ $match: inPeriod }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
          appointments.aggregate([
            { $match: notCancelled }, { $group: { _id: '$serviceId', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 5 },
            lookupInTenant('services', tid, 'service'),
          ]),
          appointments.aggregate([
            { $match: notCancelled }, { $group: { _id: '$clientId', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 3 },
            lookupInTenant('clients', tid, 'client'),
          ]),
          appointments.aggregate([{ $match: { ...inPeriod, status: 'cancelada' } }, { $group: { _id: '$cancellationReason', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
          appointments.countDocuments(),
        ]);
      } catch (err) {
        if (err instanceof AppError) throw err;
        logger.error?.(err);
        throw new AppError(503, 'DASHBOARD_UNAVAILABLE');
      }
      const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
      for (const row of byStatus) if (row._id in counts) counts[row._id] = row.count;
      const total = STATUSES.reduce((n, s) => n + counts[s], 0);
      const topServices = services.map((x) => ({ _id: x._id, name: x.service[0]?.name || 'Servicio eliminado', count: x.count }));
      let message = null;
      if (everCount === 0) message = MESSAGES.DASHBOARD_WELCOME;
      else if (total === 0) message = MESSAGES.DASHBOARD_EMPTY_PERIOD;
      return {
        period,
        range: { from, to },
        total,
        byStatus: counts,
        scheduled: counts.programada + counts.confirmada,
        attended: counts.completada,
        topService: topServices[0] || null,
        topServices,
        topClients: clients.map((x) => ({ _id: x._id, name: x.client[0]?.name || 'Cliente eliminado', count: x.count })),
        cancellationsByReason: reasons.map((x) => ({ reason: x._id || 'sin_motivo', label: CANCELLATION_REASONS[x._id] || 'Sin motivo registrado', count: x.count })),
        hasAppointments: everCount > 0,
        message,
      };
    },
  };
}
