import React, { useCallback, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import Swal from 'sweetalert2';
import { STATUS, toCalendarEvent, emptyAgendaMessage, toBusinessHours, formatDateTime, money } from '../lib/appointments.js';
import { escapeHtml } from '../components/BookingForm.jsx';
import { ErrorState } from '../components/ui.jsx';

/** Agenda diaria, semanal y mensual (HU-08). Carga solo el rango visible. */
export default function Agenda({ api, me, employees }) {
  const isPro = me.role === 'profesional';
  const [employeeId, setEmployeeId] = useState(isPro ? me.employeeId || '' : '');
  const [range, setRange] = useState(null);
  const [state, setState] = useState({ loading: false, error: null, items: [] });
  const request = useRef(0);

  const load = useCallback(async (r = range, emp = employeeId) => {
    if (!r) return;
    const id = ++request.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ from: r.from, to: r.to });
      if (emp && !isPro) params.set('employeeId', emp);
      const items = await api('/appointments?' + params);
      if (id === request.current) setState({ loading: false, error: null, items });
    } catch (err) {
      if (err.sessionEnded || id !== request.current) return;
      // HU-08-E3: no se muestran datos parciales; se ofrece reintentar.
      setState({ loading: false, error: 'No se pudo cargar la agenda. Verifique su conexión e intente nuevamente.', items: [] });
    }
  }, [api, range, employeeId, isPro]);

  const events = useMemo(() => state.items.map(toCalendarEvent), [state.items]);
  const selected = employees.find((e) => e._id === employeeId);

  function onDatesSet(info) {
    const r = { from: info.start.toISOString(), to: info.end.toISOString(), view: info.view.type };
    setRange(r);
    load(r);
  }

  function showDetail({ event }) {
    const a = event.extendedProps.appointment;
    const meta = STATUS[a.status];
    Swal.fire({
      title: escapeHtml(a.serviceId?.name || 'Cita'),
      html: `<div class="detail">
        <p><b>Cliente:</b> ${escapeHtml(a.clientId?.name || '—')}</p>
        <p><b>Profesional:</b> ${escapeHtml(a.employeeId?.name || '—')}</p>
        <p><b>Horario:</b> ${formatDateTime(a.start)} – ${new Date(a.end).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
        <p><b>Estado:</b> <span style="color:${meta.color};font-weight:700">${meta.label}</span></p>
        <p><b>Precio:</b> ${money(a.priceSnapshot)}</p></div>`,
      confirmButtonText: 'Cerrar',
    });
  }

  return (
    <section className="panel">
      <div className="toolbar">
        {!isPro ? (
          <label className="inline">Profesional
            <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); load(range, e.target.value); }}>
              <option value="">Todos</option>
              {employees.map((e) => <option key={e._id} value={e._id}>{e.name}{e.active === false ? ' (inactivo)' : ''}</option>)}
            </select>
          </label>
        ) : <p className="muted">Tu agenda{selected ? ` · ${selected.name}` : ''}</p>}
        <ul className="legend" aria-label="Leyenda de estados">
          {Object.entries(STATUS).map(([k, m]) => <li key={k}><i style={{ background: m.color }} />{m.label}</li>)}
        </ul>
      </div>
      {isPro && !me.employeeId && <ErrorState message="Tu cuenta no está vinculada a un perfil de profesional. Pide al administrador que la vincule." />}
      {state.error && <ErrorState message={state.error} onRetry={() => load()} />}
      {!state.error && !state.loading && range && events.length === 0 && (
        <p className="notice" role="status">{emptyAgendaMessage(range.view)}</p>
      )}
      <div className={'calendar' + (state.loading ? ' is-loading' : '')}>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={esLocale}
          initialView={isPro ? 'timeGridWeek' : 'dayGridMonth'}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          height="auto"
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          allDaySlot={false}
          nowIndicator
          navLinks
          businessHours={selected ? toBusinessHours(selected.schedule) : false}
          events={events}
          datesSet={onDatesSet}
          eventClick={showDetail}
        />
      </div>
      <p className="muted">Horarios mostrados según la zona horaria de tu navegador. Selecciona una cita para ver su detalle.</p>
    </section>
  );
}
