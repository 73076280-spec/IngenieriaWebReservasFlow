import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildTestApp, PASSWORD, TEST_SECRET } from '../helpers/buildTestApp.js';
import { MESSAGES } from '../../src/errors/messages.js';

let ctx;
beforeEach(() => { ctx = buildTestApp(); });

const login = (email, organization = 'sonrisa-real', password = PASSWORD) =>
  request(ctx.app).post('/api/auth/login').send({ organization, email, password });
const tokenOf = async (email, organization) => (await login(email, organization)).body.token;
const bearer = (t) => ({ Authorization: 'Bearer ' + t });

describe('HU-15 · Autenticación segura', () => {
  it.each([
    ['admin', 'admin@sonrisa.test'],
    ['recepcionista', 'recepcion@sonrisa.test'],
    ['profesional', 'pro@sonrisa.test'],
    ['cliente', 'cliente@sonrisa.test'],
  ])('HU-15-E1 inicio de sesión exitoso con rol %s: JWT válido y rol en la respuesta', async (role, email) => {
    const res = await login(email);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(role);
    const payload = jwt.verify(res.body.token, TEST_SECRET, { algorithms: ['HS256'] });
    expect(payload).toMatchObject({ sub: String(ctx.users[role]._id), tid: String(ctx.orgA._id) });
    expect(payload.jti).toBeTruthy();
    expect(payload.exp - payload.iat).toBe(8 * 3600);
    const me = await request(ctx.app).get('/api/me').set(bearer(res.body.token));
    expect(me.status).toBe(200);
    expect(me.body.role).toBe(role);
  });

  it('HU-15-E1 permite iniciar sesión con el ID heredado de la organización', async () => {
    const res = await login('admin@sonrisa.test', String(ctx.orgA._id));
    expect(res.status).toBe(200);
  });

  it('HU-15-E3 contraseña incorrecta, correo inexistente y organización inexistente responden igual', async () => {
    const wrongPass = await login('admin@sonrisa.test', 'sonrisa-real', 'otra-clave-123');
    const wrongEmail = await login('nadie@sonrisa.test');
    const wrongOrg = await login('admin@sonrisa.test', 'no-existe');
    for (const res of [wrongPass, wrongEmail, wrongOrg]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: MESSAGES.INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' });
      expect(res.body.token).toBeUndefined();
    }
    expect(MESSAGES.INVALID_CREDENTIALS).toBe('Las credenciales ingresadas no son válidas');
  });

  it('HU-15-E3 un usuario de otra organización no entra con el código de otra', async () => {
    const res = await login('admin@urbano.test', 'sonrisa-real');
    expect(res.status).toBe(401);
  });

  it('HU-15-E2 cerrar sesión invalida el token actual en el servidor', async () => {
    const token = await tokenOf('recepcion@sonrisa.test');
    const other = await tokenOf('recepcion@sonrisa.test');
    const out = await request(ctx.app).post('/api/auth/logout').set(bearer(token));
    expect(out.status).toBe(204);
    const reuse = await request(ctx.app).get('/api/me').set(bearer(token));
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('SESSION_REVOKED');
    // Solo se invalida la sesión cerrada, no las demás del mismo usuario.
    expect((await request(ctx.app).get('/api/me').set(bearer(other))).status).toBe(200);
  });

  it('HU-15-E4 / HU-04-E4 token expirado al registrar una cita: 401 TOKEN_EXPIRED y no se crea la cita', async () => {
    const u = ctx.users.recepcionista;
    const expired = jwt.sign({ sub: String(u._id), tid: String(u.tenantId), exp: Math.floor(Date.now() / 1000) - 60 }, TEST_SECRET, { algorithm: 'HS256', jwtid: 'x1' });
    const res = await request(ctx.app).post('/api/appointments').set(bearer(expired)).send({ clientId: 'a'.repeat(24), employeeId: 'b'.repeat(24), serviceId: 'c'.repeat(24), start: new Date().toISOString() });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: MESSAGES.TOKEN_EXPIRED, code: 'TOKEN_EXPIRED' });
    expect(ctx.services.appointments.create).not.toHaveBeenCalled();
  });

  it.each([
    ['sin token', 'SESSION_REQUIRED', null],
    ['con firma alterada', 'SESSION_INVALID', 'tampered'],
    ['con algoritmo none', 'SESSION_INVALID', 'none'],
    ['con token sin jti (emitido por la versión anterior)', 'SESSION_INVALID', 'nojti'],
  ])('rechaza peticiones %s con 401 %s', async (_label, code, kind) => {
    const u = ctx.users.admin;
    const claims = { sub: String(u._id), tid: String(u.tenantId) };
    const tokens = {
      tampered: jwt.sign(claims, 'otro-secreto-de-al-menos-treinta-y-dos-caracteres', { jwtid: 'j' }),
      none: jwt.sign(claims, null, { algorithm: 'none', jwtid: 'j' }),
      nojti: jwt.sign(claims, TEST_SECRET),
    };
    const req = request(ctx.app).get('/api/clients');
    const res = kind ? await req.set(bearer(tokens[kind])) : await req;
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(code);
    expect(ctx.services.catalog.list).not.toHaveBeenCalled();
  });
});

