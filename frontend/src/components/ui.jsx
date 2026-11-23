import React, { useEffect } from 'react';
import { toast } from 'react-toastify';
import { STATUS, NOTIFICATION, notificationText } from '../lib/appointments.js';

export function StatusBadge({ status }) {
  const meta = STATUS[status] || { label: status, color: '#334155', bg: '#e2e8f0' };
  return <span className="badge" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>;
}

/** Estado de la confirmación por correo de una cita (HU-04-E1). */
export function NotificationBadge({ notification }) {
  const meta = notification?.status && NOTIFICATION[notification.status];
  if (!meta) return null;
  return <span className={`mail mail-${meta.tone}`} title={notificationText(notification)}>✉ {meta.short}</span>;
}

export function ActiveBadge({ active }) {
  return active === false ? <span className="badge badge-off">Inactivo</span> : <span className="badge badge-on">Activo</span>;
}

export function Loading({ text = 'Cargando…' }) {
  return <div className="state state-loading" role="status"><span className="spinner" aria-hidden="true" />{text}</div>;
}

export function EmptyState({ title, children }) {
  return <div className="state state-empty"><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <strong>{message}</strong>
      {onRetry && <button type="button" onClick={onRetry}>Reintentar</button>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head"><h2>{title}</h2><button type="button" className="icon" onClick={onClose} aria-label="Cerrar">✕</button></header>
        {children}
      </section>
    </div>
  );
}

export function FormError({ message }) {
  return message ? <p className="form-error" role="alert">{message}</p> : null;
}

/** Muestra el error de la API salvo que ya se haya avisado del cierre de sesión. */
export function notifyError(err) {
  if (!err?.sessionEnded) toast.error(err?.message || 'Ocurrió un error inesperado');
}
