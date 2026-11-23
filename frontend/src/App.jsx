import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import { createApiClient } from './api/client.js';
import { ErrorState, Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Agenda from './pages/Agenda.jsx';
import Appointments from './pages/Appointments.jsx';
import Catalog from './pages/Catalog.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users, { ROLE_LABEL } from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import { BookPage, MyAppointmentsPage } from './pages/ClientPortal.jsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const EMPTY = { clients: [], employees: [], services: [] };
// Sección inicial según el rol (HU-15-E1).
const ROLE_HOME = { admin: 'reportes', recepcionista: 'citas', profesional: 'agenda', cliente: 'reservar' };
// [página, título, condición sobre el perfil y sus permisos]
const MENU = [
  ['reportes', 'Indicadores', (me, can) => can('dashboard:read')],
  ['reservar', 'Reservar cita', (me) => me.role === 'cliente'],
  ['mis-citas', 'Mis citas', (me) => me.role === 'cliente'],
  ['agenda', 'Calendario', (me, can) => me.role !== 'cliente' && can('appointments:read')],
  ['citas', 'Citas', (me, can) => me.role !== 'cliente' && can('appointments:read')],
  ['clients', 'Clientes', (me, can) => can('clients:read')],
  ['employees', 'Profesionales', (me) => me.role !== 'cliente'],
  ['services', 'Servicios', (me) => me.role !== 'cliente'],
  ['usuarios', 'Usuarios', (me, can) => can('users:manage')],
  ['configuracion', 'Configuración', (me, can) => can('settings:manage')],
];

function readToken() {
  try { return sessionStorage.getItem('rf_token') || ''; } catch { return ''; }
}

export default function App() {
  const [token, setToken] = useState(readToken);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [me, setMe] = useState(null);
  const [page, setPage] = useState(null);
  const [pageFilters, setPageFilters] = useState({});
  const [catalogs, setCatalogs] = useState(EMPTY);
  const [state, setState] = useState({ loading: false, error: null });

  const clearSession = useCallback(() => {
    try { sessionStorage.removeItem('rf_token'); } catch { /* sin almacenamiento */ }
    tokenRef.current = '';
    meRef.current = null;
    setToken('');
    setMe(null);
    setPage(null);
    setCatalogs(EMPTY);
  }, []);
  // Toda respuesta 401 (o 403 de organización/cuenta) cierra la sesión y pide un nuevo inicio de sesión (HU-15-E4).
  const api = useMemo(() => createApiClient({ baseUrl: API, getToken: () => tokenRef.current, onSessionEnd: (msg) => { clearSession(); toast.warn(msg, { toastId: 'session-end' }); } }), [clearSession]);
  const can = useCallback((p) => Boolean(me?.permissions?.includes(p)), [me]);

  // El perfil vigente se lee de una referencia: así las funciones de carga son estables y el
  // efecto de sesión no se vuelve a ejecutar cada vez que llega un perfil nuevo.
  const meRef = useRef(null);
  const loadCatalogs = useCallback(async (profile = meRef.current) => {
    if (!profile) return;
    const has = (p) => profile.permissions.includes(p);
    const keys = ['clients', 'employees', 'services'];
    const data = await Promise.all(keys.map((k) => (has(k + ':read') ? api('/' + k) : [])));
    setCatalogs(Object.fromEntries(keys.map((k, i) => [k, data[i]])));
  }, [api]);

  const loadSession = useCallback(async () => {
    if (!tokenRef.current) return;
    setState({ loading: true, error: null });
    try {
      const profile = await api('/me');
      meRef.current = profile;
      setMe(profile);
      setPage((p) => p || ROLE_HOME[profile.role] || 'agenda');
      await loadCatalogs(profile);
      setState({ loading: false, error: null });
    } catch (err) {
      if (!err.sessionEnded) setState({ loading: false, error: err.message });
    }
  }, [api, loadCatalogs]);

  useEffect(() => { if (token) loadSession(); }, [token, loadSession]);

  function login(newToken) {
    try { sessionStorage.setItem('rf_token', newToken); } catch { /* sin almacenamiento */ }
    setToken(newToken);
    toast.success('Sesión iniciada');
  }
  // HU-15-E2: invalida el token en el servidor antes de limpiar la sesión local.
  async function signout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* la sesión local se cierra igualmente */ }
    clearSession();
    toast.info('Sesión cerrada');
  }
  function goTo(target, filters = {}) {
    setPageFilters(filters);
    setPage(target);
  }

  // Un único contenedor de avisos: el de "sesión expirada" se ve también en la pantalla de acceso (HU-15-E4).
  return <><ToastContainer position="bottom-right" limit={3} autoClose={3500} newestOnTop />{token ? renderLayout() : <Login apiUrl={API} onLogin={login} />}</>;

  function renderLayout() {
  const menu = me ? MENU.filter(([, , show]) => show(me, can)) : [];
  const title = menu.find(([p]) => p === page)?.[1] || 'Panel';
  const props = { api, me, can, goTo };
  const catalogPerms = (k) => ({ write: can(k + ':write'), delete: can(k + ':delete') });

  return (
    <div className="layout">
      <aside>
        <div className="logo">✦ ReservaFlow</div>
        <div className="tenant">{me?.tenant.name || 'Organización'}<small>{me ? `${me.name} · ${ROLE_LABEL[me.role]}` : ''}{me?.tenant.code ? ` · ${me.tenant.code}` : ''}</small></div>
        <nav aria-label="Secciones">{menu.map(([id, label]) => <button className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} key={id} onClick={() => goTo(id)}>{label}</button>)}</nav>
        <button className="logout" onClick={signout}>Cerrar sesión</button>
      </aside>
      <main>
        <header><div><small>PLATAFORMA DE RESERVAS</small><h1>{title}</h1></div><span className="avatar" aria-hidden="true">{me?.tenant.name.slice(0, 1) || 'R'}</span></header>
        {state.loading && !me && <Loading text="Cargando tu espacio de trabajo…" />}
        {state.error && <ErrorState message={state.error} onRetry={loadSession} />}
        {me && <>
          {page === 'reportes' && <Dashboard {...props} />}
          {page === 'reservar' && <BookPage {...props} catalogs={catalogs} />}
          {page === 'mis-citas' && <MyAppointmentsPage {...props} catalogs={catalogs} />}
          {page === 'agenda' && <Agenda {...props} employees={catalogs.employees} />}
          {page === 'citas' && <Appointments key={JSON.stringify(pageFilters)} {...props} catalogs={catalogs} initialFilters={pageFilters} />}
          {['clients', 'employees', 'services'].includes(page) && (
            <Catalog key={page} kind={page} api={api} data={catalogs[page]} loading={state.loading} services={catalogs.services}
              perms={catalogPerms(page)} reload={() => loadCatalogs()} goTo={goTo} />
          )}
          {page === 'usuarios' && <Users {...props} employees={catalogs.employees} clients={catalogs.clients} />}
          {page === 'configuracion' && <Settings api={api} onSaved={loadSession} />}
        </>}
      </main>
    </div>
  );
  }
}
