import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import { formatDateTime, isActive, money, notificationText } from '../lib/appointments.js';
import { changeStatus } from '../lib/actions.js';
import { BookingForm, escapeHtml } from '../components/BookingForm.jsx';
import { EmptyState, ErrorState, Loading, Modal, NotificationBadge, StatusBadge, notifyError } from '../components/ui.jsx';

const missingProfile = (me) => !me.clientId && <ErrorState message="Tu cuenta no está vinculada a una ficha de cliente. Contacta a la organización para poder reservar." />;

/** Reserva en autoservicio del cliente (HU-04, HU-07, HU-09). */
export function BookPage({ api, me, catalogs, goTo }) {
  const [key, setKey] = useState(0);
  async function done(result) {
    // HU-04-E1: comprobante de la reserva en la aplicación.
    await Swal.fire({
      icon: 'success',
      title: 'Reserva confirmada',
      html: `Tu cita quedó <b>programada</b>.<br>Código de reserva: <b>${escapeHtml(result.confirmation.code)}</b><br>${escapeHtml(result.confirmation.serviceName)} con ${escapeHtml(result.confirmation.employeeName)}<br>${formatDateTime(result.start, me.tenant.timezone)}`
        + (result.notification ? `<p class="swal-note">✉ ${escapeHtml(notificationText(result.notification))}</p>` : ''),
      confirmButtonText: 'Ver mis citas',
      showCancelButton: true,
      cancelButtonText: 'Reservar otra',
    }).then((r) => (r.isConfirmed ? goTo('mis-citas') : setKey((k) => k + 1)));
  }
  return (
    <section className="panel">
      <p className="lead">Elige el servicio, el profesional (o cualquiera disponible), la fecha y un horario libre.</p>
      {missingProfile(me) || <BookingForm key={key} api={api} services={catalogs.services} employees={catalogs.employees} timeZone={me.tenant.timezone} onDone={done} />}
    </section>
  );
}

/** Citas del cliente: próximas e historial, con reprogramación y cancelación (HU-05, HU-06). */
export function MyAppointmentsPage({ api, me, catalogs, goTo }) {
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [modal, setModal] = useState(null);
  const tz = me.tenant.timezone;
  const minHours = me.tenant.settings?.rescheduleMinHours ?? 2;

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ loading: false, error: null, items: await api('/appointments') });
    } catch (err) {
      if (!err.sessionEnded) setState({ loading: false, error: err.message, items: [] });
    }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  // HU-05-E4: el servidor indica que la cita ya no está activa y se sugiere reservar de nuevo.
  async function rescheduleInactive(a) {
    try {
      await api(`/appointments/${a._id}/reschedule`, { method: 'PATCH', body: JSON.stringify({ start: a.start }) });
    } catch (err) {
      if (err.code !== 'APPOINTMENT_INACTIVE') return notifyError(err);
      const r = await Swal.fire({ icon: 'info', title: 'La cita ya no está activa', text: err.message, showCancelButton: true, confirmButtonText: 'Hacer una nueva reserva', cancelButtonText: 'Cerrar' });
      if (r.isConfirmed) goTo('reservar');
    }
    return undefined;
  }

  const now = Date.now();
  const upcoming = state.items.filter((a) => isActive(a) && Date.parse(a.end) >= now);
  const history = state.items.filter((a) => !upcoming.includes(a)).reverse();

  const row = (a, actions) => (
    <article className="appt-card" key={a._id}>
      <div>
        <strong>{a.serviceId?.name}</strong>
        <p>{formatDateTime(a.start, tz)} · {a.employeeId?.name}</p>
        <p className="muted">{money(a.priceSnapshot)} · Código {String(a._id).slice(-8).toUpperCase()}</p>
        <NotificationBadge notification={a.notification} />
      </div>
      <div className="appt-side"><StatusBadge status={a.status} />{actions}</div>
    </article>
  );

  if (missingProfile(me)) return <section className="panel">{missingProfile(me)}</section>;
  return (
    <section className="panel">
      {state.loading && <Loading />}
      {state.error && <ErrorState message={state.error} onRetry={load} />}
      {!state.loading && !state.error && (
        <>
          <h2 className="section-title">Próximas citas</h2>
          <p className="muted">Puedes reprogramar con al menos {minHours} {minHours === 1 ? 'hora' : 'horas'} de anticipación.</p>
          {upcoming.length === 0 && <EmptyState title="No tienes citas próximas"><button className="primary" onClick={() => goTo('reservar')}>Reservar una cita</button></EmptyState>}
          {upcoming.map((a) => row(a, (
            <span className="row-actions">
              <button onClick={() => setModal(a)}>Reprogramar</button>
              <button className="danger" onClick={async () => { if (await changeStatus(api, a, 'cancelada', me.cancellationReasons)) load(); }}>Cancelar</button>
            </span>
          )))}
          <h2 className="section-title">Historial</h2>
          {history.length === 0 && <EmptyState title="Aún no tienes citas anteriores" />}
          {history.map((a) => row(a, a.status === 'cancelada' && <span className="row-actions"><button onClick={() => rescheduleInactive(a)}>Reprogramar</button></span>))}
        </>
      )}
      {modal && (
        <Modal title="Reprogramar cita" wide onClose={() => setModal(null)}>
          <p className="muted">Actual: {formatDateTime(modal.start, tz)} con {modal.employeeId?.name}. Puedes elegir otro profesional que ofrezca el mismo servicio.</p>
          <BookingForm api={api} mode="reschedule" appointment={{ ...modal, serviceId: modal.serviceId?._id, employeeId: modal.employeeId?._id }}
            services={catalogs.services} employees={catalogs.employees} timeZone={tz}
            onDone={() => { setModal(null); toast.success('Cita reprogramada'); load(); }}
            onCancel={() => { setModal(null); load(); }} />
        </Modal>
      )}
    </section>
  );
}
