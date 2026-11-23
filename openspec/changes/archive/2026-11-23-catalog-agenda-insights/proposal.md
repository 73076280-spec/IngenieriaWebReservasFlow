# Proposal

## Why

La auditoría final (2026-11-23) clasificó HU-01, HU-02, HU-03, HU-08, HU-12 y HU-13 como **parciales**: faltan notas de atención, editor de turnos, especialidad obligatoria, desactivación de profesionales y servicios, mensajes oficiales de validación, colores por estado y estados vacío/error del calendario, filtros combinables con validación del rango y un panel por periodo con clientes frecuentes. Son los requisitos mínimos a, b, c, e, g, k y l de la consigna.

## What Changes

- Clientes con notas de atención, mensaje oficial de correo inválido y advertencia accionable al eliminar un cliente con citas pendientes.
- Profesionales con especialidad obligatoria, servicios habilitados, editor de turnos por día y desactivación bloqueada si tienen citas futuras.
- Servicios con mensaje oficial de duración y desactivación sugerida al intentar eliminar uno con citas.
- `PATCH /api/{employees|services}/:id/status` para activar o desactivar.
- Calendario con colores y leyenda por estado, filtro por profesional con su horario laboral, detalle de cita, aviso de día sin citas y error con botón de reintento.
- `GET /api/appointments` con filtros combinables (`q` nombre de cliente, `clientId`, `employeeId`, `serviceId`, `status`, `from`, `to`) y validación del rango.
- `GET /api/dashboard?period=mes|trimestre|anio`: citas del periodo por estado, servicio más solicitado, tres clientes frecuentes, cancelaciones por motivo, mensaje de bienvenida sin datos y error amigable.

## Capabilities

### New Capabilities
- `catalog-management`: clientes, profesionales y servicios (HU-01, HU-02, HU-03).
- `agenda-calendar`: agenda diaria, semanal y mensual (HU-08).
- `appointment-search`: búsqueda y filtros (HU-12).
- `dashboard-insights`: indicadores por periodo (HU-13).

### Modified Capabilities
<!-- Ninguna: los permisos se ajustan en booking-flows. -->

## Impact

- Backend: `catalogService.js`, `appointmentService.js` (filtros), `dashboardService.js`, `schemas.js`, `businessRoutes.js`.
- Frontend: formularios de catálogo, editor de turnos, agenda, filtros y panel.
- Datos: `Client.notes` y `active` son campos nuevos opcionales; sin migraciones.
