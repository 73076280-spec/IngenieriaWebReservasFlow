# Tasks

## 1. Modelo y validación

- [x] 1.1 Campos nuevos no destructivos: `Employee.serviceIds/active`, `Service.active`, `User.clientId`, `Appointment.cancellationReason/cancelledAt/cancelledBy`, `Tenant.settings.rescheduleMinHours`; verificar con `node --check` y las pruebas existentes — *68/68 pruebas previas aprobadas tras el cambio*
- [x] 1.2 Zod con configuración regional `es`, mensajes oficiales en `messages.js` y `errorHandler` que devuelve el mensaje oficial; verificar con pruebas de componentes — *`businessRules.test.js` › "la API devuelve el mensaje oficial"*

## 2. Disponibilidad (HU-07, HU-09-E1/E2)

- [x] 2.1 `availabilityService` con funciones puras (zona horaria, bloques libres) y `GET /api/availability`; verificar HU-07-E1..E4 con pruebas unitarias — *`availability.test.js` (13 pruebas) e integración HU-07-E1..E4*
- [x] 2.2 Sugerencia del horario libre más cercano en el 409 `SLOT_TAKEN`; verificar HU-09-E2 en integración — *`functional.integration.test.js` › HU-09-E2*

## 3. Reservas (HU-04, HU-09)

- [x] 3.1 Reserva por el cliente con `clientId` de la sesión, asignación automática y mensaje oficial fuera de turno; verificar HU-04-E1..E3 en integración — *aprobadas; HU-04-E1 también en E2E con Edge*
- [x] 3.2 Carrera de dos reservas simultáneas; verificar HU-09-E3 en integración — *una 201 y una 409 `SLOT_TAKEN`; una sola cita en la base*

## 4. Ciclo de vida (HU-05, HU-06, HU-10)

- [x] 4.1 Máquina de estados con mensajes oficiales, `no_asistio` tras la hora de inicio, motivo de cancelación y `version`; verificar con pruebas unitarias e integración (HU-06-E1..E4, HU-10-E1..E4) — *aprobadas; HU-06-E4 con dos peticiones simultáneas reales*
- [x] 4.2 Reprogramación con cambio de profesional, plazo mínimo configurable y cita inactiva; verificar HU-05-E1..E4 en integración — *aprobadas*
- [x] 4.3 `GET /api/clients/:id/history` y `GET/PATCH /api/settings`; verificar en integración — *HU-01-E2, HU-10-E4 y HU-05-E3*

## 5. Permisos y portal del cliente

- [x] 5.1 Permisos del cliente (disponibilidad, reservar, reprogramar y cancelar lo propio) y eliminación de clientes por recepción; actualizar `policies.test.js` — *aprobadas; el cliente recibe 404 ante citas ajenas (integración)*
- [x] 5.2 Interfaz: portal del cliente (reservar con disponibilidad, mis citas), cancelación con motivo y confirmación, reprogramación con disponibilidad y profesional; verificar con `vite build` y pruebas del frontend — *20/20 pruebas del frontend; E2E 24/24 con Edge*

## 6. Verificación

- [x] 6.1 Ejecutar `npm test`, `npm run test:integration`, pruebas del frontend y `vite build`; registrar resultados reales — *ver `docs/INFORME_AUDITORIA_FINAL.md`*
- [x] 6.2 `openspec validate booking-flows --strict`
