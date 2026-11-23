// Mensajes visibles para el usuario. Los marcados con el ID del escenario
// reproducen el texto exacto del Excel oficial de historias de usuario.
export const MESSAGES = Object.freeze({
  INVALID_CREDENTIALS: 'Las credenciales ingresadas no son válidas', // HU-15-E3
  FORBIDDEN: 'No tiene permisos para acceder a esta sección', // HU-11-E3
  TENANT_SUSPENDED: 'La organización se encuentra inactiva. Contacte al proveedor del servicio.', // HU-14-E4
  ACCOUNT_PENDING: 'Su cuenta está pendiente de configuración. Se notificó al administrador de su organización.', // HU-11-E4
  SESSION_REQUIRED: 'Debe iniciar sesión para continuar',
  TOKEN_EXPIRED: 'Su sesión ha expirado. Inicie sesión nuevamente.', // HU-15-E4
  SESSION_INVALID: 'Sesión inválida. Inicie sesión nuevamente.',
  SESSION_REVOKED: 'La sesión fue cerrada. Inicie sesión nuevamente.', // HU-15-E2
  NOT_FOUND: 'Recurso no encontrado', // HU-14-E3
  VALIDATION: 'Datos inválidos',
  CONFLICT: 'Conflicto: horario ocupado o dato duplicado',
  INTERNAL: 'Ocurrió un error inesperado. Intente nuevamente en unos minutos.',
  SELF_DEMOTION: 'No puede quitarse su propio rol de administrador',
  EMAIL_TAKEN: 'Ya existe una cuenta con ese correo en la organización',

  // Catálogos (HU-01, HU-02, HU-03)
  EMAIL_INVALID: 'El correo electrónico no tiene un formato válido', // HU-01-E3
  NAME_REQUIRED: 'El nombre debe tener al menos 2 caracteres',
  SPECIALTY_REQUIRED: 'Debe seleccionar al menos una especialidad', // HU-02-E3
  DURATION_POSITIVE: 'La duración del servicio debe ser mayor que cero', // HU-03-E3
  DURATION_STEP: 'La duración debe ser múltiplo de 15 minutos',
  DURATION_MAX: 'La duración no puede superar 480 minutos',
  PRICE_NEGATIVE: 'El costo del servicio no puede ser negativo',
  SCHEDULE_ORDER: 'La hora de inicio del turno debe ser anterior a la hora de fin',
  SCHEDULE_OVERLAP: 'Los turnos de un mismo día no pueden superponerse',
  CLIENT_HAS_ACTIVE: 'No se puede eliminar el cliente porque tiene citas pendientes. Primero debe cancelar o reasignar sus citas pendientes.', // HU-01-E4
  CLIENT_HAS_HISTORY: 'No se puede eliminar el cliente porque tiene historial de citas; se conserva para no perder ese historial.',
  EMPLOYEE_HAS_FUTURE: 'El profesional tiene citas pendientes asociadas. Reasígnelas a otro profesional antes de desactivarlo.', // HU-02-E4
  EMPLOYEE_HAS_APPOINTMENTS: 'El profesional tiene citas registradas. Desactívelo en lugar de eliminarlo.',
  SERVICE_HAS_APPOINTMENTS: 'El servicio tiene citas asociadas. Desactívelo en lugar de eliminarlo para no afectar las citas ya reservadas.', // HU-03-E4
  LINKED_ACCOUNT: 'El registro está vinculado a una cuenta de usuario. Cambie primero el rol o el vínculo de esa cuenta.',
  INVALID_SERVICES: 'Alguno de los servicios seleccionados no pertenece a la organización',

  // Disponibilidad y reservas (HU-04, HU-07, HU-09)
  SLOT_UNAVAILABLE: 'El horario seleccionado no está disponible', // HU-04-E3
  SLOT_TAKEN: 'El horario seleccionado ya no está disponible. Elija otro horario.', // HU-09-E3
  PAST_BOOKING: 'No se puede reservar en una fecha u hora pasada',
  SLOT_ALIGNMENT: 'La hora debe estar alineada a bloques de 15 minutos',
  PAST_DATE: 'No es posible consultar disponibilidad para fechas pasadas', // HU-07-E3
  DATE_TOO_FAR: 'Solo se puede consultar disponibilidad hasta 90 días a partir de hoy',
  NO_AVAILABILITY: 'No hay horarios disponibles para esta fecha', // HU-07-E4
  EMPLOYEE_NOT_ELIGIBLE: 'El profesional seleccionado no está disponible para este servicio',
  SERVICE_INACTIVE: 'El servicio seleccionado no está disponible para nuevas reservas',
  BOOKING_REFS: 'Cliente, profesional o servicio no pertenece a la organización',
  CLIENT_PROFILE_MISSING: 'Su cuenta de cliente no está vinculada a una ficha de cliente. Contacte a la organización.',

  // Ciclo de vida de la cita (HU-05, HU-06, HU-10)
  APPOINTMENT_INACTIVE: 'La cita ya no está activa. Puede realizar una nueva reserva.', // HU-05-E4
  CANCEL_COMPLETED: 'No es posible cancelar una cita ya completada', // HU-06-E3
  COMPLETE_CANCELLED: 'No es posible completar una cita cancelada', // HU-10-E3
  FINAL_STATE: 'La cita ya finalizó y no admite cambios de estado',
  NO_SHOW_TOO_EARLY: 'Solo se puede registrar la inasistencia después de la hora de inicio de la cita',
  STATUS_NOT_ALLOWED: 'Cambio de estado no autorizado para su rol',
  APPOINTMENT_UPDATED: 'La cita ya fue actualizada por otro usuario. Revise su estado actual e intente nuevamente.', // HU-06-E4
  CONFIRMATION_NOT_RETRYABLE: 'La confirmación ya fue enviada o está en proceso; no se reenvía para evitar duplicados.', // HU-04-E1

  // Búsqueda y panel (HU-12, HU-13)
  INVALID_RANGE: 'La fecha inicial no puede ser posterior a la fecha final', // HU-12-E3
  DASHBOARD_UNAVAILABLE: 'No se pudieron calcular los indicadores en este momento. Intente nuevamente en unos minutos.', // HU-13-E3
  DASHBOARD_WELCOME: 'Bienvenido a ReservaFlow. Aún no hay datos para mostrar: los indicadores aparecerán cuando registres tus primeras citas.', // HU-13-E4
  DASHBOARD_EMPTY_PERIOD: 'No hay citas registradas en el periodo seleccionado.',
});

/** "No es posible reprogramar con menos de 2 horas de anticipación" (HU-05-E3) con el plazo configurado. */
export const rescheduleTooLate = (hours) => `No es posible reprogramar con menos de ${hours} ${hours === 1 ? 'hora' : 'horas'} de anticipación`;

/** Mensajes propios que el manejador de errores puede mostrar tal cual en una validación. */
export const USER_MESSAGES = new Set(Object.values(MESSAGES));

/** Motivos de cancelación (HU-06-E2). */
export const CANCELLATION_REASONS = Object.freeze({
  cliente_no_puede_asistir: 'Cliente no puede asistir',
  cliente_reprogramara: 'Cliente reprogramará más adelante',
  motivo_salud: 'Motivo de salud',
  profesional_no_disponible: 'Profesional no disponible',
  error_de_registro: 'Error de registro',
  otro: 'Otro motivo',
});
