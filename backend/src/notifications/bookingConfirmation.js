import { conflict, notFound } from '../errors/AppError.js';
import { MESSAGES } from '../errors/messages.js';
import { bookingConfirmationEmail } from './templates.js';

// "enviada" queda reservado para un proveedor real (no incluido); aquí el correo es "simulada".
export const NOTIFICATION_STATUS = ['pendiente', 'enviada', 'simulada', 'fallida', 'sin_correo', 'desactivada'];
const RETRYABLE = ['fallida', 'sin_correo'];

/** Estado público de la notificación. */
export const publicNotification = (n) =>
  n?.status ? { status: n.status, to: n.to ?? null, attempts: n.attempts ?? 0, sentAt: n.sentAt ?? null, transport: n.transport ?? null, error: n.lastError ?? null } : null;

// Solo códigos propios (p. ej. ESIMULATED): nunca textos internos del error.
const safeCode = (err) => (typeof err?.code === 'string' && /^E[A-Z]{2,20}$/.test(err.code) ? err.code : 'ERROR');

/**
 * Confirmación de reservas por correo (HU-04-E1). Cada confirmación se reserva de forma atómica
 * (sin duplicados), los datos se leen con repositorios acotados por organización y un fallo
 * del correo nunca afecta a la cita: solo deja la notificación en estado "fallida".
 */
export function createBookingNotifier({ repos, mailer, logger = console }) {
  return {
    async confirm(auth, appointmentId, { retry = false } = {}) {
      const tid = auth.tenantId;
      const appointments = repos.appointments.forTenant(tid);
      const claimFilter = retry
        ? { _id: appointmentId, 'notification.status': { $in: RETRYABLE } }
        : { _id: appointmentId, 'notification.status': { $exists: false } };
      const claimed = await appointments.findOneAndUpdate(claimFilter, { 'notification.status': 'pendiente' });
      if (!claimed) {
        const current = await appointments.findById(appointmentId).lean();
        if (!current) throw notFound('Cita no encontrada');
        if (retry) throw conflict(MESSAGES.CONFIRMATION_NOT_RETRYABLE, 'CONFIRMATION_ALREADY_SENT', { notification: publicNotification(current.notification) });
        return publicNotification(current.notification);
      }

      const attempts = (claimed.notification?.attempts || 0) + 1;
      const save = async (fields) => {
        const data = Object.fromEntries(Object.entries({ ...fields, attempts, transport: mailer.transport }).map(([k, v]) => ['notification.' + k, v]));
        const doc = await appointments.updateById(appointmentId, data);
        return publicNotification(doc?.notification);
      };

      let to = null;
      try {
        if (!mailer.enabled) return await save({ status: 'desactivada' });
        const [client, service, employee] = await Promise.all([
          repos.clients.forTenant(tid).findById(claimed.clientId).lean(),
          repos.services.forTenant(tid).findById(claimed.serviceId).lean(),
          repos.employees.forTenant(tid).findById(claimed.employeeId).lean(),
        ]);
        if (!client?.email) return await save({ status: 'sin_correo', to: null });
        to = client.email;
        const email = bookingConfirmationEmail({ organization: auth.tenant, client, service, employee, appointment: claimed });
        const sent = await mailer.send({ to, subject: email.subject, text: email.text, html: email.html, reference: String(appointmentId) });
        // Modo de prueba: el correo se genera en la bandeja local; no se envía un correo real.
        return await save({ status: 'simulada', to, sentAt: new Date(), messageId: sent.messageId, lastError: null });
      } catch (err) {
        const code = safeCode(err);
        logger.error?.(`[correo] La confirmación de la cita ${appointmentId} falló (${code})`);
        return save({ status: 'fallida', to, lastError: code });
      }
    },
  };
}
