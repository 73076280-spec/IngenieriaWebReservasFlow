import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorState, Loading } from '../components/ui.jsx';

const PERIODS = { mes: 'Mes actual', trimestre: 'Último trimestre', anio: 'Últimos 12 meses' };

/** Panel de control con indicadores por periodo (HU-13). Solo administrador. */
export default function Dashboard({ api, goTo }) {
  const [period, setPeriod] = useState('mes');
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const seq = useRef(0);
  const load = useCallback(async () => {
    // HU-13-E3: al recargar se descartan los datos anteriores para no mostrar indicadores obsoletos,
    // y solo se acepta la respuesta del último periodo solicitado.
    const id = ++seq.current;
    setState({ loading: true, error: null, data: null });
    try {
      const data = await api('/dashboard?period=' + period);
      if (id === seq.current) setState({ loading: false, error: null, data });
    } catch (err) {
      if (!err.sessionEnded && id === seq.current) setState({ loading: false, error: err.message, data: null });
    }
  }, [api, period]);
  useEffect(() => { load(); }, [load]);

  const d = state.data;
  const max = Math.max(1, ...(d?.topServices || []).map((s) => s.count));
  return (
    <section>
      <div className="toolbar">
        <label className="inline">Periodo
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {Object.entries(PERIODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {d && <p className="muted">Del {new Date(d.range.from).toLocaleDateString('es-PE')} al {new Date(new Date(d.range.to).getTime() - 1).toLocaleDateString('es-PE')}</p>}
      </div>
      {state.loading && <Loading text="Calculando indicadores…" />}
      {state.error && <ErrorState message={state.error} onRetry={load} />}
      {d && (
        <>
          {d.message && (
            <div className={'banner' + (d.hasAppointments ? '' : ' banner-welcome')}>
              <strong>{d.message}</strong>
              {!d.hasAppointments && <button className="primary" onClick={() => goTo('citas')}>Registrar la primera cita</button>}
            </div>
          )}
          <div className="cards">
            <article><small>Citas del periodo</small><strong>{d.total}</strong></article>
            <article><small>Programadas y confirmadas</small><strong>{d.scheduled}</strong></article>
            <article><small>Atendidas (completadas)</small><strong>{d.attended}</strong></article>
            <article><small>Canceladas · No asistió</small><strong>{d.byStatus.cancelada} · {d.byStatus.no_asistio}</strong></article>
          </div>
          <div className="cards cards-wide">
            <article>
              <small>Servicio más solicitado</small>
              <h3>{d.topService ? `${d.topService.name} (${d.topService.count})` : 'Sin datos'}</h3>
              <ul className="bars">
                {d.topServices.map((s) => (
                  <li key={s._id}><span>{s.name}</span><span className="bar" aria-hidden="true"><i style={{ width: `${(s.count / max) * 100}%` }} /></span><b>{s.count}</b></li>
                ))}
              </ul>
            </article>
            <article>
              <small>Clientes frecuentes (top 3)</small>
              {d.topClients.length === 0 ? <h3>Sin datos</h3> : (
                <ol className="ranking">{d.topClients.map((c) => <li key={c._id}><span>{c.name}</span><b>{c.count} {c.count === 1 ? 'reserva' : 'reservas'}</b></li>)}</ol>
              )}
            </article>
            <article>
              <small>Cancelaciones por motivo</small>
              {d.cancellationsByReason.length === 0 ? <h3>Sin cancelaciones</h3> : (
                <ul className="ranking">{d.cancellationsByReason.map((r) => <li key={r.reason}><span>{r.label}</span><b>{r.count}</b></li>)}</ul>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
