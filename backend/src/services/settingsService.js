import { settingsSchema } from '../validation/schemas.js';
import { assertCan } from './policies.js';
import { notFound } from '../errors/AppError.js';

const toPublic = (t) => ({ name: t.name, code: t.slug || null, timezone: t.timezone, rescheduleMinHours: t.settings?.rescheduleMinHours ?? 2 });

/** Configuración de la organización de la sesión (plazo de reprogramación, HU-05-E3). */
export function createSettingsService({ tenants }) {
  return {
    async get(auth) {
      assertCan(auth, 'settings:manage');
      const t = await tenants.findById(auth.tenantId);
      if (!t) throw notFound();
      return toPublic(t);
    },
    async update(auth, body) {
      assertCan(auth, 'settings:manage');
      const d = settingsSchema.parse(body);
      const t = await tenants.updateSettings(auth.tenantId, d);
      if (!t) throw notFound();
      return toPublic(t);
    },
  };
}
