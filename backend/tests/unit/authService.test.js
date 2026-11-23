import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { createAuthService, slugify } from '../../src/services/authService.js';
import { createFakeAuthStore } from '../helpers/fakeAuthStore.js';
import { TEST_SECRET } from '../helpers/buildTestApp.js';
import { loadConfig } from '../../src/config/env.js';

const build = () => {
  const store = createFakeAuthStore();
  return { store, auth: createAuthService({ store, jwtSecret: TEST_SECRET, bcryptRounds: 4 }) };
};

describe('authService', () => {
  it('el registro crea la organización con un código legible y un administrador', async () => {
    const { auth, store } = build();
    const res = await auth.register({ organization: 'Clínica Dental Sonrisa Real', name: 'Ana', email: 'Ana@Sonrisa.test', password: 'Secreta-1234' });
    expect(res.organizationCode).toBe('clinica-dental-sonrisa-real');
    expect(res.user.role).toBe('admin');
    const ctx = await auth.verify(res.token);
    expect(ctx.tenant.code).toBe('clinica-dental-sonrisa-real');
    expect([...store.users.values()][0].email).toBe('ana@sonrisa.test');
  });

  it('genera un código distinto si el nombre de organización ya existe', async () => {
    const { auth } = build();
    const a = await auth.register({ organization: 'Taller RapiFix', name: 'Ana', email: 'a@x.test', password: 'Secreta-1234' });
    const b = await auth.register({ organization: 'Taller RapiFix', name: 'Beto', email: 'b@x.test', password: 'Secreta-1234' });
    expect(a.organizationCode).toBe('taller-rapifix');
    expect(b.organizationCode).toMatch(/^taller-rapifix-[a-f0-9]{4}$/);
  });

  it('slugify elimina tildes y caracteres especiales', () => {
    expect(slugify('Barbería Estilo Urbano!')).toBe('barberia-estilo-urbano');
    expect(slugify('***')).toBe('org');
  });

  it('HU-15-E2 logout guarda el jti hasta la expiración del token', async () => {
    const { auth, store } = build();
    const t = store.addTenant({ name: 'Org' });
    store.addUser(t, { email: 'a@x.test' });
    const { token } = await auth.login({ organization: t.slug, email: 'a@x.test', password: 'Secreta-123' });
    const session = await auth.verify(token);
    await auth.logout(session);
    const payload = jwt.decode(token);
    expect(store.revoked.get(payload.jti).getTime()).toBe(payload.exp * 1000);
    await expect(auth.verify(token)).rejects.toMatchObject({ status: 401, code: 'SESSION_REVOKED' });
  });

  it('un token de un usuario de otra organización no es válido aunque esté bien firmado', async () => {
    const { auth, store } = build();
    const a = store.addTenant({ name: 'A' });
    const b = store.addTenant({ name: 'B' });
    const u = store.addUser(a, { email: 'a@x.test' });
    const forged = jwt.sign({ sub: String(u._id), tid: String(b._id) }, TEST_SECRET, { jwtid: 'z' });
    await expect(auth.verify(forged)).rejects.toMatchObject({ status: 401, code: 'SESSION_INVALID' });
  });

  it('exige un JWT_SECRET de al menos 32 caracteres', () => {
    expect(() => createAuthService({ store: createFakeAuthStore(), jwtSecret: 'corto' })).toThrow();
    expect(() => loadConfig({ JWT_SECRET: 'corto' })).toThrow();
    expect(loadConfig({ JWT_SECRET: TEST_SECRET, CLIENT_ORIGIN: 'http://a, http://b' }).clientOrigins).toEqual(['http://a', 'http://b']);
  });
});
