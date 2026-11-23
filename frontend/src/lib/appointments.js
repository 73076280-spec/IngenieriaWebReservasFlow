// Reglas de presentación de citas compartidas por la agenda, el listado y el portal del cliente.
// Reflejan la máquina de estados del backend (services/appointmentService.js); el servidor
// siempre vuelve a validar.

export const STATUS = {
  programada: { label: 'Programada', color: '#2563eb', bg: '#dbeafe' },
  confirmada: { label: 'Confirmada', color: '#047857', bg: '#d1fae5' },
  completada: { label: 'Completada', color: '#475569', bg: '#e2e8f0' },
  cancelada: { label: 'Cancelada', color: '#b91c1c', bg: '#fee2e2' },
  no_asistio: { label: 'No asistió', color: '#b45309', bg: '#fef3c7' },
};
export const STATUS_KEYS = Object.keys(STATUS);
export const ACTIVE = ['programada', 'confirmada'];
const TRANSITIONS = {
  programada: ['confirmada', 'completada', 'no_asistio', 'cancelada'],
  confirmada: ['completada', 'no_asistio', 'cancelada'],
};
const ROLE_STATUSES = {
  profesional: ['confirmada', 'completada', 'no_asistio'],
  cliente: ['cancelada'],
};
export const ACTION_LABEL = { confirmada: 'Confirmar', completada: 'Completar', no_asistio: 'No asistió', cancelada: 'Cancelar' };

export const isActive = (a) => ACTIVE.includes(a.status);

// Estado de la confirmación por correo (HU-04-E1). "simulada" nunca se presenta como envío real.
export const NOTIFICATION = {
  enviada: { short: 'Correo enviado', tone: 'ok' },
  simulada: { short: 'Correo de prueba generado', tone: 'info' },
  pendiente: { short: 'Enviando correo…', tone: 'info' },
  fallida: { short: 'Correo no enviado', tone: 'warn' },
  sin_correo: { short: 'Cliente sin correo', tone: 'warn' },
  desactivada: { short: 'Correo desactivado', tone: 'muted' },
};
export const canResend = (n) => n?.status === 'fallida' || n?.status === 'sin_correo';

/** Mensaje para el usuario sobre la confirmación de una reserva. */
export function notificationText(n) {
  switch (n?.status) {
    case 'enviada': return `Enviamos la confirmación por correo a ${n.to}.`;
    case 'simulada': return `Confirmación por correo generada en modo de prueba para ${n.to} (no se envió un correo real).`;
    case 'pendiente': return 'La confirmación por correo se está enviando.';
    case 'fallida': return 'No se pudo enviar el correo de confirmación. La reserva está registrada; puede reenviarse desde el listado de citas.';
    case 'sin_correo': return 'El cliente no tiene correo registrado: no se envió confirmación por correo.';
    case 'desactivada': return 'El envío de correos está desactivado en este entorno.';
    default: return '';
  }
}

/** Profesional activo y habilitado para el servicio (misma regla que el backend; sin servicios = todos). */
export const eligibleFor = (employees, serviceId) =>
  employees.filter((e) => e.active !== false && (!(e.serviceIds?.length) || e.serviceIds.map(String).includes(String(serviceId))));

/** Escapa texto de usuario antes de insertarlo en HTML de SweetAlert2. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Cambios de estado que el rol puede ofrecer para la cita. "No asistió" solo tras la hora de inicio. */
export function statusActions(appointment, role, nowMs = Date.now()) {
  const next = TRANSITIONS[appointment.status] || [];
  const allowed = ROLE_STATUSES[role] || next;
  return next.filter((s) => allowed.includes(s) && (s !== 'no_asistio' || Date.parse(appointment.start) <= nowMs));
}

/** Evento de FullCalendar con el color del estado (HU-08-E1). */
export function toCalendarEvent(a) {
  const meta = STATUS[a.status] || STATUS.programada;
  return {
    id: a._id,
    title: `${a.clientId?.name || 'Cliente'} · ${a.serviceId?.name || 'Servicio'}`,
    start: a.start,
    end: a.end,
    backgroundColor: meta.color,
    borderColor: meta.color,
    textColor: '#ffffff',
    classNames: a.status === 'cancelada' ? ['ev-cancelled'] : [],
    extendedProps: { appointment: a },
  };
}

/** Mensaje del calendario vacío según la vista (HU-08-E4). */
export function emptyAgendaMessage(viewType) {
  if (viewType === 'timeGridDay') return 'No hay citas programadas para este día';
  if (viewType === 'timeGridWeek') return 'No hay citas programadas para esta semana';
  return 'No hay citas programadas para este mes';
}

/** Horario laboral de un profesional en el formato businessHours de FullCalendar (HU-02-E2). */
export function toBusinessHours(schedule = []) {
  return schedule.map((s) => ({ daysOfWeek: [s.day], startTime: s.start, endTime: s.end }));
}

export function formatDateTime(iso, timeZone) {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) });
}
export function formatTime(iso, timeZone) {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, ...(timeZone ? { timeZone } : {}) });
}
export function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
export const money = (n) => (typeof n === 'number' ? `S/ ${n.toFixed(2)}` : '—');

/** Fecha local 'YYYY-MM-DD' (para inputs de tipo date). */
export function todayLocal(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
