import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppError, unauthorized, forbidden } from '../errors/AppError.js';

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export function slugify(text) {
  const base = String(text)
    .normalize('NFD').replace(COMBINING_MARKS, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'org';
}

/**
 * Autenticación y sesiones (HU-15), bloqueo de organizaciones suspendidas (HU-14-E4)
 * y cuentas sin rol (HU-11-E4). Las dependencias se inyectan para poder probarlo sin base.
 */
export function createAuthService({ store, jwtSecret, jwtExpiresIn = '8h', bcryptRounds = 12 }) {
  if (!store) throw new Error('authService requiere un store');
  if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET inválido');
  // Hash ficticio para que un correo inexistente tarde lo mismo que una contraseña incorrecta (HU-15-E3).
  const dummyHash = bcrypt.hashSync(randomBytes(16).toString('hex'), bcryptRounds);

  const sign = (user) =>
    jwt.sign({ sub: String(user._id), tid: String(user.tenantId) }, jwtSecret, {
      expiresIn: jwtExpiresIn,
      algorithm: 'HS256',
      jwtid: randomUUID(),
    });

  async function uniqueSlug(organization) {
    const base = slugify(organization);
    if (!(await store.slugExists(base))) return base;
    for (let i = 0; i < 5; i++) {
      const candidate = `${base}-${randomBytes(2).toString('hex')}`;
      if (!(await store.slugExists(candidate))) return candidate;
    }
    throw new AppError(409, 'CONFLICT', 'No se pudo generar un código de organización único; intente nuevamente');
  }

  return {
    async register({ organization, name, email, password }) {
      const slug = await uniqueSlug(organization);
      const passwordHash = await bcrypt.hash(password, bcryptRounds);
      const { tenant, user } = await store.registerOrganization({ organization, slug, name, email: email.toLowerCase(), passwordHash });
      return {
        token: sign(user),
        user: { name: user.name, role: user.role },
        organization: tenant.name,
        organizationId: String(tenant._id),
        organizationCode: tenant.slug,
      };
    },

    async login({ organization, email, password }) {
      const tenant = await store.findTenantByRef(organization);
      const user = tenant ? await store.findUserByEmail(tenant._id, email) : null;
      const ok = await bcrypt.compare(password, user?.passwordHash || dummyHash);
      // Mismo código y mensaje si falla la organización, el correo o la contraseña.
      if (!tenant || !user || !ok) throw unauthorized('INVALID_CREDENTIALS');
      if (tenant.status === 'suspendida') throw forbidden('TENANT_SUSPENDED');
      if (!user.role) {
        await store.notifyPendingAccount(tenant._id, user, `La cuenta ${user.email} intentó iniciar sesión y no tiene un rol asignado.`);
        throw forbidden('ACCOUNT_PENDING');
      }
      return {
        token: sign(user),
        user: { name: user.name, role: user.role },
        organizationId: String(tenant._id),
        organizationCode: tenant.slug || null,
      };
    },

    /** Valida el token y el estado actual de usuario y organización en cada petición. */
    async verify(token) {
      if (!token) throw unauthorized('SESSION_REQUIRED');
      let payload;
      try {
        payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      } catch (err) {
        throw unauthorized(err?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'SESSION_INVALID');
      }
      if (!payload.jti || !payload.sub || !payload.tid) throw unauthorized('SESSION_INVALID');
      if (await store.isRevoked(payload.jti)) throw unauthorized('SESSION_REVOKED');
      const [user, tenant] = await Promise.all([store.findUserById(payload.tid, payload.sub), store.findTenantById(payload.tid)]);
      if (!user || !tenant) throw unauthorized('SESSION_INVALID');
      if (tenant.status === 'suspendida') throw forbidden('TENANT_SUSPENDED');
      if (!user.role) throw forbidden('ACCOUNT_PENDING');
      return {
        id: String(user._id),
        tenantId: String(user.tenantId),
        role: user.role,
        employeeId: user.employeeId ? String(user.employeeId) : null,
        clientId: user.clientId ? String(user.clientId) : null,
        name: user.name,
        jti: payload.jti,
        exp: payload.exp,
        tenant: {
          id: String(tenant._id),
          name: tenant.name,
          timezone: tenant.timezone || 'America/Lima',
          code: tenant.slug || null,
          settings: { rescheduleMinHours: tenant.settings?.rescheduleMinHours ?? 2 },
        },
      };
    },

    /** Invalida el token actual hasta su expiración natural (HU-15-E2). */
    async logout(auth) {
      await store.revoke(auth.jti, new Date(auth.exp * 1000));
    },
  };
}
