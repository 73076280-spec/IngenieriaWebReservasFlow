import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import { EmptyState, ErrorState, FormError, Loading, Modal, notifyError } from '../components/ui.jsx';

export const ROLE_LABEL = { admin: 'Administrador', recepcionista: 'Recepcionista', profesional: 'Profesional', cliente: 'Cliente' };

/** Cuentas y roles (HU-11-E1, E2, E4). Solo con el permiso users:manage. */
export default function Users({ api, me, employees, clients }) {
  const [state, setState] = useState({ loading: true, error: null, users: [], notes: [] });
  const [show, setShow] = useState(false);
  const [role, setRole] = useState('recepcionista');
  const [formError, setFormError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [users, notes] = await Promise.all([api('/users'), api('/notifications')]);
      setState({ loading: false, error: null, users, notes });
    } catch (err) {
      if (!err.sessionEnded) setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [api]);
  useEffect(() => { refresh(); }, [refresh]);

  async function create(e) {
    e.preventDefault();
    setFormError(null);
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (!d.role) d.role = null;
    for (const k of ['employeeId', 'clientId']) if (!d[k]) delete d[k];
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(d) });
      toast.success(d.role ? 'Cuenta creada' : 'Cuenta creada sin rol: quedará pendiente de configuración');
      setShow(false);
      refresh();
    } catch (err) {
      if (!err.sessionEnded) setFormError(err.message);
    }
  }

  async function changeRole(u, next) {
    if (!next) return;
    let extra = {};
    if (next === 'profesional' && employees.length) {
      const r = await Swal.fire({ title: 'Perfil de profesional', text: 'Vincula la cuenta con su perfil para que vea su agenda.', input: 'select', inputOptions: Object.fromEntries(employees.map((x) => [x._id, x.name])), showCancelButton: true });
      if (!r.isConfirmed) return;
      extra = { employeeId: r.value };
    }
    try {
      await api(`/users/${u._id}/role`, { method: 'PATCH', body: JSON.stringify({ role: next, ...extra }) });
      toast.success('Rol actualizado: se aplica desde la siguiente acción del usuario');
      refresh();
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <section className="panel">
      {state.notes.length > 0 && (
        <div className="banner banner-warn" role="status">
          <strong>Avisos pendientes</strong>
          {state.notes.map((n) => <p key={n._id}>⚠ {n.message}</p>)}
        </div>
      )}
      <div className="toolbar">
        <p className="muted">{state.users.length} cuentas</p>
        <button className="primary" onClick={() => setShow(true)}>+ Nueva cuenta</button>
      </div>
      {state.loading && <Loading />}
      {state.error && <ErrorState message={state.error} onRetry={refresh} />}
      {!state.loading && state.users.length === 0 && <EmptyState title="Sin cuentas" />}
      {state.users.length > 0 && (
        <div className="scroll">
          <table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Vínculo</th><th>Cambiar rol</th></tr></thead>
            <tbody>
              {state.users.map((u) => (
                <tr key={u._id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className={'badge ' + (u.role ? 'badge-on' : 'badge-warn')}>{ROLE_LABEL[u.role] || 'Pendiente'}</span></td>
                  <td>{employees.find((e) => e._id === u.employeeId)?.name || clients.find((c) => c._id === u.clientId)?.name || '—'}</td>
                  <td>
                    {String(u._id) === String(me.id) ? <span className="muted">Tu cuenta</span> : (
                      <select defaultValue="" aria-label={`Cambiar rol de ${u.name}`} onChange={(e) => { changeRole(u, e.target.value); e.target.value = ''; }}>
                        <option value="">Seleccionar</option>
                        {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {show && (
        <Modal title="Nueva cuenta" onClose={() => setShow(false)}>
          <form onSubmit={create} noValidate>
            <div className="form-grid">
              <label>Nombre<input name="name" required minLength="2" /></label>
              <label>Correo<input name="email" type="email" required /></label>
              <label>Contraseña inicial<input name="password" type="password" required minLength="10" placeholder="Mínimo 10 caracteres" /></label>
              <label>Rol
                <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">Sin rol (pendiente)</option>
                  {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              {role === 'profesional' && (
                <label>Perfil de profesional
                  <select name="employeeId" defaultValue=""><option value="">—</option>{employees.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>
                </label>
              )}
              {role === 'cliente' && (
                <label>Ficha de cliente
                  <select name="clientId" defaultValue=""><option value="">Crear o vincular por correo</option>{clients.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>
                </label>
              )}
            </div>
            <FormError message={formError} />
            <div className="actions"><button type="button" onClick={() => setShow(false)}>Cancelar</button><button className="primary">Crear cuenta</button></div>
          </form>
        </Modal>
      )}
    </section>
  );
}
