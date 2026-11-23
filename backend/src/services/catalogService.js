import { catalogSchemas, activeSchema, oid } from '../validation/schemas.js';
import { assertCan } from './policies.js';
import { badRequest, conflict, notFound } from '../errors/AppError.js';
import { MESSAGES } from '../errors/messages.js';

const RELATION = { clients: 'clientId', employees: 'employeeId', services: 'serviceId' };
const ACTIVE = ['programada', 'confirmada'];
const DEACTIVATABLE = ['employees', 'services'];

/** CRUD de clientes, profesionales y servicios (HU-01..03) acotado por organización. */
export function createCatalogService({ repos, now = () => Date.now() }) {
  const repoFor = (auth, kind) => repos[kind].forTenant(auth.tenantId);
  const appointmentsOf = (auth) => repos.appointments.forTenant(auth.tenantId);

  // Los servicios habilitados de un profesional deben ser de la misma organización.
  async function assertServices(auth, data) {
    const ids = [...new Set(data.serviceIds || [])];
    if (!ids.length) return;
    const found = await repos.services.forTenant(auth.tenantId).countDocuments({ _id: { $in: ids } });
    if (found !== ids.length) throw badRequest(MESSAGES.INVALID_SERVICES, 'VALIDATION');
  }

  async function assertNotLinked(auth, kind, _id) {
    if (kind === 'services' || !repos.users) return;
    if (await repos.users.forTenant(auth.tenantId).exists({ [RELATION[kind]]: _id })) throw conflict(MESSAGES.LINKED_ACCOUNT, 'LINKED_ACCOUNT');
  }

  // Integridad histórica: nunca se borran registros con citas (HU-01-E2, HU-01-E4, HU-02-E4, HU-03-E4).
  async function assertDeletable(auth, kind, _id) {
    const appointments = appointmentsOf(auth);
    const field = RELATION[kind];
    if (kind === 'clients') {
      const pending = await appointments.countDocuments({ clientId: _id, status: { $in: ACTIVE } });
      if (pending) throw conflict(MESSAGES.CLIENT_HAS_ACTIVE, 'HAS_ACTIVE_APPOINTMENTS', { count: pending });
      if (await appointments.exists({ clientId: _id })) throw conflict(MESSAGES.CLIENT_HAS_HISTORY, 'HAS_HISTORY');
      return;
    }
    const total = await appointments.countDocuments({ [field]: _id });
    if (!total) return;
    const future = await appointments.countDocuments({ [field]: _id, status: { $in: ACTIVE }, start: { $gte: new Date(now()) } });
    const message = kind === 'services' ? MESSAGES.SERVICE_HAS_APPOINTMENTS : MESSAGES.EMPLOYEE_HAS_APPOINTMENTS;
    throw conflict(message, 'HAS_APPOINTMENTS', { count: total, future, suggestion: 'deactivate' });
  }

  return {
    kinds: Object.keys(RELATION),
    async list(auth, kind) {
      assertCan(auth, `${kind}:read`);
      return repoFor(auth, kind).find().sort({ createdAt: -1 }).lean();
    },
    async create(auth, kind, body) {
      assertCan(auth, `${kind}:write`);
      const data = catalogSchemas[kind].parse(body);
      if (kind === 'employees') await assertServices(auth, data);
      return repoFor(auth, kind).create(data);
    },
    async update(auth, kind, id, body) {
      assertCan(auth, `${kind}:write`);
      const _id = oid.parse(id);
      const data = catalogSchemas[kind].parse(body);
      if (kind === 'employees') await assertServices(auth, data);
      const doc = await repoFor(auth, kind).updateById(_id, data);
      if (!doc) throw notFound();
      return doc;
    },
    /** Activar o desactivar profesionales y servicios (HU-02-E4, HU-03-E4). */
    async setActive(auth, kind, id, body) {
      if (!DEACTIVATABLE.includes(kind)) throw notFound();
      assertCan(auth, `${kind}:write`);
      const _id = oid.parse(id);
      const { active } = activeSchema.parse(body);
      const repo = repoFor(auth, kind);
      if (!(await repo.exists({ _id }))) throw notFound();
      // Un profesional con citas pendientes no se desactiva: primero hay que reasignarlas.
      if (kind === 'employees' && !active) {
        const future = await appointmentsOf(auth).countDocuments({ employeeId: _id, status: { $in: ACTIVE }, start: { $gte: new Date(now()) } });
        if (future) throw conflict(MESSAGES.EMPLOYEE_HAS_FUTURE, 'HAS_FUTURE_APPOINTMENTS', { count: future });
      }
      return repo.updateById(_id, { active });
    },
    async remove(auth, kind, id) {
      assertCan(auth, `${kind}:delete`);
      const _id = oid.parse(id);
      if (!(await repoFor(auth, kind).exists({ _id }))) throw notFound();
      await assertDeletable(auth, kind, _id);
      await assertNotLinked(auth, kind, _id);
      const doc = await repoFor(auth, kind).deleteById(_id);
      if (!doc) throw notFound();
    },
  };
}
