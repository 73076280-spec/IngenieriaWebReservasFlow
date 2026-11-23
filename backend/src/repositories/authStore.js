import mongoose from 'mongoose';
import { Tenant, User, RevokedToken, Notification } from '../models.js';

const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(String(v));

/**
 * Implementación MongoDB de las operaciones que necesita authService.
 * La misma interfaz se implementa en memoria para las pruebas de componentes.
 */
export function createMongoAuthStore() {
  return {
    async findTenantByRef(ref) {
      const value = String(ref).trim().toLowerCase();
      const or = [{ slug: value }];
      if (isObjectId(value)) or.push({ _id: value });
      return Tenant.findOne({ $or: or }).lean();
    },
    findTenantById: (id) => Tenant.findById(id).lean(),
    async slugExists(slug) {
      return Boolean(await Tenant.exists({ slug }));
    },
    findUserByEmail: (tenantId, email) => User.findOne({ tenantId, email: String(email).toLowerCase() }).lean(),
    findUserById: (tenantId, id) => (isObjectId(id) && isObjectId(tenantId) ? User.findOne({ _id: id, tenantId }).lean() : null),
    async isRevoked(jti) {
      return Boolean(await RevokedToken.exists({ jti }));
    },
    async revoke(jti, expiresAt) {
      await RevokedToken.updateOne({ jti }, { $setOnInsert: { jti, expiresAt } }, { upsert: true });
    },
    async notifyPendingAccount(tenantId, user, message) {
      await Notification.updateOne(
        { tenantId, type: 'cuenta_pendiente', userId: user._id },
        { $setOnInsert: { tenantId, type: 'cuenta_pendiente', userId: user._id, message } },
        { upsert: true },
      );
    },
    // Alta atómica de organización y primer administrador (requiere replica set / Atlas).
    async registerOrganization({ organization, slug, name, email, passwordHash }) {
      const session = await mongoose.startSession();
      let result;
      try {
        await session.withTransaction(async () => {
          const [tenant] = await Tenant.create([{ name: organization, slug }], { session });
          const [user] = await User.create([{ tenantId: tenant._id, name, email, passwordHash, role: 'admin' }], { session });
          result = { tenant: tenant.toObject(), user: user.toObject() };
        });
      } finally {
        await session.endSession();
      }
      return result;
    },
  };
}
