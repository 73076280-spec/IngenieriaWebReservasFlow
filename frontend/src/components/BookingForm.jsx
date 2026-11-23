import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import { formatDate, formatTime, money, todayLocal, eligibleFor, escapeHtml } from '../lib/appointments.js';
import { EmptyState, ErrorState, FormError, Loading, notifyError } from './ui.jsx';

export { escapeHtml };
const ANY = '';
const idOf = (ref) => String(ref?._id ?? ref ?? '');

/**
 * Reserva y reprogramación basadas en la disponibilidad real (HU-04, HU-05, HU-07, HU-09).
 * mode="create": servicio, profesional (o "Cualquier profesional disponible"), fecha y bloque libre.
 * mode="reschedule": mismo servicio; se puede cambiar de profesional habilitado (HU-05-E2).
 */
export function BookingForm({ api, mode = 'create', appointment, services, employees, clients, timeZone, onDone, onCancel }) {
  const reschedule = mode === 'reschedule';
  const activeServices = useMemo(() => services.filter((s) => s.active !== false), [services]);
  const [clientId, setClientId] = useState('');
  const [serviceId, setServiceId] = useState(reschedule ? idOf(appointment.serviceId) : '');
  const [employeeId, setEmployeeId] = useState(reschedule ? idOf(appointment.employeeId) : ANY);
  const [date, setDate] = useState(todayLocal());
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const [slot, setSlot] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const service = (reschedule ? services : activeServices).find((s) => s._id === serviceId);
  const candidates = useMemo(() => (serviceId ? eligibleFor(employees, serviceId) : []), [employees, serviceId]);

  // Solo se muestra la respuesta de la última consulta: si el usuario cambia de fecha o de
  // profesional mientras otra consulta sigue en curso, la respuesta anterior se descarta
  // (evita ofrecer horarios de un día distinto al seleccionado).
  const seq = useRef(0);
  const loadAvailability = useCallback(async () => {
    if (!serviceId || !date) return;
    const id = ++seq.current;
    setSlot(null);
    setState({ loading: true, error: null, data: null });
    try {
      const params = new URLSearchParams({ serviceId, date });
      if (employeeId) params.set('employeeId', employeeId);
      const data = await api('/availability?' + params);
      if (id === seq.current) setState({ loading: false, error: null, data });
    } catch (err) {
      if (err.sessionEnded || id !== seq.current) return;
      setState({ loading: false, error: err.message, data: null });
    }
  }, [api, serviceId, employeeId, date]);

  useEffect(() => { loadAvailability(); }, [loadAvailability]);

  async function submit(chosen = slot) {
    setFormError(null);
    if (!reschedule && clients && !clientId) return setFormError('Seleccione el cliente de la cita');
    if (!chosen) return setFormError('Seleccione un horario disponible');
    setSaving(true);
    try {
      let result;
      if (reschedule) {
        result = await api(`/appointments/${appointment._id}/reschedule`, {
          method: 'PATCH',
          body: JSON.stringify({ start: chosen.start, employeeId: chosen.employeeId || employeeId || idOf(appointment.employeeId), version: appointment.__v }),
        });
      } else {
        // Sin profesional elegido no se envía employeeId: el servidor asigna el primero disponible (HU-04-E2).
        const body = { serviceId, start: chosen.start, ...(employeeId ? { employeeId } : {}), ...(clients ? { clientId } : {}) };
        result = await api('/appointments', { method: 'POST', body: JSON.stringify(body) });
      }
      onDone(result);
    } catch (err) {
      await handleConflict(err);
    } finally {
      setSaving(false);
    }
  }

  // HU-09-E2 / E3: el horario se ocupó; se ofrece el más cercano que propone el servidor.
  async function handleConflict(err) {
    const suggestion = err.details?.suggestion;
    if ((err.code === 'SLOT_TAKEN' || err.code === 'OUT_OF_SCHEDULE') && suggestion) {
      loadAvailability();
      const answer = await Swal.fire({
        icon: 'warning',
        title: err.message,
        html: `Horario más cercano disponible:<br><b>${formatDate(localDay(suggestion.start, timeZone))} a las ${formatTime(suggestion.start, timeZone)}</b> con ${escapeHtml(suggestion.employee?.name || 'otro profesional')}.`,
        showCancelButton: true,
        confirmButtonText: 'Reservar ese horario',
        cancelButtonText: 'Elegir otro',
      });
      if (answer.isConfirmed) return submit({ start: suggestion.start, employeeId: idOf(suggestion.employee?._id) });
      return undefined;
    }
    if (err.code === 'APPOINTMENT_UPDATED' || err.code === 'APPOINTMENT_INACTIVE' || err.code === 'RESCHEDULE_TOO_LATE') {
      await Swal.fire({ icon: 'warning', title: 'No se aplicó el cambio', text: err.message });
      return onCancel?.();
    }
    if (!err.sessionEnded) setFormError(err.message);
    notifyError(err);
    return undefined;
  }

  const data = state.data;
  return (
    <div className="booking">
      <div className="form-grid">
        {!reschedule && clients && (
          <label>Cliente
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Seleccionar cliente</option>
              {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label>Servicio
          <select value={serviceId} disabled={reschedule} onChange={(e) => { setServiceId(e.target.value); setEmployeeId(ANY); }}>
            <option value="">Seleccionar servicio</option>
            {(reschedule ? services : activeServices).map((s) => <option key={s._id} value={s._id}>{s.name} · {s.duration} min · {money(s.price)}</option>)}
          </select>
        </label>
        <label>Profesional
          <select value={employeeId} disabled={!serviceId} onChange={(e) => setEmployeeId(e.target.value)}>
            {!reschedule && <option value={ANY}>Cualquier profesional disponible</option>}
            {candidates.map((e) => <option key={e._id} value={e._id}>{e.name}{e.specialty ? ` · ${e.specialty}` : ''}</option>)}
          </select>
        </label>
        <label>Fecha
          <input type="date" value={date} min={todayLocal()} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>

      {!serviceId && <EmptyState title="Seleccione un servicio para ver los horarios disponibles" />}
      {serviceId && state.loading && <Loading text="Consultando disponibilidad…" />}
      {serviceId && state.error && <ErrorState message={state.error} />}
      {data && data.slots.length === 0 && (
        <EmptyState title={data.message || 'No hay horarios disponibles para esta fecha'}>
          {data.suggestions?.length ? 'Fechas cercanas con disponibilidad:' : 'No hay fechas cercanas con disponibilidad.'}
          {data.suggestions?.length > 0 && (
            <span className="chips">
              {data.suggestions.map((s) => <button type="button" key={s.date} className="chip" onClick={() => setDate(s.date)}>{formatDate(s.date)} ({s.available})</button>)}
            </span>
          )}
        </EmptyState>
      )}
      {data && data.slots.length > 0 && (
        <fieldset className="slots">
          <legend>Horarios disponibles · {formatDate(data.date)} · {service?.duration} min</legend>
          {data.slots.map((s) => {
            const chosen = slot?.start === s.start;
            return (
              <button type="button" key={s.start} className={'slot' + (chosen ? ' slot-on' : '')} aria-pressed={chosen}
                onClick={() => setSlot({ start: s.start, employeeId: employeeId || null })}
                title={s.employees.map((e) => e.name).join(', ')}>
                {formatTime(s.start, timeZone)}
                {!employeeId && <small>{s.employees.length} prof.</small>}
              </button>
            );
          })}
        </fieldset>
      )}

      <FormError message={formError} />
      <div className="actions">
        {onCancel && <button type="button" onClick={onCancel}>Cancelar</button>}
        <button type="button" className="primary" disabled={!slot || saving} onClick={() => submit()}>
          {saving ? 'Guardando…' : reschedule ? 'Confirmar reprogramación' : 'Confirmar reserva'}
        </button>
      </div>
    </div>
  );
}

function localDay(iso, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
