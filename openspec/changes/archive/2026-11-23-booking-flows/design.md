# Design

## Context

Las reservas ya usan `Slot` (un documento por bloque de 15 min con índice único `tenantId+employeeId+at`) dentro de transacciones de MongoDB. La disponibilidad se puede calcular con los turnos del profesional y los `Slot` ocupados, sin estructuras nuevas.

## Goals / Non-Goals

**Goals:** cubrir HU-04, HU-05, HU-06, HU-07, HU-09 y HU-10 con los mensajes oficiales, reutilizando los repositorios acotados por organización y la política RBAC central.

**Non-Goals:** correo/SMS, pagos, turnos que cruzan la medianoche, autorregistro de clientes.

## Decisions

1. **Disponibilidad calculada, no almacenada.** `availabilityService` genera inicios cada 15 min dentro de cada turno del día (zona horaria de la organización), descarta los que no caben con la duración del servicio, los pasados y los que pisan un `Slot`. Una sola consulta de `Slot` por día y grupo de profesionales.
2. **Ventana de consulta:** desde hoy hasta 90 días. Fecha anterior a hoy → `400 PAST_DATE` "No es posible consultar disponibilidad para fechas pasadas". Sin bloques → lista vacía, mensaje "No hay horarios disponibles para esta fecha" y hasta 3 fechas sugeridas en los 14 días siguientes.
3. **Elegibilidad:** profesional activo (`active !== false`) y `serviceIds` vacío (generalista, compatible con datos previos) o que incluya el servicio. Servicio activo.
4. **Cualquier profesional:** se prueban los elegibles libres en orden alfabético; si la transacción falla por clave duplicada se intenta el siguiente.
5. **Conflicto:** el `11000` del índice de `Slot` se traduce en `409 SLOT_TAKEN` "El horario seleccionado ya no está disponible" con `details.suggestion` (inicio libre más cercano del mismo profesional; si no hay, de otro profesional del mismo servicio). La carrera la resuelve la base: el índice único garantiza una sola reserva.
6. **Máquina de estados:** `programada → confirmada|completada|cancelada|no_asistio`, `confirmada → completada|cancelada|no_asistio`; `completada`, `cancelada` y `no_asistio` son finales, con mensajes específicos ("No es posible cancelar una cita ya completada", "No es posible completar una cita cancelada"). `no_asistio` exige que la hora de inicio haya pasado.
7. **Concurrencia (HU-06-E4):** la interfaz envía `version` (`__v` leído). Cada cambio llama a `doc.increment()`. Si la versión no coincide → `409 APPOINTMENT_UPDATED`. Dos transacciones simultáneas sobre la misma cita entran en conflicto de escritura; el reintento de `withTransaction` relee la versión y la segunda recibe el aviso.
8. **Portal del cliente:** `User.clientId` vincula la cuenta con su ficha de cliente. `appointmentScope` devuelve `{clientId}` para el rol cliente; al reservar se ignora cualquier `clientId` enviado y se usa el de la sesión. El cliente solo puede pasar sus citas a `cancelada`.
9. **Plazo de reprogramación:** `Tenant.settings.rescheduleMinHours` (por defecto 2, editable por el administrador). Se aplica al rol cliente; el personal puede reprogramar sin plazo para atender casos excepcionales.
10. **Confirmación al cliente (HU-04-E1):** comprobante en la aplicación con el código de reserva. No hay proveedor de correo; queda documentado como limitación.
11. **Mensajes de validación:** Zod usa la configuración regional `es`; el manejador de errores devuelve como `error` el mensaje oficial cuando la primera incidencia tiene uno, y conserva `details`.

## Risks / Trade-offs

- Calcular disponibilidad en cada consulta tiene costo O(profesionales × bloques); con 15 min y turnos de 10 h son 40 bloques por profesional, aceptable.
- El plazo de reprogramación no se aplica al personal: decisión explícita, documentada.
