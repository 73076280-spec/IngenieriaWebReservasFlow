import React, { useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import { DAYS, WEEK_ORDER, DEFAULT_SCHEDULE, toEditor, fromEditor, describeSchedule } from '../lib/schedule.js';
import { formatDateTime, money } from '../lib/appointments.js';
import { escapeHtml } from '../components/BookingForm.jsx';
import { ActiveBadge, EmptyState, ErrorState, FormError, Loading, Modal, StatusBadge, notifyError } from '../components/ui.jsx';

const TITLES = { clients: 'cliente', employees: 'profesional', services: 'servicio' };
const COLUMNS = {
  clients: [['name', 'Nombre'], ['phone', 'Teléfono'], ['email', 'Correo'], ['notes', 'Notas']],
  employees: [['name', 'Nombre'], ['specialty', 'Especialidad'], ['schedule', 'Horario'], ['serviceIds', 'Servicios'], ['active', 'Estado']],
  services: [['name', 'Servicio'], ['duration', 'Duración'], ['price', 'Costo'], ['active', 'Estado']],
};

/** Gestión de clientes, profesionales y servicios (HU-01, HU-02, HU-03). */
export default function Catalog({ kind, api, data, loading, services, perms, reload, goTo }) {
  const [editing, setEditing] = useState(null); // null | 'new' | registro
  const [filter, setFilter] = useState('');
  const [history, setHistory] = useState(null);
  const serviceName = useMemo(() => Object.fromEntries(services.map((s) => [s._id, s.name])), [services]);
  const rows = data.filter((r) => [r.name, r.email, r.phone, r.specialty].join(' ').toLowerCase().includes(filter.toLowerCase()));

  function cell(row, key) {
    if (key === 'active') return <ActiveBadge active={row.active} />;
    if (key === 'schedule') return describeSchedule(row.schedule);
    if (key === 'serviceIds') return row.serviceIds?.length ? row.serviceIds.map((id) => serviceName[id] || '—').join(', ') : 'Todos';
    if (key === 'duration') return `${row.duration} min`;
    if (key === 'price') return money(row.price);
    if (key === 'notes') return <span className="clip" title={row.notes}>{row.notes || '—'}</span>;
    return row[key] || '—';
  }

  async function remove(row) {
    const ok = await Swal.fire({ icon: 'warning', title: `¿Eliminar ${TITLES[kind]}?`, text: `${row.name} se eliminará definitivamente.`, showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Volver', confirmButtonColor: '#b91c1c' });
    if (!ok.isConfirmed) return;
    try {
      await api(`/${kind}/${row._id}`, { method: 'DELETE' });
      toast.success('Registro eliminado');
      reload();
    } catch (err) {
      await explainConflict(err, row);
    }
  }

  // Advertencias accionables (HU-01-E4, HU-02-E4, HU-03-E4).
  async function explainConflict(err, row) {
    if (err.code === 'HAS_ACTIVE_APPOINTMENTS' || err.code === 'HAS_FUTURE_APPOINTMENTS') {
      const r = await Swal.fire({ icon: 'warning', title: 'Tiene citas pendientes', html: `${escapeHtml(err.message)}<br><br>Citas pendientes: <b>${err.details?.count ?? '—'}</b>`, showCancelButton: true, confirmButtonText: 'Ver sus citas', cancelButtonText: 'Cerrar' });
      if (r.isConfirmed) goTo('citas', kind === 'clients' ? { q: row.name } : { employeeId: row._id });
      return;
    }
    if (err.code === 'HAS_APPOINTMENTS' && err.details?.suggestion === 'deactivate') {
      const r = await Swal.fire({ icon: 'info', title: 'No se puede eliminar', text: err.message, showCancelButton: true, confirmButtonText: 'Desactivar', cancelButtonText: 'Cerrar' });
      if (r.isConfirmed) await toggle(row, false);
      return;
    }
    if (err.status === 409) { await Swal.fire({ icon: 'info', title: 'No se puede eliminar', text: err.message }); return; }
    notifyError(err);
  }

  async function toggle(row, active) {
    try {
      await api(`/${kind}/${row._id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
      toast.success(active ? 'Activado' : 'Desactivado');
      reload();
    } catch (err) {
      await explainConflict(err, row);
    }
  }

  async function openHistory(row) {
    setHistory({ loading: true, client: row });
    try {
      setHistory({ loading: false, ...(await api(`/clients/${row._id}/history`)) });
    } catch (err) {
      if (!err.sessionEnded) setHistory({ loading: false, client: row, error: err.message });
    }
  }

  const canDeactivate = kind !== 'clients' && perms.write;
  return (
    <section className="panel">
      <div className="toolbar">
        <input className="search" placeholder={`Buscar ${TITLES[kind]}…`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar" />
        {perms.write && <button className="primary" onClick={() => setEditing('new')}>+ Nuevo {TITLES[kind]}</button>}
      </div>
      {loading && data.length === 0 && <Loading />}
      {!(loading && data.length === 0) && rows.length === 0 && (
        <EmptyState title={filter ? 'Sin coincidencias' : `Aún no hay ${TITLES[kind]}s registrados`}>{!filter && perms.write ? 'Usa el botón «Nuevo» para registrar el primero.' : null}</EmptyState>
      )}
      {rows.length > 0 && (
        <div className="scroll">
          <table>
            <thead><tr>{COLUMNS[kind].map(([k, l]) => <th key={k}>{l}</th>)}<th>Acciones</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className={row.active === false ? 'row-off' : ''}>
                  {COLUMNS[kind].map(([k]) => <td key={k}>{cell(row, k)}</td>)}
                  <td className="row-actions">
                    {kind === 'clients' && <button onClick={() => openHistory(row)}>Historial</button>}
                    {perms.write && <button onClick={() => setEditing(row)}>Editar</button>}
                    {canDeactivate && <button onClick={() => toggle(row, row.active === false)}>{row.active === false ? 'Activar' : 'Desactivar'}</button>}
                    {perms.delete && <button className="danger" onClick={() => remove(row)}>Eliminar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={editing === 'new' ? `Nuevo ${TITLES[kind]}` : `Editar ${TITLES[kind]}`} wide={kind === 'employees'} onClose={() => setEditing(null)}>
          <CatalogForm kind={kind} api={api} record={editing === 'new' ? null : editing} services={services} onSaved={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {history && (
        <Modal title={`Historial · ${history.client?.name || ''}`} wide onClose={() => setHistory(null)}>
          {history.loading && <Loading />}
          {history.error && <ErrorState message={history.error} />}
          {history.summary && <ClientHistory data={history} />}
        </Modal>
      )}
    </section>
  );
}

function ClientHistory({ data }) {
  const s = data.summary;
  return (
    <>
      <div className="mini-cards">
        <article><small>Total</small><strong>{s.total}</strong></article>
        <article><small>Completadas</small><strong>{s.completada}</strong></article>
        <article><small>No asistió</small><strong>{s.no_asistio}</strong></article>
        <article><small>Canceladas</small><strong>{s.cancelada}</strong></article>
      </div>
      {data.client?.notes && <p className="notice">Notas de atención: {data.client.notes}</p>}
      {data.appointments.length === 0 ? <EmptyState title="El cliente aún no tiene citas" /> : (
        <div className="scroll"><table>
          <thead><tr><th>Fecha</th><th>Servicio</th><th>Profesional</th><th>Estado</th></tr></thead>
          <tbody>{data.appointments.map((a) => <tr key={a._id}><td>{formatDateTime(a.start)}</td><td>{a.serviceId?.name}</td><td>{a.employeeId?.name}</td><td><StatusBadge status={a.status} /></td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}

/** Formulario de alta y edición con los mensajes de validación del servidor. */
function CatalogForm({ kind, api, record, services, onSaved, onCancel }) {
  const [rows, setRows] = useState(() => toEditor(record ? record.schedule : DEFAULT_SCHEDULE));
  const [serviceIds, setServiceIds] = useState(record?.serviceIds || []);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const specialties = useMemo(() => ['Odontología general', 'Ortodoncia', 'Barbería', 'Estilismo', 'Mecánica general', 'Electricidad automotriz'], []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    let body;
    if (kind === 'clients') body = { name: raw.name, email: raw.email.trim(), phone: raw.phone.trim(), notes: raw.notes };
    if (kind === 'services') body = { name: raw.name, duration: Number(raw.duration), price: Number(raw.price) };
    if (kind === 'employees') {
      const { schedule, error: scheduleError } = fromEditor(rows);
      if (scheduleError) return setError(scheduleError);
      body = { name: raw.name, specialty: raw.specialty, serviceIds, schedule };
    }
    setSaving(true);
    try {
      await api(`/${kind}${record ? '/' + record._id : ''}`, { method: record ? 'PUT' : 'POST', body: JSON.stringify(body) });
      toast.success(record ? 'Cambios guardados' : 'Registro creado');
      onSaved();
    } catch (err) {
      if (!err.sessionEnded) setError(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  const setRow = (day, patch) => setRows((rs) => rs.map((r) => (r.day === day ? { ...r, ...patch } : r)));
  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <label>Nombre<input name="name" defaultValue={record?.name || ''} required minLength={2} maxLength={120} /></label>
        {kind === 'clients' && <>
          <label>Teléfono<input name="phone" defaultValue={record?.phone || ''} inputMode="tel" placeholder="987 654 321" /></label>
          <label>Correo electrónico<input name="email" type="email" defaultValue={record?.email || ''} placeholder="cliente@correo.com" /></label>
          <label className="span-all">Notas de atención<textarea name="notes" defaultValue={record?.notes || ''} maxLength={1000} rows={3} placeholder="Preferencias, alergias, observaciones…" /></label>
        </>}
        {kind === 'services' && <>
          <label>Duración (minutos)<input name="duration" type="number" step="15" defaultValue={record?.duration ?? 30} /></label>
          <label>Costo (S/)<input name="price" type="number" step="0.01" min="0" defaultValue={record?.price ?? ''} /></label>
        </>}
        {kind === 'employees' && <label>Especialidad
          <input name="specialty" list="specialties" defaultValue={record?.specialty || ''} placeholder="Seleccione o escriba" />
          <datalist id="specialties">{specialties.map((s) => <option key={s} value={s} />)}</datalist>
        </label>}
      </div>
      {kind === 'employees' && <>
        <fieldset className="checks">
          <legend>Servicios que atiende <small>(sin marcar = todos)</small></legend>
          {services.map((s) => (
            <label key={s._id} className="check"><input type="checkbox" checked={serviceIds.includes(s._id)}
              onChange={(e) => setServiceIds((ids) => (e.target.checked ? [...ids, s._id] : ids.filter((x) => x !== s._id)))} />{s.name}</label>
          ))}
        </fieldset>
        <fieldset className="schedule">
          <legend>Horario laboral</legend>
          {WEEK_ORDER.map((day) => {
            const r = rows[day];
            return (
              <div className="schedule-row" key={day}>
                <label className="check"><input type="checkbox" checked={r.enabled} onChange={(e) => setRow(day, { enabled: e.target.checked })} />{DAYS[day]}</label>
                <input type="time" step="900" aria-label={`Inicio ${DAYS[day]}`} value={r.start} disabled={!r.enabled} onChange={(e) => setRow(day, { start: e.target.value })} />
                <span>a</span>
                <input type="time" step="900" aria-label={`Fin ${DAYS[day]}`} value={r.end} disabled={!r.enabled} onChange={(e) => setRow(day, { end: e.target.value })} />
              </div>
            );
          })}
        </fieldset>
      </>}
      <FormError message={error} />
      <div className="actions">
        <button type="button" onClick={onCancel}>Cancelar</button>
        <button className="primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}
