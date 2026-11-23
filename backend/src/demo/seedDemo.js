import bcrypt from 'bcryptjs';
import { Tenant, User, Client, Employee, Service, Appointment, Slot } from '../models.js';
import { DEFAULT_TZ, addDays, localDate, monthStart, weekdayOf, zonedToUtc } from '../utils/time.js';
import { slotPoints } from '../services/availabilityService.js';

/**
 * Crea una organización de demostración NUEVA con datos ficticios: usuarios de los 4 roles,
 * servicios, profesionales con turnos, clientes y citas pasadas y futuras en todos los estados.
 * Nunca modifica ni borra datos existentes: si el código (slug) ya existe, no hace nada.
 */
export async function seedDemo({ slug = 'demo-sonrisa-real', name = 'Clínica Dental Sonrisa Real (demo)', password, now = new Date(), bcryptRounds = 10 }) {
  if (!password || password.length < 10) throw new Error('La contraseña de demostración debe tener al menos 10 caracteres');
  if (await Tenant.exists({ slug })) return { created: false, slug };
  const tz = DEFAULT_TZ;
  const tenant = await Tenant.create({ name, slug });
  const tenantId = tenant._id;
  const t = (doc) => ({ ...doc, tenantId });

  const [limpieza, blanqueamiento, consulta, ortodoncia] = await Service.create([
    t({ name: 'Limpieza dental', duration: 30, price: 45 }),
    t({ name: 'Blanqueamiento', duration: 60, price: 120 }),
    t({ name: 'Consulta de evaluación', duration: 15, price: 30 }),
    t({ name: 'Control de ortodoncia', duration: 30, price: 80 }),
  ]);
  const days = (list, start, end) => list.map((day) => ({ day, start, end }));
  const [ana, bruno, carla] = await Employee.create([
    t({ name: 'Ana Torres', specialty: 'Odontología general', serviceIds: [limpieza._id, consulta._id], schedule: days([1, 2, 3, 4, 5, 6], '09:00', '18:00') }),
    t({ name: 'Bruno Díaz', specialty: 'Ortodoncia', serviceIds: [ortodoncia._id, consulta._id], schedule: days([1, 2, 3, 4, 5], '14:00', '20:00') }),
    t({ name: 'Carla Ruiz', specialty: 'Estética dental', serviceIds: [blanqueamiento._id], schedule: days([2, 3, 4, 5, 6], '09:00', '13:00') }),
  ]);
  const clients = await Client.create(['Juan Pérez', 'María López', 'Pedro Gómez', 'Rosa Quispe', 'Luis Rojas'].map((n, i) =>
    t({ name: n, email: `${n.split(' ')[0].toLowerCase()}@demo.reservaflow.pe`, phone: `98765432${i}`, notes: i === 0 ? 'Prefiere atención por la mañana' : '' })));
  const [juan, maria, pedro, rosa, luis] = clients;

  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const accounts = [
    ['Administradora Demo', 'admin@demo.reservaflow.pe', 'admin', {}],
    ['Recepción Demo', 'recepcion@demo.reservaflow.pe', 'recepcionista', {}],
    ['Ana Torres', 'ana@demo.reservaflow.pe', 'profesional', { employeeId: ana._id }],
    ['Juan Pérez', 'juan@demo.reservaflow.pe', 'cliente', { clientId: juan._id }],
    ['Cuenta sin rol', 'pendiente@demo.reservaflow.pe', null, {}],
  ];
  await User.create(accounts.map(([n, email, role, extra]) => t({ name: n, email, passwordHash, role, ...extra })));

  // Citas: [fecha local, hora, cliente, profesional, servicio, estado, motivo]
  const today = localDate(now, tz);
  const prev = monthStart(now, tz, 1);
  const prev2 = monthStart(now, tz, 2);
  const workday = (from, wanted) => { let d = from; while (!wanted.includes(weekdayOf(d))) d = addDays(d, 1); return d; };
  const past = (base, n) => workday(addDays(base, n), [2, 3, 4, 5]);
  const future = (n) => workday(addDays(today, n), [2, 3, 4, 5]);
  const plan = [
    [past(prev2, 3), '09:00', juan, ana, limpieza, 'completada'],
    [past(prev2, 10), '10:00', maria, carla, blanqueamiento, 'completada'],
    [past(prev2, 17), '15:00', pedro, bruno, ortodoncia, 'no_asistio'],
    [past(prev, 2), '09:30', juan, ana, consulta, 'completada'],
    [past(prev, 8), '11:00', rosa, ana, limpieza, 'cancelada', 'cliente_no_puede_asistir'],
    [past(prev, 15), '16:00', pedro, bruno, ortodoncia, 'completada'],
    [past(prev, 22), '10:00', maria, ana, limpieza, 'completada'],
    [future(1), '09:00', juan, ana, limpieza, 'programada'],
    [future(1), '10:00', maria, carla, blanqueamiento, 'confirmada'],
    [future(2), '15:00', pedro, bruno, ortodoncia, 'programada'],
    [future(3), '11:30', luis, ana, consulta, 'programada'],
    [future(4), '09:30', rosa, ana, limpieza, 'confirmada'],
  ];
  const toUtc = (date, hhmm) => zonedToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), tz);
  const docs = plan.map(([date, hhmm, client, employee, service, status, reason]) => {
    const start = toUtc(date, hhmm);
    return t({
      clientId: client._id, employeeId: employee._id, serviceId: service._id, start, end: new Date(+start + service.duration * 60000),
      priceSnapshot: service.price, status, ...(reason ? { cancellationReason: reason, cancelledAt: start } : {}),
    });
  });
  const appointments = await Appointment.create(docs);
  // Los bloques ocupados de las citas activas futuras mantienen la disponibilidad coherente.
  const slots = appointments
    .filter((a) => ['programada', 'confirmada'].includes(a.status) && a.start > now)
    .flatMap((a) => slotPoints(a.start, a.end).map((at) => t({ employeeId: a.employeeId, at, appointmentId: a._id })));
  await Slot.insertMany(slots);

  return { created: true, slug, tenantId: String(tenantId), users: accounts.map(([, email, role]) => ({ email, role })), appointments: appointments.length, slots: slots.length };
}
