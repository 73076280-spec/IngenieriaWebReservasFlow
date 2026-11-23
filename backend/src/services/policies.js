import { forbidden, notFound } from '../errors/AppError.js';

/**
 * Política única de permisos por rol (HU-11). Toda ruta protegida declara el
 * permiso que necesita; los servicios usan las mismas funciones para reglas
 * de propiedad. El frontend usa los permisos efectivos de GET /api/me.
 */
const ALL = ['admin', 'recepcionista', 'profesional', 'cliente'];
const STAFF = ['admin', 'recepcionista'];
export const PERMISSIONS = Object.freeze({
  'clients:read': STAFF,
  'clients:write': STAFF,
  'clients:delete': STAFF, // HU-01: la recepcionista registra, edita y elimina clientes
  'employees:read': ALL,
  'employees:write': ['admin'], // HU-02: el administrador gestiona profesionales
  'employees:delete': ['admin'],
  'services:read': ALL,
  'services:write': ['admin'], // HU-03: el administrador gestiona servicios
  'services:delete': ['admin'],
  'availability:read': ALL, // HU-07
  'appointments:read': ALL, // el cliente y el profesional solo ven las suyas (appointmentScope)
  'appointments:create': [...STAFF, 'cliente'], // HU-04: el cliente reserva para sí mismo
  'appointments:status': ALL, // estados permitidos por rol: allowedStatuses
  'appointments:reschedule': [...STAFF, 'cliente'], // HU-05
  'appointments:notify': STAFF, // HU-04-E1: reenviar una confirmación fallida
  'dashboard:read': ['admin'], // HU-11-E1: recepción sin acceso al panel
  'settings:manage': ['admin'],
  'users:manage': ['admin'],
  'notifications:read': ['admin'],
});

export function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error('Permiso no definido: ' + permission);
  return Boolean(role) && allowed.includes(role);
}

export function assertCan(auth, permission) {
  if (!can(auth?.role, permission)) throw forbidden();
}

/** Estados que un profesional puede asignar a sus propias citas. */
export const PROFESSIONAL_STATUSES = ['confirmada', 'completada', 'no_asistio'];
/** El cliente solo puede cancelar sus propias citas. */
export const CLIENT_STATUSES = ['cancelada'];

/** Estados que puede asignar cada rol; null = todos. */
export function allowedStatuses(role) {
  if (role === 'profesional') return PROFESSIONAL_STATUSES;
  if (role === 'cliente') return CLIENT_STATUSES;
  return null;
}

/**
 * Filtro de propiedad sobre citas: el profesional solo ve las asignadas a su perfil
 * y el cliente solo las de su ficha. null = sin acceso a ninguna.
 */
export function appointmentScope(auth) {
  if (auth.role === 'profesional') return auth.employeeId ? { employeeId: auth.employeeId } : null;
  if (auth.role === 'cliente') return auth.clientId ? { clientId: auth.clientId } : null;
  return {};
}

const idOf = (ref) => String(ref?._id ?? ref);

/** Garantiza que la cita es visible para el usuario; si no lo es responde 404 sin revelar que existe. */
export function assertAppointmentVisible(auth, appointment) {
  if (!appointment) throw notFound('Cita no encontrada');
  const scope = appointmentScope(auth);
  if (scope === null) throw notFound('Cita no encontrada');
  if (scope.employeeId && idOf(appointment.employeeId) !== String(scope.employeeId)) throw notFound('Cita no encontrada');
  if (scope.clientId && idOf(appointment.clientId) !== String(scope.clientId)) throw notFound('Cita no encontrada');
}
