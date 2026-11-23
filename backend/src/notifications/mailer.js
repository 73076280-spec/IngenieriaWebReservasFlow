import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Entrega de la confirmación por correo (HU-04-E1), según MAIL_TRANSPORT:
 *  - file:     guarda el correo (.html) en la bandeja local backend/.mail-outbox. No envía nada.
 *  - memory:   guarda el correo en memoria (pruebas automatizadas).
 *  - disabled: no genera correos.
 * El proyecto no incluye envío real por SMTP (la consigna no lo exige); ver docs/CORREO_CONFIRMACION.md.
 */
export function createMailer(config = { transport: 'disabled' }) {
  const transport = config.transport || 'disabled';
  const outbox = [];
  let failures = 0; // solo pruebas: fuerza fallos para comprobar que la reserva se conserva

  return {
    transport,
    enabled: transport !== 'disabled',
    outbox,
    failNext(n = 1) { failures = n; },
    async send({ to, subject, text, html, reference }) {
      if (transport === 'disabled') throw Object.assign(new Error('Correo desactivado'), { code: 'EDISABLED' });
      if (failures > 0) {
        failures -= 1;
        throw Object.assign(new Error('Fallo simulado del correo'), { code: 'ESIMULATED' });
      }
      if (transport === 'file') {
        await mkdir(config.outboxDir, { recursive: true });
        const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${reference || 'mensaje'}.html`.replace(/[^\w.-]/g, '_');
        await writeFile(path.join(config.outboxDir, name), html, 'utf8');
      } else {
        outbox.push({ to, subject, text, html, reference });
      }
      return { messageId: `${reference || 'mensaje'}@reservaflow.local` };
    },
  };
}
