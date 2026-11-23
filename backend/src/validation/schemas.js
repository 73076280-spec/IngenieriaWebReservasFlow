import { z } from 'zod';
import { ROLES, APPOINTMENT_STATUS } from '../models.js';
import { MESSAGES, CANCELLATION_REASONS } from '../errors/messages.js';
import { hhmmToMinutes } from '../utils/time.js';

// Zod 4 con mensajes en español; los mensajes oficiales del Excel se fijan en cada campo.
// Los objetos estrictos rechazan campos no previstos, incluido tenantId (HU-14-E2).
z.config(z.locales.es());

export const oid = z.string().regex(/^[a-f0-9]{24}$/i, 'Identificador inválido');
const name = z.string({ error: MESSAGES.NAME_REQUIRED }).trim().min(2, MESSAGES.NAME_REQUIRED).max(120);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida: use el formato HH:mm');
const isoDateTime = z.iso.datetime({ offset: true, error: 'Fecha y hora inválidas' });
const localDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida: use el formato AAAA-MM-DD');
const optionalEmail = z.union([z.literal(''), z.email({ error: MESSAGES.EMAIL_INVALID }).max(254)]).optional();

// Turnos: inicio anterior al fin y sin solapes en el mismo día (HU-02).
const scheduleSchema = z
  .array(z.strictObject({ day: z.number().int().min(0).max(6), start: hhmm, end: hhmm }))
  .max(50)
  .superRefine((items, ctx) => {
    items.forEach((s, i) => {
      if (hhmmToMinutes(s.start) >= hhmmToMinutes(s.end)) ctx.addIssue({ code: 'custom', message: MESSAGES.SCHEDULE_ORDER, path: [i, 'end'] });
    });
    for (let day = 0; day < 7; day++) {
      const sorted = items.filter((s) => s.day === day).sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start));
      for (let i = 1; i < sorted.length; i++) {
        if (hhmmToMinutes(sorted[i].start) < hhmmToMinutes(sorted[i - 1].end)) ctx.addIssue({ code: 'custom', message: MESSAGES.SCHEDULE_OVERLAP, path: [] });
      }
    }
  });

export const catalogSchemas = {
  clients: z.strictObject({
    name,
    email: optionalEmail,
    phone: z.union([z.literal(''), z.string().trim().regex(/^[0-9+()\s-]{6,20}$/, 'El teléfono solo puede contener números, espacios y los signos + ( ) -')]).optional(),
    notes: z.string().max(1000, 'Las notas no pueden superar 1000 caracteres').optional(),
  }),
  employees: z.strictObject({
    name,
    specialty: z.string({ error: MESSAGES.SPECIALTY_REQUIRED }).trim().min(1, MESSAGES.SPECIALTY_REQUIRED).max(120),
    serviceIds: z.array(oid).max(100).optional(),
    schedule: scheduleSchema.optional(),
  }),
  services: z.strictObject({
    name,
    duration: z
      .number({ error: MESSAGES.DURATION_POSITIVE })
      .int('La duración debe ser un número entero de minutos')
      .positive(MESSAGES.DURATION_POSITIVE)
      .max(480, MESSAGES.DURATION_MAX)
      .refine((x) => x % 15 === 0, MESSAGES.DURATION_STEP),
    price: z.number({ error: 'El costo debe ser un número' }).min(0, MESSAGES.PRICE_NEGATIVE).max(100000),
  }),
};
export const activeSchema = z.strictObject({ active: z.boolean() });

export const registerSchema = z.strictObject({
  organization: name,
  name,
  email: z.email({ error: MESSAGES.EMAIL_INVALID }).max(254),
  password: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres').max(128),
});

// organization: código legible (slug) o ID heredado de la organización.
export const loginSchema = z.strictObject({
  organization: z.string().trim().min(1).max(120),
  email: z.email({ error: MESSAGES.EMAIL_INVALID }).max(254),
  password: z.string().min(1).max(128),
});

const version = z.number().int().min(0).optional();

// clientId: obligatorio para el personal; el cliente reserva para sí mismo (se toma de la sesión).
// employeeId ausente: cualquier profesional disponible (HU-04-E2).
export const bookingSchema = z.strictObject({ clientId: oid.optional(), employeeId: oid.optional(), serviceId: oid, start: isoDateTime });
export const statusSchema = z.strictObject({
  status: z.enum(APPOINTMENT_STATUS),
  reason: z.enum(Object.keys(CANCELLATION_REASONS)).optional(),
  version,
});
export const rescheduleSchema = z.strictObject({ start: isoDateTime, employeeId: oid.optional(), version });

const dateLike = z.string().max(40).refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');
// Filtros combinables (HU-12). El rango invertido se rechaza sin consultar (HU-12-E3).
export const appointmentQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    clientId: oid.optional(),
    employeeId: oid.optional(),
    serviceId: oid.optional(),
    status: z.enum(APPOINTMENT_STATUS).optional(),
    from: dateLike.optional(),
    to: dateLike.optional(),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), { message: MESSAGES.INVALID_RANGE, path: ['from'] });

export const availabilityQuerySchema = z.object({ serviceId: oid, employeeId: oid.optional(), date: localDay });
export const dashboardQuerySchema = z.object({ period: z.enum(['mes', 'trimestre', 'anio']).default('mes') });
export const settingsSchema = z.strictObject({ rescheduleMinHours: z.number().int().min(0).max(72) });

export const createUserSchema = z.strictObject({
  name,
  email: z.email({ error: MESSAGES.EMAIL_INVALID }).max(254),
  password: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres').max(128),
  role: z.enum(ROLES).nullable().optional(),
  employeeId: oid.optional(),
  clientId: oid.optional(),
});
export const changeRoleSchema = z.strictObject({ role: z.enum(ROLES), employeeId: oid.nullable().optional(), clientId: oid.nullable().optional() });
