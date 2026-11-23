// Editor de turnos (HU-02): un tramo por día en la interfaz; la API admite varios.

export const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DEFAULT_SCHEDULE = [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '18:00' }));

/** Estado del editor (7 filas) a partir de los turnos guardados. */
export function toEditor(schedule = []) {
  return DAYS.map((_, day) => {
    const s = schedule.find((x) => x.day === day);
    return { day, enabled: Boolean(s), start: s?.start || '09:00', end: s?.end || '18:00' };
  });
}

/** Turnos a guardar y primer error de validación (inicio < fin). */
export function fromEditor(rows) {
  const schedule = rows.filter((r) => r.enabled).map(({ day, start, end }) => ({ day, start, end }));
  const bad = schedule.find((s) => s.start >= s.end);
  return { schedule, error: bad ? `${DAYS[bad.day]}: la hora de inicio debe ser anterior a la hora de fin` : null };
}

/** Resumen legible del horario, p. ej. "Lun–Vie 09:00–18:00 · Sáb 09:00–13:00". */
export function describeSchedule(schedule = []) {
  if (!schedule.length) return 'Sin horario';
  const groups = [];
  for (const day of WEEK_ORDER) {
    const s = schedule.find((x) => x.day === day);
    if (!s) continue;
    const last = groups.at(-1);
    const key = `${s.start}–${s.end}`;
    if (last && last.key === key && WEEK_ORDER.indexOf(last.to) === WEEK_ORDER.indexOf(day) - 1) last.to = day;
    else groups.push({ from: day, to: day, key });
  }
  const short = (d) => DAYS[d].slice(0, 3);
  return groups.map((g) => `${g.from === g.to ? short(g.from) : `${short(g.from)}–${short(g.to)}`} ${g.key}`).join(' · ');
}