describe('HU-14-E4 · Organización suspendida', () => {
  it('bloquea el inicio de sesión con el mensaje de organización inactiva', async () => {
    ctx.orgA.status = 'suspendida';
    const res = await login('admin@sonrisa.test');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: MESSAGES.TENANT_SUSPENDED, code: 'TENANT_SUSPENDED' });
    expect(res.body.token).toBeUndefined();
  });

  it('bloquea un token emitido antes de la suspensión y no ejecuta la operación', async () => {
    const token = await tokenOf('recepcion@sonrisa.test');
    ctx.orgA.status = 'suspendida';
    const res = await request(ctx.app).post('/api/clients').set(bearer(token)).send({ name: 'Juan Pérez' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_SUSPENDED');
    expect(ctx.services.catalog.create).not.toHaveBeenCalled();
  });

  it('no afecta a otras organizaciones activas', async () => {
    ctx.orgA.status = 'suspendida';
    expect((await login('admin@urbano.test', 'estilo-urbano')).status).toBe(200);
  });

  it('con credenciales incorrectas no revela que la organización está suspendida', async () => {
    ctx.orgA.status = 'suspendida';
    const res = await login('admin@sonrisa.test', 'sonrisa-real', 'incorrecta-123');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('HU-11 · Control de acceso por roles', () => {
  it('HU-11-E3 un cliente no accede al panel de indicadores', async () => {
    const res = await request(ctx.app).get('/api/dashboard').set(bearer(await tokenOf('cliente@sonrisa.test')));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'No tiene permisos para acceder a esta sección', code: 'FORBIDDEN' });
    expect(ctx.services.dashboard.summary).not.toHaveBeenCalled();
  });

  it('HU-11-E1 recepcionista: gestiona clientes y citas, sin panel ni gestión de profesionales/servicios', async () => {
    const t = await tokenOf('recepcion@sonrisa.test');
    const allowed = [
      request(ctx.app).get('/api/clients').set(bearer(t)),
      request(ctx.app).post('/api/clients').set(bearer(t)).send({ name: 'Ana' }),
      request(ctx.app).get('/api/appointments').set(bearer(t)),
      request(ctx.app).post('/api/appointments').set(bearer(t)).send({}),
      // HU-01: "Como recepcionista, quiero registrar, editar y eliminar los datos de mis clientes".
      request(ctx.app).delete('/api/clients/' + 'a'.repeat(24)).set(bearer(t)),
    ];
    for (const res of await Promise.all(allowed)) expect(res.status, res.req.path).toBeLessThan(400);
    const denied = [
      request(ctx.app).get('/api/dashboard').set(bearer(t)),
      request(ctx.app).post('/api/services').set(bearer(t)).send({ name: 'X', duration: 30, price: 1 }),
      request(ctx.app).post('/api/employees').set(bearer(t)).send({ name: 'X' }),
      request(ctx.app).patch('/api/services/' + 'a'.repeat(24) + '/status').set(bearer(t)).send({ active: false }),
      request(ctx.app).get('/api/users').set(bearer(t)),
      request(ctx.app).get('/api/settings').set(bearer(t)),
    ];
    for (const res of await Promise.all(denied)) {
      expect(res.status, res.req.path).toBe(403);
      expect(res.body.error).toBe(MESSAGES.FORBIDDEN);
    }
    expect(ctx.services.dashboard.summary).not.toHaveBeenCalled();
    expect(ctx.services.users.list).not.toHaveBeenCalled();
  });

  it('HU-11-E1 /api/me devuelve los permisos efectivos de recepción', async () => {
    const me = await request(ctx.app).get('/api/me').set(bearer(await tokenOf('recepcion@sonrisa.test')));
    expect(me.body.permissions).toEqual(expect.arrayContaining(['clients:write', 'appointments:create']));
    expect(me.body.permissions).not.toContain('dashboard:read');
  });

  it('HU-11-E2 el cambio de rol se aplica en la siguiente petición de la sesión activa', async () => {
    const t = await tokenOf('recepcion@sonrisa.test');
    expect((await request(ctx.app).get('/api/clients').set(bearer(t))).status).toBe(200);
    ctx.users.recepcionista.role = 'profesional'; // efecto de PATCH /api/users/:id/role
    const res = await request(ctx.app).get('/api/clients').set(bearer(t));
    expect(res.status).toBe(403);
    const me = await request(ctx.app).get('/api/me').set(bearer(t));
    expect(me.body.role).toBe('profesional');
    expect(me.body.permissions).not.toContain('clients:write');
  });

  it('HU-11-E4 cuenta sin rol: no inicia sesión y se avisa a los administradores una sola vez', async () => {
    ctx.store.addUser(ctx.orgA, { email: 'nuevo@sonrisa.test', role: null, password: PASSWORD });
    const first = await login('nuevo@sonrisa.test');
    const second = await login('nuevo@sonrisa.test');
    for (const res of [first, second]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: MESSAGES.ACCOUNT_PENDING, code: 'ACCOUNT_PENDING' });
      expect(res.body.token).toBeUndefined();
    }
    expect(ctx.store.notifications).toHaveLength(1);
    expect(ctx.store.notifications[0]).toMatchObject({ tenantId: String(ctx.orgA._id), type: 'cuenta_pendiente' });
  });

  it('HU-11-E4 una sesión activa cuyo rol se retira queda bloqueada', async () => {
    const t = await tokenOf('pro@sonrisa.test');
    ctx.users.profesional.role = null;
    const res = await request(ctx.app).get('/api/appointments').set(bearer(t));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_PENDING');
  });

  it('solo el administrador accede a cuentas y avisos', async () => {
    const admin = await tokenOf('admin@sonrisa.test');
    expect((await request(ctx.app).get('/api/users').set(bearer(admin))).status).toBe(200);
    expect((await request(ctx.app).get('/api/notifications').set(bearer(admin))).status).toBe(200);
    const pro = await tokenOf('pro@sonrisa.test');
    expect((await request(ctx.app).get('/api/notifications').set(bearer(pro))).status).toBe(403);
  });
});

describe('Validación de entrada en autenticación', () => {
  it('rechaza campos no previstos en el login (objeto estricto)', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ organization: 'sonrisa-real', email: 'admin@sonrisa.test', password: PASSWORD, role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });
  it('responde 400 ante JSON malformado sin exponer detalles internos', async () => {
    const res = await request(ctx.app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });
});
