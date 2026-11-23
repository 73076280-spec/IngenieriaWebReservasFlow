import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMailer } from '../../src/notifications/mailer.js';
import { bookingConfirmationEmail, confirmationCode } from '../../src/notifications/templates.js';
import { createBookingNotifier } from '../../src/notifications/bookingConfirmation.js';
import { createAppointmentService } from '../../src/services/appointmentService.js';
import { loadMailConfig } from '../../src/config/env.js';
import { createMemoryRepos } from '../helpers/memoryRepos.js';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

describe('HU-04-E1 · Plantilla de confirmación', () => {
  const appointment = { _id: '6a1b2c3d4e5f6a7b8c9d0e1f', start: new Date('2026-12-01T14:30:00Z'), end: new Date('2026-12-01T15:00:00Z'), priceSnapshot: 45 };
  const email = bookingConfirmationEmail({
    organization: { name: 'Clínica Dental Sonrisa Real', code: 'sonrisa-real', timezone: 'America/Lima' },
    client: { name: 'Juan <script>alert(1)</script>' }, service: { name: 'Limpieza dental', duration: 30 }, employee: { name: 'Ana Torres' }, appointment,
  });

  it('incluye código, servicio, profesional, fecha y horario en la hora de la organización', () => {
    expect(email.code).toBe('8C9D0E1F');
    expect(email.subject).toBe('Confirmación de tu cita 8C9D0E1F · Clínica Dental Sonrisa Real');
    for (const part of [email.html, email.text]) {
      for (const s of ['8C9D0E1F', 'Limpieza dental', 'Ana Torres', 'martes, 1 de diciembre de 2026', '09:30 – 10:00', 'S/ 45.00', 'Programada', 'sonrisa-real']) expect(part).toContain(s);
    }
  });

  it('escapa los datos ingresados por usuarios en el HTML', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('Juan &lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('Bandeja de correo y configuración', () => {
  it('"file" guarda el correo como .html en la bandeja local sin enviarlo', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rf-outbox-'));
    try {
      await createMailer({ transport: 'file', outboxDir: dir }).send({ to: 'juan@correo.pe', subject: 'Hola', text: 'Hola', html: '<p>Hola</p>', reference: 'cita1' });
      const files = await readdir(dir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/-cita1\.html$/);
      expect(await readFile(path.join(dir, files[0]), 'utf8')).toBe('<p>Hola</p>');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('MAIL_TRANSPORT: file por defecto, disabled en producción y valores desconocidos rechazados', () => {
    expect(loadMailConfig({}).transport).toBe('file');
    expect(loadMailConfig({ NODE_ENV: 'production' }).transport).toBe('disabled');
    expect(() => loadMailConfig({ MAIL_TRANSPORT: 'smtp' })).toThrow(/MAIL_TRANSPORT/);
  });
});

describe('HU-04-E1 · Notificación de la reserva', () => {
  const auth = { tenantId: A, role: 'recepcionista', tenant: { name: 'Clínica Demo', code: 'demo', timezone: 'America/Lima' } };
  function setup({ mailer = createMailer({ transport: 'memory' }), email = 'juan@correo.pe' } = {}) {
    const mem = createMemoryRepos();
    const client = mem.seed('clients', A, { name: 'Juan Pérez', ...(email ? { email } : {}) });
    const service = mem.seed('services', A, { name: 'Limpieza dental', duration: 30, price: 45 });
    const employee = mem.seed('employees', A, { name: 'Ana Torres' });
    const ap = mem.seed('appointments', A, { clientId: client._id, serviceId: service._id, employeeId: employee._id, start: new Date('2026-12-01T14:30:00Z'), end: new Date('2026-12-01T15:00:00Z'), priceSnapshot: 45, status: 'programada' });
    const notifier = createBookingNotifier({ repos: mem.repos, mailer, logger: { error: () => {} } });
    return { mem, mailer, notifier, ap };
  }

  it('genera la confirmación para el correo del cliente y registra el estado "simulada" (modo de prueba)', async () => {
    const { mailer, notifier, ap } = setup();
    const n = await notifier.confirm(auth, ap._id);
    expect(n).toMatchObject({ status: 'simulada', to: 'juan@correo.pe', attempts: 1, transport: 'memory', error: null });
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0].to).toBe('juan@correo.pe');
    expect(mailer.outbox[0].html).toContain(confirmationCode(ap._id));
    expect(ap.notification.status).toBe('simulada');
  });

  it('no genera confirmaciones duplicadas por la misma cita', async () => {
    const { mailer, notifier, ap } = setup();
    await Promise.all([notifier.confirm(auth, ap._id), notifier.confirm(auth, ap._id)]);
    await notifier.confirm(auth, ap._id);
    expect(mailer.outbox).toHaveLength(1);
    await expect(notifier.confirm(auth, ap._id, { retry: true })).rejects.toMatchObject({ status: 409, code: 'CONFIRMATION_ALREADY_SENT' });
  });

  it('si el correo falla, la cita se conserva, queda "fallida" y se puede reintentar una sola vez', async () => {
    const { mem, mailer, notifier, ap } = setup();
    mailer.failNext(1);
    const n = await notifier.confirm(auth, ap._id);
    expect(n).toMatchObject({ status: 'fallida', error: 'ESIMULATED', attempts: 1 });
    expect(mem.data.appointments[0].status).toBe('programada');
    const results = await Promise.allSettled([notifier.confirm(auth, ap._id, { retry: true }), notifier.confirm(auth, ap._id, { retry: true })]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(mailer.outbox).toHaveLength(1);
    expect(ap.notification).toMatchObject({ status: 'simulada', attempts: 2 });
  });

  it('cliente sin correo: "sin_correo" sin generar el mensaje', async () => {
    const { mailer, notifier, ap } = setup({ email: null });
    expect((await notifier.confirm(auth, ap._id)).status).toBe('sin_correo');
    expect(mailer.outbox).toHaveLength(0);
  });

  it('correo desactivado: "desactivada"', async () => {
    const { notifier, ap } = setup({ mailer: createMailer({ transport: 'disabled' }) });
    expect((await notifier.confirm(auth, ap._id)).status).toBe('desactivada');
  });

  it('la reserva se registra y se devuelve aunque el notificador falle por completo', async () => {
    const mem = createMemoryRepos();
    const client = mem.seed('clients', A, { name: 'Juan', email: 'juan@correo.pe' });
    const service = mem.seed('services', A, { name: 'Limpieza dental', duration: 30, price: 45 });
    const employee = mem.seed('employees', A, { name: 'Ana', serviceIds: [], schedule: [{ day: 1, start: '09:00', end: '18:00' }] });
    const appointments = createAppointmentService({
      repos: mem.repos,
      notifier: { confirm: async () => { throw new Error('base de datos caída'); } },
      startSession: async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} }),
      now: () => Date.parse('2026-11-23T15:00:00Z'),
      logger: { error: () => {} },
    });
    const res = await appointments.create(auth, { clientId: client._id, employeeId: employee._id, serviceId: service._id, start: '2026-11-30T15:00:00.000Z' });
    expect(res._id).toBeTruthy();
    expect(res.confirmation.code).toHaveLength(8);
    expect(res.notification).toEqual({ status: 'fallida', error: 'INTERNAL' });
    expect(mem.data.appointments).toHaveLength(1);
    expect(mem.data.slots).toHaveLength(2);
  });

  it('aislamiento: otra organización no puede notificar ni ver la cita (404)', async () => {
    const { mailer, notifier, ap } = setup();
    await expect(notifier.confirm({ ...auth, tenantId: B }, ap._id)).rejects.toMatchObject({ status: 404 });
    expect(mailer.outbox).toHaveLength(0);
  });
});
