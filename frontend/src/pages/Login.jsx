import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { publicPost } from '../api/client.js';
import { escapeHtml } from '../components/BookingForm.jsx';
import { FormError } from '../components/ui.jsx';

/** Inicio de sesión por código de organización y alta de una organización nueva (HU-15). */
export default function Login({ apiUrl, onLogin }) {
  const [register, setRegister] = useState(false);
  const [orgCode, setOrgCode] = useState(() => { try { return localStorage.getItem('rf_org') || ''; } catch { return ''; } });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    const data = Object.fromEntries(new FormData(ev.currentTarget));
    try {
      const result = await publicPost(apiUrl, '/auth/' + (register ? 'register' : 'login'), data);
      const code = result.organizationCode || result.organizationId;
      try { localStorage.setItem('rf_org', code); } catch { /* almacenamiento no disponible */ }
      if (register) await Swal.fire({ title: 'Organización creada', html: `Código para iniciar sesión:<br><b>${escapeHtml(code)}</b><br><small>Compártelo con tu equipo.</small>`, icon: 'success' });
      onLogin(result.token);
    } catch (err) {
      // HU-15-E3, HU-14-E4, HU-11-E4: el mensaje del servidor explica el motivo sin revelar datos.
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authWrap">
      <section className="authCard">
        <div className="logo">✦ ReservaFlow</div>
        <h1>{register ? 'Crea tu organización' : 'Inicia sesión'}</h1>
        <p>Gestión SaaS de reservas para clínicas, barberías, talleres y más.</p>
        <form onSubmit={submit}>
          {register ? <>
            <label>Organización<input name="organization" required minLength="2" placeholder="Ej. Clínica Dental Sonrisa Real" /></label>
            <label>Tu nombre<input name="name" required minLength="2" autoComplete="name" /></label>
          </> : (
            <label>Código de organización<input name="organization" required value={orgCode} onChange={(e) => setOrgCode(e.target.value)} placeholder="Ej. clinica-dental-sonrisa-real" autoComplete="organization" /></label>
          )}
          <label>Correo<input type="email" name="email" required autoComplete="email" /></label>
          <label>Contraseña<input type="password" name="password" required minLength={register ? 10 : 1} autoComplete={register ? 'new-password' : 'current-password'} /></label>
          <FormError message={error} />
          <button className="primary" disabled={busy}>{busy ? 'Procesando…' : register ? 'Crear organización' : 'Ingresar'}</button>
        </form>
        <button className="link" onClick={() => { setRegister(!register); setError(null); }}>{register ? 'Ya tengo cuenta' : 'Crear organización y administrador'}</button>
      </section>
    </div>
  );
}
