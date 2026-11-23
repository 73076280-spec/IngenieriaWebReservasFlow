import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApiClient, ApiError } from './client.js';

const reply = (status, body) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
afterEach(() => vi.unstubAllGlobals());

describe('Cliente HTTP · sesión (HU-15-E4, HU-04-E4, HU-14-E4)', () => {
  it('envía el token y devuelve el cuerpo en respuestas correctas', async () => {
    const fetchMock = reply(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const api = createApiClient({ baseUrl: '/api', getToken: () => 'tkn', onSessionEnd: vi.fn() });
    expect(await api('/me')).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tkn');
  });

  it('HU-15-E4 un 401 TOKEN_EXPIRED cierra la sesión y marca el error como ya notificado', async () => {
    vi.stubGlobal('fetch', reply(401, { error: 'Su sesión ha expirado. Inicie sesión nuevamente.', code: 'TOKEN_EXPIRED' }));
    const onSessionEnd = vi.fn();
    const api = createApiClient({ baseUrl: '/api', getToken: () => 'viejo', onSessionEnd });
    const err = await api('/appointments', { method: 'POST' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.sessionEnded).toBe(true);
    expect(onSessionEnd).toHaveBeenCalledWith('Su sesión ha expirado. Inicie sesión nuevamente.', 'TOKEN_EXPIRED');
  });

  it('HU-14-E4 un 403 TENANT_SUSPENDED también cierra la sesión', async () => {
    vi.stubGlobal('fetch', reply(403, { error: 'La organización se encuentra inactiva.', code: 'TENANT_SUSPENDED' }));
    const onSessionEnd = vi.fn();
    await createApiClient({ baseUrl: '/api', getToken: () => 't', onSessionEnd })('/clients').catch(() => {});
    expect(onSessionEnd).toHaveBeenCalledOnce();
  });

  it('HU-11-E3 un 403 FORBIDDEN no cierra la sesión y conserva el mensaje oficial', async () => {
    vi.stubGlobal('fetch', reply(403, { error: 'No tiene permisos para acceder a esta sección', code: 'FORBIDDEN' }));
    const onSessionEnd = vi.fn();
    const err = await createApiClient({ baseUrl: '/api', getToken: () => 't', onSessionEnd })('/dashboard').catch((e) => e);
    expect(onSessionEnd).not.toHaveBeenCalled();
    expect(err.message).toBe('No tiene permisos para acceder a esta sección');
  });

  it('HU-09-E2 conserva el código y los detalles (horario sugerido) de un 409', async () => {
    vi.stubGlobal('fetch', reply(409, { error: 'El horario seleccionado ya no está disponible. Elija otro horario.', code: 'SLOT_TAKEN', details: { suggestion: { start: 'x' } } }));
    const err = await createApiClient({ baseUrl: '/api', getToken: () => 't', onSessionEnd: vi.fn() })('/appointments').catch((e) => e);
    expect(err.code).toBe('SLOT_TAKEN');
    expect(err.details.suggestion.start).toBe('x');
  });

  it('HU-08-E3 una caída de red produce un error comprensible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await createApiClient({ baseUrl: '/api', getToken: () => 't', onSessionEnd: vi.fn() })('/appointments').catch((e) => e);
    expect(err.code).toBe('NETWORK');
    expect(err.message).toMatch(/No se pudo conectar con el servidor/);
  });
});
