// Utilidades de fecha y zona horaria sin dependencias. Las fechas "locales" se
// expresan como 'YYYY-MM-DD' y las horas como minutos desde la medianoche, siempre
// en la zona horaria de la organización (por defecto America/Lima).

export const DEFAULT_TZ = 'America/Lima';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatters = new Map();

function formatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }));
  }
  return formatters.get(tz);
}

/** Partes de una fecha en la zona horaria indicada. La hora 24 de algunos motores se normaliza a 0. */
export function zonedParts(date, tz = DEFAULT_TZ) {
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' de la fecha en la zona horaria indicada. */
export function localDate(date, tz = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutos desde la medianoche local. */
export function localMinutes(date, tz = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}

function offsetMs(date, tz) {
  const p = zonedParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - (date.getTime() - date.getUTCMilliseconds());
}

/** Instante UTC que corresponde a la fecha local y los minutos indicados en la zona horaria. */
export function zonedToUtc(dateStr, minutes, tz = DEFAULT_TZ) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = offsetMs(new Date(guess), tz);
  let ts = guess - first;
  const second = offsetMs(new Date(ts), tz);
  if (second !== first) ts = guess - second;
  return new Date(ts);
}

/** Día de la semana (0 = domingo) de una fecha 'YYYY-MM-DD'. */
export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Suma días a una fecha 'YYYY-MM-DD'. */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Diferencia en días entre dos fechas 'YYYY-MM-DD' (b - a). */
export function daysBetween(a, b) {
  const toUtc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/** 'HH:mm' → minutos. */
export const hhmmToMinutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Primer día ('YYYY-MM-DD') del mes local desplazado `monthsBack` meses hacia atrás. */
export function monthStart(date, tz = DEFAULT_TZ, monthsBack = 0) {
  const p = zonedParts(date, tz);
  const t = new Date(Date.UTC(p.year, p.month - 1 - monthsBack, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}

/** Primer día del mes siguiente a una fecha 'YYYY-MM-01'. */
export function nextMonthStart(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}
