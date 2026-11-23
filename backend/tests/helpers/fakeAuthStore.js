import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const oid = () => randomBytes(12).toString('hex');

/** Implementación en memoria de la interfaz de authStore, solo para pruebas. */
export function createFakeAuthStore() {
  const tenants = new Map();
  const users = new Map();
  const revoked = new Map();
  const notifications = [];

  const store = {
    tenants, users, revoked, notifications,
    async findTenantByRef(ref) {
      const v = String(ref).trim().toLowerCase();
      return [...tenants.values()].find((t) => t.slug === v || String(t._id) === v) ?? null;
    },
    async findTenantById(id) { return tenants.get(String(id)) ?? null; },
    async slugExists(slug) { return [...tenants.values()].some((t) => t.slug === slug); },
    async findUserByEmail(tenantId, email) {
      return [...users.values()].find((u) => String(u.tenantId) === String(tenantId) && u.email === String(email).toLowerCase()) ?? null;
    },
    async findUserById(tenantId, id) {
      const u = users.get(String(id));
      return u && String(u.tenantId) === String(tenantId) ? u : null;
    },
    async isRevoked(jti) { return revoked.has(jti); },
    async revoke(jti, expiresAt) { revoked.set(jti, expiresAt); },
    async notifyPendingAccount(tenantId, user, message) {
      if (!notifications.some((n) => String(n.tenantId) === String(tenantId) && n.userId === user._id && n.type === 'cuenta_pendiente')) {
        notifications.push({ tenantId: String(tenantId), type: 'cuenta_pendiente', userId: user._id, message, read: false });
      }
    },
    async registerOrganization({ organization, slug, name, email, passwordHash }) {
      const tenant = store.addTenant({ name: organization, slug });
      const user = { _id: oid(), tenantId: tenant._id, name, email, passwordHash, role: 'admin' };
      users.set(user._id, user);
      return { tenant, user };
    },

    // Utilidades de siembra
    addTenant({ name = 'Org', slug, status = 'activa' } = {}) {
      const t = { _id: oid(), name, slug: slug ?? name.toLowerCase().replace(/\W+/g, '-'), status, timezone: 'America/Lima' };
      tenants.set(t._id, t);
      return t;
    },
    addUser(tenant, { email, password = 'Secreta-123', role = 'admin', name = 'Usuario', employeeId } = {}) {
      const u = { _id: oid(), tenantId: tenant._id, name, email: email.toLowerCase(), passwordHash: bcrypt.hashSync(password, 4), role, employeeId };
      users.set(u._id, u);
      return u;
    },
  };
  return store;
}
