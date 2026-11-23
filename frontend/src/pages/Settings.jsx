import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { ErrorState, FormError, Loading } from '../components/ui.jsx';

/** Configuración de la organización: plazo mínimo de reprogramación (HU-05-E3). */
export default function Settings({ api, onSaved }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [error, setError] = useState(null);

  async function load() {
    try {
      setState({ loading: false, error: null, data: await api('/settings') });
    } catch (err) {
      if (!err.sessionEnded) setState({ loading: false, error: err.message, data: null });
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e) {
    e.preventDefault();
    setError(null);
    const hours = Number(new FormData(e.currentTarget).get('hours'));
    try {
      const data = await api('/settings', { method: 'PATCH', body: JSON.stringify({ rescheduleMinHours: hours }) });
      setState((s) => ({ ...s, data }));
      toast.success('Configuración guardada');
      onSaved();
    } catch (err) {
      if (!err.sessionEnded) setError(err.message);
    }
  }

  if (state.loading) return <Loading />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;
  const d = state.data;
  return (
    <section className="panel narrow">
      <dl className="facts">
        <dt>Organización</dt><dd>{d.name}</dd>
        <dt>Código para iniciar sesión</dt><dd><code>{d.code || '—'}</code></dd>
        <dt>Zona horaria</dt><dd>{d.timezone}</dd>
      </dl>
      <form onSubmit={save} noValidate>
        <label>Plazo mínimo para que un cliente reprograme (horas)
          <input name="hours" type="number" min="0" max="72" step="1" defaultValue={d.rescheduleMinHours} />
        </label>
        <p className="muted">Un cliente no podrá reprogramar una cita que empieza antes de este plazo. El personal puede reprogramar sin restricción.</p>
        <FormError message={error} />
        <div className="actions"><button className="primary">Guardar</button></div>
      </form>
    </section>
  );
}
