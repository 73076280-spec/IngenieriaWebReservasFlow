import { describe, it, expect } from 'vitest';
import { statusActions, toCalendarEvent, emptyAgendaMessage, toBusinessHours, eligibleFor, escapeHtml, STATUS, NOTIFICATION, notificationText, canResend } from './appointments.js';
import { rangeError, toQuery, hasFilters, RANGE_ERROR, NO_RESULTS, EMPTY_FILTERS } from './filters.js';
import { toEditor, fromEditor, describeSchedule } from './schedule.js';

const NOW = Date.parse('2026-11-23T15:00:00Z');
const ap = (status, start = '2026-11-24T15:00:00Z') => ({ _id: 'a1', status, start, end: start, clientId: { name: 'Ana' }, serviceId: { name: 'Limpieza' } });

describe('HU-10 · Acciones de estado por rol', () => {
  it('recepción ve confirmar, completar y cancelar; "no asistió" solo tras la hora de inicio', () => {
    expect(statusActions(ap('programada'), 'recepcionista', NOW)).toEqual(['confirmada', 'completada', 'cancelada']);
    expect(statusActions(ap('programada', '2026-11-23T14:00:00Z'), 'recepcionista', NOW)).toContain('no_asistio');
  });
  it('HU-06-E3 / HU-10-E3 las citas finalizadas no ofrecen acciones', () => {
    for (const s of ['completada', 'cancelada', 'no_asistio']) expect(statusActions(ap(s), 'admin', NOW)).toEqual([]);
  });
  it('el profesional no cancela; el cliente solo cancela', () => {
    expect(statusActions(ap('confirmada'), 'profesional', NOW)).toEqual(['completada']);
    expect(statusActions(ap('programada'), 'cliente', NOW)).toEqual(['cancelada']);
  });
});

describe('HU-08 · Agenda', () => {
  it('HU-08-E1 cada estado tiene un color distinto en el calendario', () => {
    const colors = Object.keys(STATUS).map((s) => toCalendarEvent(ap(s)).backgroundColor);
    expect(new Set(colors).size).toBe(5);
    expect(toCalendarEvent(ap('programada')).title).toBe('Ana · Limpieza');
  });
  it('HU-08-E4 mensaje de día sin citas según la vista', () => {
    expect(emptyAgendaMessage('timeGridDay')).toBe('No hay citas programadas para este día');
    expect(emptyAgendaMessage('timeGridWeek')).toContain('semana');
  });
  it('HU-02-E2 el horario laboral se muestra en el calendario', () => {
    expect(toBusinessHours([{ day: 6, start: '09:00', end: '13:00' }])).toEqual([{ daysOfWeek: [6], startTime: '09:00', endTime: '13:00' }]);
  });
});

describe('HU-12 · Filtros', () => {
  it('HU-12-E3 rango invertido: mensaje oficial y no se construye la búsqueda', () => {
    expect(rangeError({ from: '2026-12-10', to: '2026-12-01' })).toBe('La fecha inicial no puede ser posterior a la fecha final');
    expect(RANGE_ERROR).toBe('La fecha inicial no puede ser posterior a la fecha final');
    expect(rangeError({ from: '2026-12-01', to: '2026-12-01' })).toBeNull();
  });
  it('HU-12-E2 combina filtros y omite los vacíos; "hasta" incluye el día completo', () => {
    const q = new URLSearchParams(toQuery({ ...EMPTY_FILTERS, q: ' ana ', employeeId: 'e1', from: '2026-12-01', to: '2026-12-01' }).slice(1));
    expect(q.get('q')).toBe('ana');
    expect(q.get('employeeId')).toBe('e1');
    expect(q.has('serviceId')).toBe(false);
    expect(Date.parse(q.get('to')) - Date.parse(q.get('from'))).toBe(24 * 3600e3);
    expect(toQuery(EMPTY_FILTERS)).toBe('');
  });
  it('HU-12-E4 mensaje oficial sin resultados', () => {
    expect(NO_RESULTS).toBe('No se encontraron citas con los filtros seleccionados');
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasFilters({ ...EMPTY_FILTERS, serviceId: 's1' })).toBe(true);
  });
});

describe('HU-02 · Editor de turnos', () => {
  it('ida y vuelta entre turnos guardados y editor', () => {
    const schedule = [{ day: 1, start: '09:00', end: '18:00' }, { day: 6, start: '09:00', end: '13:00' }];
    const rows = toEditor(schedule);
    expect(rows).toHaveLength(7);
    expect(fromEditor(rows)).toEqual({ schedule, error: null });
  });
  it('detecta inicio posterior al fin', () => {
    const rows = toEditor([{ day: 2, start: '18:00', end: '09:00' }]);
    expect(fromEditor(rows).error).toBe('Martes: la hora de inicio debe ser anterior a la hora de fin');
  });
  it('resume el horario agrupando días consecutivos', () => {
    const weekdays = [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '18:00' }));
    expect(describeSchedule([...weekdays, { day: 6, start: '09:00', end: '13:00' }])).toBe('Lun–Vie 09:00–18:00 · Sáb 09:00–13:00');
    expect(describeSchedule([])).toBe('Sin horario');
  });
});

describe('HU-04-E1 · Estado de la confirmación por correo', () => {
  it('el modo de prueba nunca se presenta como envío real', () => {
    const sim = notificationText({ status: 'simulada', to: 'juan@correo.pe' });
    expect(sim).toContain('modo de prueba');
    expect(sim).toContain('no se envió un correo real');
    expect(notificationText({ status: 'enviada', to: 'juan@correo.pe' })).toBe('Enviamos la confirmación por correo a juan@correo.pe.');
  });
  it('un fallo comunica que la reserva sigue registrada y permite reenviar', () => {
    expect(notificationText({ status: 'fallida' })).toContain('La reserva está registrada');
    expect(canResend({ status: 'fallida' })).toBe(true);
    expect(canResend({ status: 'sin_correo' })).toBe(true);
    expect(canResend({ status: 'simulada' })).toBe(false);
    expect(canResend(null)).toBe(false);
  });
  it('todos los estados del servidor tienen etiqueta', () => {
    for (const s of ['enviada', 'simulada', 'pendiente', 'fallida', 'sin_correo', 'desactivada']) {
      expect(NOTIFICATION[s].short).toBeTruthy();
      expect(notificationText({ status: s, to: 'x@y.pe' })).not.toBe('');
    }
  });
});

describe('Reserva · elegibilidad y seguridad', () => {
  it('HU-04-E2 / HU-07-E2 solo profesionales activos y habilitados para el servicio', () => {
    const employees = [{ _id: 1, serviceIds: ['s1'] }, { _id: 2, serviceIds: [] }, { _id: 3, serviceIds: ['s2'] }, { _id: 4, serviceIds: [], active: false }];
    expect(eligibleFor(employees, 's1').map((e) => e._id)).toEqual([1, 2]);
  });
  it('escapa HTML de datos de usuario en los diálogos', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
});
