// Cliente HTTP único de la interfaz. Centraliza la cabecera Authorization y el
// tratamiento de sesiones vencidas, revocadas o bloqueadas (HU-15-E4, HU-04-E4, HU-14-E4).
const SESSION_END_CODES = new Set(['SESSION_REQUIRED', 'TOKEN_EXPIRED', 'SESSION_INVALID', 'SESSION_REVOKED', 'TENANT_SUSPENDED', 'ACCOUNT_PENDING']);

export class ApiError extends Error {
  constructor(message, { status, code, details, sessionEnded = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    // true cuando ya se cerró la sesión y se avisó al usuario: el llamador no debe repetir el aviso.
    this.sessionEnded = sessionEnded;
  }
}

export function createApiClient({ baseUrl, getToken, onSessionEnd }) {
  return async function api(path, options = {}) {
    const token = getToken();
    let res;
    try {
      res = await fetch(baseUrl + path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers },
      });
    } catch {
      throw new ApiError('No se pudo conectar con el servidor. Verifique su conexión e intente nuevamente.', { status: 0, code: 'NETWORK' });
    }
    const body = res.status === 204 ? null : await res.json().catch(() => ({ error: 'Respuesta no válida del servidor' }));
    if (res.ok) return body;
    const code = body?.code;
    const message = body?.error || 'Error al conectar';
    // Toda respuesta 401 cierra la sesión; las 403 solo si se deben a la organización o a la cuenta.
    if (token && (res.status === 401 || SESSION_END_CODES.has(code))) {
      onSessionEnd(message, code);
      throw new ApiError(message, { status: res.status, code, sessionEnded: true });
    }
    // details: datos seguros del servidor, p. ej. el horario sugerido ante un conflicto (HU-09-E2).
    throw new ApiError(message, { status: res.status, code, details: body?.details });
  };
}

/** Login y registro: no llevan token ni disparan el cierre de sesión. */
export async function publicPost(baseUrl, path, data) {
  let res;
  try {
    res = await fetch(baseUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.', { status: 0, code: 'NETWORK' });
  }
  const body = await res.json().catch(() => ({ error: 'Respuesta no válida del servidor' }));
  if (!res.ok) throw new ApiError(body?.error || 'Error', { status: res.status, code: body?.code, details: body?.details });
  return body;
}
