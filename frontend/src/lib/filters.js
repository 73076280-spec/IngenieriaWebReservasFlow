// Filtros de búsqueda de citas (HU-12). La validación del rango se hace antes de llamar
// a la API; el servidor aplica la misma regla.

export const RANGE_ERROR = 'La fecha inicial no puede ser posterior a la fecha final'; // HU-12-E3
export const NO_RESULTS = 'No se encontraron citas con los filtros seleccionados'; // HU-12-E4
export const EMPTY_FILTERS = Object.freeze({ q: '', employeeId: '', serviceId: '', status: '', from: '', to: '' });

/** Devuelve el mensaje de error del rango o null si es válido. Fechas 'YYYY-MM-DD'. */
export function rangeError({ from, to }) {
  return from && to && from > to ? RANGE_ERROR : null;
}

/** Convierte un día local en el instante de inicio de ese día (o del día siguiente para `to`, inclusivo). */
function dayBoundary(dateStr, nextDay = false) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d + (nextDay ? 1 : 0)).toISOString();
}

/** Query string para GET /api/appointments; omite filtros vacíos. `to` incluye el día completo. */
export function toQuery(filters) {
  const params = new URLSearchParams();
  const q = filters.q?.trim();
  if (q) params.set('q', q);
  for (const key of ['employeeId', 'serviceId', 'status']) if (filters[key]) params.set(key, filters[key]);
  if (filters.from) params.set('from', dayBoundary(filters.from));
  if (filters.to) params.set('to', dayBoundary(filters.to, true));
  const s = params.toString();
  return s ? '?' + s : '';
}

export const hasFilters = (filters) => Object.entries(filters).some(([, v]) => Boolean(v && String(v).trim()));
