import bcrypt from 'bcryptjs';
import { badRequest, conflict, notFound } from '../errors/AppError.js';
import { MESSAGES } from '../errors/messages.js';
import { createUserSchema, changeRoleSchema, oid } from '../validation/schemas.js';
import { assertCan } from './policies.js';

const PUBLIC_FIELDS = 'name email role employeeId clientId createdAt updatedAt';
const toPublic = (u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role ?? null, employeeId: u.employeeId ?? null, clientId: u.clientId ?? null, createdAt: u.createdAt, updatedAt: u.updatedAt });

/** Cuentas de colaboradores y clientes, y sus roles (HU-11-E1, E2, E4; portal del cliente). */
export function createUserService({ repos, bcryptRounds = 12 }) {
  async function assertEmployee(auth, employeeId) {
    if (employeeId && !(await repos.employees.forTenant(auth.tenantId).exists({ _id: employeeId }))) {
      throw badRequest('El profesional indicado no pertenece a la organización');
    }
  }

  /**
   * Ficha de cliente para una cuenta con rol cliente: la indicada (de la organización),
   * o la ficha existente con el mismo correo, o una nueva con su nombre y correo.
   */
  async function resolveClientProfile(auth, { clientId, name, email }) {
    const clients = repos.clients.forTenant(auth.tenantId);
    if (clientId) {
      if (!(await clients.exists({ _id: clientId }))) throw badRequest('El cliente indicado no pertenece a la organización');
      return clientId;
    }
    const existing = await clients.findOne({ email }).lean();
    if (existing) return existing._id;
    return (await clients.create({ name, email }))._id;
  }

  return {
    async list(auth) {
      assertCan(auth, 'users:manage');
      return repos.users.forTenant(auth.tenantId).find({}, PUBLIC_FIELDS).sort({ createdAt: -1 }).lean();
    },

    // role ausente o null => cuenta pendiente de configuración (HU-11-E4).
    async create(auth, body) {
      assertCan(auth, 'users:manage');
      const d = createUserSchema.parse(body);
      await assertEmployee(auth, d.employeeId);
      const users = repos.users.forTenant(auth.tenantId);
      const email = d.email.toLowerCase();
      if (await users.exists({ email })) throw conflict(MESSAGES.EMAIL_TAKEN, 'EMAIL_TAKEN');
      const clientId = d.role === 'cliente' ? await resolveClientProfile(auth, { clientId: d.clientId, name: d.name, email }) : undefined;
      const user = await users.create({
        name: d.name,
        email,
        passwordHash: await bcrypt.hash(d.password, bcryptRounds),
        role: d.role ?? null,
        ...(d.employeeId ? { employeeId: d.employeeId } : {}),
        ...(clientId ? { clientId } : {}),
      });
      return toPublic(user);
    },

    // El cambio se aplica en la siguiente petición: la sesión relee el rol en cada solicitud (HU-11-E2).
    async changeRole(auth, id, body) {
      assertCan(auth, 'users:manage');
      const _id = oid.parse(id);
      const d = changeRoleSchema.parse(body);
      if (String(_id) === String(auth.id) && d.role !== 'admin') throw badRequest(MESSAGES.SELF_DEMOTION, 'SELF_DEMOTION');
      await assertEmployee(auth, d.employeeId);
      const users = repos.users.forTenant(auth.tenantId);
      const current = await users.findById(_id).lean();
      if (!current) throw notFound();
      const update = { role: d.role };
      if (d.employeeId !== undefined) update.employeeId = d.employeeId;
      if (d.role === 'cliente' && (d.clientId || !current.clientId)) {
        update.clientId = await resolveClientProfile(auth, { clientId: d.clientId, name: current.name, email: current.email });
      }
      const user = await users.updateById(_id, update);
      if (!user) throw notFound();
      // La cuenta ya está configurada: se marcan como leídos sus avisos pendientes (no se borran).
      await repos.notifications.forTenant(auth.tenantId).updateMany({ type: 'cuenta_pendiente', userId: _id }, { read: true });
      return toPublic(user);
    },

    async notifications(auth) {
      assertCan(auth, 'notifications:read');
      return repos.notifications.forTenant(auth.tenantId).find({ read: false }).sort({ createdAt: -1 }).lean();
    },
  };
}
