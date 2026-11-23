# Proposal

## Why

La auditoría final (2026-11-23) clasificó HU-07 como **no implementada** y HU-04, HU-05, HU-06, HU-09 y HU-10 como **parciales**. Faltan la consulta de disponibilidad, el portal del cliente, la asignación automática de profesional, las sugerencias ante conflicto, el cambio de profesional y el plazo mínimo al reprogramar, el motivo y la concurrencia de la cancelación y las reglas de transición de estados con los mensajes oficiales del Excel. Son los requisitos mínimos d, f, h, i y m de la consigna.

## What Changes

- Nuevo `GET /api/availability`: bloques libres por servicio, fecha y profesional (o combinando todos los profesionales habilitados), con validación de fechas pasadas y sugerencia de fechas cercanas.
- Profesionales con servicios habilitados (`serviceIds`) y estado activo; solo los activos y habilitados reciben citas.
- Reserva con "cualquier profesional disponible" (asignación automática) y mensajes oficiales de horario no disponible; un conflicto responde `409 SLOT_TAKEN` con el horario libre más cercano.
- **BREAKING** Portal del cliente: el rol `cliente` (vinculado a un registro de cliente mediante `User.clientId`) consulta disponibilidad, reserva, reprograma y cancela **solo sus citas**.
- Reprogramación con cambio de profesional, plazo mínimo configurable por organización (2 h por defecto, aplicado al cliente) y mensaje para citas que ya no están activas.
- Cancelación con motivo, detección de modificaciones concurrentes (`version`) y máquina de estados con los mensajes oficiales; "no asistió" solo después de la hora de inicio.
- Historial de asistencia por cliente.

## Capabilities

### New Capabilities
- `availability`: consulta de horarios libres y sugerencias (HU-07, HU-09-E1/E2).
- `appointment-booking`: registro de citas por personal y por el cliente, asignación automática y control de conflictos (HU-04, HU-09).
- `appointment-lifecycle`: reprogramación, cancelación, estados e historial de asistencia (HU-05, HU-06, HU-10).

### Modified Capabilities
- `access-control`: permisos del rol cliente sobre sus propias citas y eliminación de clientes por recepción (HU-01, HU-04, HU-05).

## Impact

- Backend: `models.js` (campos nuevos no destructivos: `Employee.serviceIds/active`, `Service.active`, `User.clientId`, `Appointment.cancellationReason/cancelledAt`, `Tenant.settings`), nuevo `availabilityService.js`, `appointmentService.js`, `policies.js`, `schemas.js`, `messages.js`, `errorHandler.js` (mensajes de validación en español), nuevas rutas.
- Frontend: portal del cliente (reservar, mis citas), formularios de cancelación y reprogramación.
- Datos: los profesionales existentes sin `serviceIds` atienden todos los servicios; los documentos existentes sin `active` se consideran activos. No hay migraciones ni índices nuevos destructivos.
- Fuera de alcance: envío de correo o SMS (la confirmación es en la aplicación) y el autorregistro de clientes.
