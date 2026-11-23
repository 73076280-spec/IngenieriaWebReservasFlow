import React, { useCallback, useEffect, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import { STATUS, ACTION_LABEL, statusActions, isActive, formatDateTime, money, notificationText, canResend } from '../lib/appointments.js';
import { EMPTY_FILTERS, NO_RESULTS, rangeError, toQuery, hasFilters } from '../lib/filters.js';
import { changeStatus } from '../lib/actions.js';
import { BookingForm, escapeHtml } from '../components/BookingForm.jsx';
import { EmptyState, ErrorState, FormError, Loading, Modal, NotificationBadge, StatusBadge, notifyError } from '../components/ui.jsx';

/** Búsqueda, filtros y gestión de citas para el personal y el profesional (HU-04..06, HU-10, HU-12). */
export default function Appointments({ api, me, can, catalogs, initialFilters }) {
  const { clients, employees, services } = catalogs;
  const isPro = me.role === 'profesional';
  const [draft, setDraft] = useState({ ...EMPTY_FILTERS, ...initialFilters });
  const [applied, setApplied] = useState({ ...EMPTY_FILTERS, ...initialFilters });
  const [rangeMsg, setRangeMsg] = useState(null);
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [modal, setModal] = useState(null);

  const seq = useRef(0);
  const load = useCallback(async () => {
    const id = ++seq.current; // se descartan respuestas de búsquedas anteriores
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const items = await api('/appointments' + toQuery(applied));
      if (id === seq.current) setState({ loading: false, error: null, items });
    } catch (err) {
      if (err.sessionEnded || id !== seq.current) return;
      setState({ loading: false, error: err.message, items: [] });
    }
  }, [api, applied]);

  useEffect(() => { load(); }, [load]);

  function search(e) {
    e.preventDefault();
    // HU-12-E3: un rango invertido no ejecuta la búsqueda.
    const msg = rangeError(draft);
    setRangeMsg(msg);
    if (!msg) setApplied({ ...draft });
  }
  function clear() { setDraft({ ...EMPTY_FILTERS }); setApplied({ ...EMPTY_FILTERS }); setRangeMsg(null); }
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function onStatus(a, status) {
    if (await changeStatus(api, a, status, me.cancellationReasons)) load();
  }

  function booked(result) {
    setModal(null);
    load();
    if (result?.confirmation) {
      Swal.fire({
        icon: 'success',
        title: 'Cita registrada',
        html: `Código de reserva <b>${escapeHtml(result.confirmation.code)}</b><br>${escapeHtml(result.confirmation.serviceName)} con ${escapeHtml(result.confirmation.employeeName)}<br>${formatDateTime(result.start)}`
          + (result.notification ? `<p class="swal-note">✉ ${escapeHtml(notificationText(result.notification))}</p>` : ''),
      });
    } else toast.success('Cita reprogramada');
  }

  // HU-04-E1: reenvío de una confirmación que falló o de un cliente que no tenía correo.
  async function resend(a) {
    try {
      const n = await api(`/appointments/${a._id}/notification`, { method: 'POST' });
      toast[n.status === 'fallida' ? 'warn' : 'success'](notificationText(n));
    } catch (err) {
      notifyError(err);
    }
    load();
  }

  return (
    <section className="panel">
      <form className="filters" onSubmit={search} aria-label="Filtros de búsqueda">
        <label>Cliente<input placeholder="Nombre del cliente" value={draft.q} onChange={set('q')} /></label>
        {!isPro && (
          <label>Profesional
            <select value={draft.employeeId} onChange={set('employeeId')}>
              <option value="">Todos</option>
              {employees.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </label>
        )}
        <label>Servicio
          <select value={draft.serviceId} onChange={set('serviceId')}>
            <option value="">Todos</option>
            {services.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </label>
        <label>Estado
          <select value={draft.status} onChange={set('status')}>
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </label>
        <label>Desde<input type="date" value={draft.from} onChange={set('from')} /></label>
        <label>Hasta<input type="date" value={draft.to} onChange={set('to')} /></label>
        <div className="filter-actions">
          <button className="primary">Buscar</button>
          <button type="button" onClick={clear}>Limpiar</button>
        </div>
      </form>
      <FormError message={rangeMsg} />

      <div className="toolbar">
        <p className="muted">{state.loading ? 'Buscando…' : `${state.items.length} citas${hasFilters(applied) ? ' con los filtros aplicados' : ''} · ordenadas por fecha`}</p>
        {can('appointments:create') && <button className="primary" onClick={() => setModal({ type: 'create' })}>+ Nueva cita</button>}
      </div>

      {state.loading && <Loading />}
      {state.error && <ErrorState message={state.error} onRetry={load} />}
      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState title={hasFilters(applied) ? NO_RESULTS : 'Aún no hay citas registradas'} />
      )}
      {!state.loading && !state.error && state.items.length > 0 && (
        <div className="scroll">
          <table>
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Profesional</th><th>Servicio</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {state.items.map((a) => (
                <tr key={a._id}>
                  <td>{formatDateTime(a.start)}</td>
                  <td>{a.clientId?.name || '—'}</td>
                  <td>{a.employeeId?.name || '—'}</td>
                  <td>{a.serviceId?.name || '—'}</td>
                  <td>{money(a.priceSnapshot)}</td>
                  <td>
                    <StatusBadge status={a.status} />
                    {a.cancellationReason && <small className="block muted">{me.cancellationReasons?.[a.cancellationReason]}</small>}
                    <NotificationBadge notification={a.notification} />
                  </td>
                  <td className="row-actions">
                    {canResend(a.notification) && isActive(a) && can('appointments:notify') && <button onClick={() => resend(a)}>Reenviar confirmación</button>}
                    {statusActions(a, me.role).map((s) => (
                      <button key={s} className={s === 'cancelada' ? 'danger' : ''} onClick={() => onStatus(a, s)}>{ACTION_LABEL[s]}</button>
                    ))}
                    {isActive(a) && can('appointments:reschedule') && <button onClick={() => setModal({ type: 'reschedule', appointment: a })}>Reprogramar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'create' && (
        <Modal title="Nueva cita" wide onClose={() => setModal(null)}>
          <BookingForm api={api} services={services} employees={employees} clients={clients} timeZone={me.tenant.timezone} onDone={booked} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === 'reschedule' && (
        <Modal title={`Reprogramar · ${modal.appointment.clientId?.name || ''}`} wide onClose={() => setModal(null)}>
          <p className="muted">Actual: {formatDateTime(modal.appointment.start)} con {modal.appointment.employeeId?.name}. Puede elegir otro profesional habilitado para el servicio.</p>
          <BookingForm api={api} mode="reschedule" appointment={{ ...modal.appointment, serviceId: modal.appointment.serviceId?._id, employeeId: modal.appointment.employeeId?._id }}
            services={services} employees={employees} timeZone={me.tenant.timezone} onDone={booked} onCancel={() => { setModal(null); load(); }} />
        </Modal>
      )}
    </section>
  );
}
