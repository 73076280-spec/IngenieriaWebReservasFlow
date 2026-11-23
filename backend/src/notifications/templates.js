import { DEFAULT_TZ } from '../utils/time.js';

// Plantillas de correo. Todo dato ingresado por usuarios se escapa antes de insertarse en HTML.
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Código de reserva legible: últimos 8 caracteres del identificador de la cita. */
export const confirmationCode = (id) => String(id).slice(-8).toUpperCase();

const fmt = (date, tz, opts) => new Date(date).toLocaleString('es-PE', { timeZone: tz, ...opts });

/** Confirmación de reserva (HU-04-E1): asunto, HTML y texto plano. */
export function bookingConfirmationEmail({ organization, client, service, employee, appointment }) {
  const tz = organization?.timezone || DEFAULT_TZ;
  const code = confirmationCode(appointment._id);
  const orgName = organization?.name || 'ReservaFlow';
  const day = fmt(appointment.start, tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = (d) => fmt(d, tz, { hour: '2-digit', minute: '2-digit', hour12: false });
  const hours = `${time(appointment.start)} – ${time(appointment.end)}`;
  const price = typeof appointment.priceSnapshot === 'number' ? `S/ ${appointment.priceSnapshot.toFixed(2)}` : '—';
  const rows = [
    ['Código de reserva', code],
    ['Servicio', service?.name || '—'],
    ['Profesional', employee?.name || '—'],
    ['Fecha', day],
    ['Horario', `${hours} (hora de ${tz})`],
    ['Duración', service?.duration ? `${service.duration} minutos` : '—'],
    ['Precio', price],
    ['Estado', 'Programada'],
  ];
  const subject = `Confirmación de tu cita ${code} · ${orgName}`;
  const text = [
    `Hola ${client?.name || ''},`,
    '',
    `Tu cita en ${orgName} quedó registrada.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    organization?.code ? `Para reprogramar o cancelar, ingresa a ReservaFlow con el código de organización "${organization.code}".` : 'Para reprogramar o cancelar, ingresa a ReservaFlow.',
    '',
    'Este mensaje se generó automáticamente; no es necesario responderlo.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f4f7f9;font-family:Segoe UI,Arial,sans-serif;color:#172c38">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2eaec;border-radius:14px;overflow:hidden">
    <tr><td style="background:#0f766e;color:#ffffff;padding:20px 24px">
      <div style="font-size:13px;letter-spacing:1px;opacity:.85">✦ RESERVAFLOW</div>
      <div style="font-size:21px;font-weight:700;margin-top:4px">Tu cita está confirmada</div>
      <div style="font-size:14px;opacity:.9;margin-top:2px">${escapeHtml(orgName)}</div>
    </td></tr>
    <tr><td style="padding:22px 24px">
      <p style="margin:0 0 14px">Hola <strong>${escapeHtml(client?.name || '')}</strong>, tu reserva quedó registrada con estos datos:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #edf1f2;color:#50696f;width:42%">${escapeHtml(k)}</td><td style="padding:8px 0;border-bottom:1px solid #edf1f2;font-weight:600">${escapeHtml(v)}</td></tr>`).join('\n        ')}
      </table>
      <p style="margin:18px 0 0;font-size:13px;color:#50696f">${organization?.code
        ? `Para reprogramar o cancelar, ingresa a ReservaFlow con el código de organización <strong>${escapeHtml(organization.code)}</strong>.`
        : 'Para reprogramar o cancelar, ingresa a ReservaFlow.'}</p>
    </td></tr>
    <tr><td style="padding:14px 24px;background:#f8fbfb;font-size:12px;color:#50696f">Este mensaje se generó automáticamente; no es necesario responderlo.</td></tr>
  </table>
</body></html>`;
  return { subject, text, html, code };
}
