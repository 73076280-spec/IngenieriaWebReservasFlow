# Matriz de trazabilidad y cobertura de los 60 escenarios

Actualizada el 2026-11-23 tras la auditoría final. Cubre las 15 historias y los 60 escenarios de las hojas **Historias de Usuario** y **Backlog resumido** del [Excel oficial](../referencias/Historias_Usuario_Reservas_Citas.xlsx). La columna *Criterio Gherkin oficial* reproduce el Excel sin cambios. *Evidencia ejecutada* solo menciona pruebas que se ejecutaron y aprobaron (ver [informe final](INFORME_AUDITORIA_FINAL.md)).

**Resumen:** 60 de 60 escenarios con evidencia automatizada ejecutada · 59 verificados por completo · 1 (HU-04-E1) con la confirmación por correo (modo de prueba) verificada solo en pruebas unitarias, pendiente de integración y E2E · 29 verificados además en la interfaz real con Edge (E2E).

## Leyenda de evidencia

| Código | Tipo de prueba | Dónde |
|---|---|---|
| **U** | Unitaria (reglas puras, sin red ni base) | `backend/tests/unit/*.test.js` |
| **C** | Componentes: API Express real con almacenamiento en memoria | `backend/tests/unit/api.security.test.js` |
| **I** | Integración contra MongoDB Atlas, base aislada `reservas_saas_test` | `backend/tests/integration/{security,functional,demo}.integration.test.js` |
| **F** | Unitaria del frontend | `frontend/src/**/*.test.js` |
| **E** | E2E en Microsoft Edge: React → Express → `reservas_saas_test` (capturas numeradas) | `frontend/e2e/smoke.e2e.mjs`, [`docs/evidencias/e2e/`](evidencias/e2e/) |

## Trazabilidad por historia

| HU | Especificación OpenSpec | Backend | Frontend | Estado |
|---|---|---|---|---|
| HU-01 | `catalog-management` | `catalogService`, `appointmentService.clientHistory` | `pages/Catalog.jsx` | Completa y verificada |
| HU-02 | `catalog-management` | `catalogService`, `availabilityService` | `Catalog.jsx` (editor de turnos) | Completa y verificada |
| HU-03 | `catalog-management` | `catalogService` | `Catalog.jsx` | Completa y verificada |
| HU-04 | `appointment-booking`, `booking-notifications` (en curso) | `appointmentService.create`, `notifications/` | `ClientPortal.jsx`, `BookingForm.jsx` | Implementada; correo pendiente de integración y E2E |
| HU-05 | `appointment-lifecycle` | `appointmentService.reschedule`, `settingsService` | `ClientPortal.jsx`, `Appointments.jsx` | Completa y verificada |
| HU-06 | `appointment-lifecycle` | `appointmentService.changeStatus` | `lib/actions.js` | Completa y verificada |
| HU-07 | `availability` | `availabilityService` | `BookingForm.jsx` | Completa y verificada |
| HU-08 | `agenda-calendar` | `appointmentService.list` (rango) | `pages/Agenda.jsx` | Completa y verificada |
| HU-09 | `availability`, `appointment-booking` | índice único `Slot`, transacciones, `nearest` | `BookingForm.jsx` | Completa y verificada |
| HU-10 | `appointment-lifecycle` | `assertTransition` | `Appointments.jsx` | Completa y verificada |
| HU-11 | `access-control` | `policies.js`, `userService` | `App.jsx` (menú por permisos), `Users.jsx` | Completa y verificada |
| HU-12 | `appointment-search` | `appointmentService.list` (filtros) | `Appointments.jsx`, `lib/filters.js` | Completa y verificada |
| HU-13 | `dashboard-insights` | `dashboardService` | `pages/Dashboard.jsx` | Completa y verificada |
| HU-14 | `tenant-isolation` | `tenantScopedRepository`, `authService.verify` | `api/client.js` | Completa y verificada |
| HU-15 | `user-auth` | `authService`, `middlewares/auth.js` | `Login.jsx`, `api/client.js` | Completa y verificada |

Especificaciones vigentes: [`openspec/specs/`](../openspec/specs/). Cambios archivados: `security-foundation`, `booking-flows`, `catalog-agenda-insights`.

## HU-01 · Gestión de clientes

**Prioridad alta** · Excel, filas 4–7.

Como recepcionista, quiero registrar, editar y eliminar los datos de mis clientes (nombre, teléfono, correo y notas de atención). Para mantener actualizada la cartera de clientes de mi organización y agilizar la atención en cada visita.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-01-E1` · Registro exitoso de un cliente<br>Camino feliz | **Dado que** La recepcionista de la Clínica Dental Sonrisa Real ha iniciado sesión en el sistema<br>**Cuando** Registra un nuevo cliente con nombre, teléfono y correo válidos<br>**Entonces** El sistema guarda al cliente asociado únicamente a esa organización y lo muestra en el listado de clientes. | `POST /api/clients` (recepción) con tenantId de la sesión; formulario con notas de atención. | I `functional` › HU-01-E1 (no aparece en otra organización) · E paso HU-01-E1, captura 06 | ✅ Verificado |
| `HU-01-E2` · Edición de datos de un cliente existente<br>Flujo alternativo | **Dado que** Existe un cliente previamente registrado con un número de teléfono desactualizado<br>**Cuando** La recepcionista actualiza el teléfono y guarda los cambios<br>**Entonces** El sistema actualiza la información del cliente sin afectar su historial de citas. | Edición por ID (`PUT`) sin tocar citas; historial en `GET /api/clients/:id/history`. | I `functional` › HU-01-E2 (mismo ID, cita en el historial) | ✅ Verificado |
| `HU-01-E3` · Correo electrónico con formato inválido<br>Manejo de error | **Dado que** La recepcionista está registrando un nuevo cliente<br>**Cuando** Ingresa un correo electrónico sin un formato válido (por ejemplo, "juan@correo")<br>**Entonces** El sistema muestra "El correo electrónico no tiene un formato válido" y no guarda el registro. | Zod con el mensaje oficial; el manejador lo devuelve como error principal; formulario lo muestra. | U `businessRules` · I `functional` › HU-01-E3 (no se inserta) · E captura 05 | ✅ Verificado |
| `HU-01-E4` · Eliminación de un cliente con citas activas<br>Caso de borde | **Dado que** Un cliente tiene una cita programada para los próximos días<br>**Cuando** La recepcionista intenta eliminar el registro de ese cliente<br>**Entonces** El sistema impide la eliminación y muestra una advertencia indicando que primero debe cancelar o reasignar sus citas pendientes. | Borrado bloqueado con `409 HAS_ACTIVE_APPOINTMENTS` y número de citas; la interfaz ofrece "Ver sus citas". Recepción puede eliminar clientes (HU-01). | U `businessRules` · I `functional` › HU-01-E4 | ✅ Verificado |

## HU-02 · Gestión de empleados / profesionales

**Prioridad alta** · Excel, filas 9–12.

Como administrador, quiero registrar y administrar a los profesionales que atienden en mi organización, indicando su especialidad y horario laboral. Para asignar correctamente las citas a cada profesional según su disponibilidad y área de atención.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-02-E1` · Registro exitoso de un profesional<br>Camino feliz | **Dado que** El administrador de la Barbería Estilo Urbano ha iniciado sesión<br>**Cuando** Registra un nuevo profesional indicando nombre, especialidad y horario de atención<br>**Entonces** El sistema crea el perfil del profesional y lo habilita para recibir citas dentro de su horario. | Especialidad, servicios habilitados y turnos por día; solo admite citas dentro del turno. | I `functional` › HU-02-E1 (fuera de turno → 409) · E paso HU-02-E1/E2, captura 04 | ✅ Verificado |
| `HU-02-E2` · Modificación del horario laboral de un profesional<br>Flujo alternativo | **Dado que** Un profesional tiene un horario laboral registrado de lunes a viernes<br>**Cuando** El administrador modifica su horario para incluir los sábados<br>**Entonces** El sistema actualiza la disponibilidad del profesional y la refleja en el calendario de reservas. | Editor de turnos; la disponibilidad y el horario laboral del calendario (businessHours) usan los turnos. | I `functional` › HU-02-E2 (sábado añadido → 16 bloques) · F `lib.test` (businessHours) · E captura 04 | ✅ Verificado |
| `HU-02-E3` · Registro sin especialidad<br>Manejo de error | **Dado que** El administrador está registrando un nuevo profesional<br>**Cuando** Intenta guardar el formulario sin seleccionar una especialidad o servicio asociado<br>**Entonces** El sistema muestra "Debe seleccionar al menos una especialidad" y no permite guardar el registro. | Especialidad obligatoria con el mensaje oficial. | U `businessRules` · I `functional` › HU-02-E3 · E captura 03 | ✅ Verificado |
| `HU-02-E4` · Desactivar un profesional con citas futuras asignadas<br>Caso de borde | **Dado que** Un profesional tiene citas programadas para la próxima semana<br>**Cuando** El administrador intenta desactivar su perfil<br>**Entonces** El sistema advierte que existen citas pendientes asociadas y solicita reasignarlas antes de completar la desactivación. | `PATCH /api/employees/:id/status`: con citas futuras → `409 HAS_FUTURE_APPOINTMENTS` y el perfil sigue activo; reasignación por reprogramación. | U `businessRules` · I `functional` › HU-02-E4 (advierte, reasigna y luego desactiva) | ✅ Verificado |

## HU-03 · Gestión de servicios

**Prioridad alta** · Excel, filas 14–17.

Como administrador, quiero crear y editar los servicios que ofrezco indicando su duración y costo. Para que el sistema calcule automáticamente los bloques de disponibilidad y el precio de cada cita.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-03-E1` · Creación exitosa de un servicio<br>Camino feliz | **Dado que** El administrador del Taller Mecánico RapiFix se encuentra en la sección de servicios<br>**Cuando** Registra el servicio "Cambio de aceite" con una duración de 30 minutos y un costo de S/ 45<br>**Entonces** El sistema guarda el servicio y lo muestra disponible para ser seleccionado al momento de reservar una cita. | Alta de servicio con duración y costo; disponible para reservar. | I `functional` › HU-03-E1 · E paso HU-03-E1 | ✅ Verificado |
| `HU-03-E2` · Actualización del costo de un servicio<br>Flujo alternativo | **Dado que** Existe un servicio "Corte de cabello" registrado con un costo de S/ 20<br>**Cuando** El administrador actualiza el costo a S/ 25<br>**Entonces** El sistema aplica el nuevo precio a todas las citas que se reserven a partir de ese momento, sin modificar las citas ya confirmadas. | `priceSnapshot` fijado al reservar. | I `security` › regresión precio (45 → 60, la cita conserva 45) | ✅ Verificado |
| `HU-03-E3` · Duración de servicio inválida<br>Manejo de error | **Dado que** El administrador está registrando un nuevo servicio<br>**Cuando** Ingresa una duración igual a cero o un valor negativo<br>**Entonces** El sistema muestra "La duración del servicio debe ser mayor que cero" y no guarda el registro. | Duración 0 o negativa → mensaje oficial. | U `businessRules` (0 y −30) · I `functional` (0 y −15) · E captura 02 | ✅ Verificado |
| `HU-03-E4` · Eliminar un servicio con citas futuras asociadas<br>Caso de borde | **Dado que** El servicio "Limpieza dental" tiene citas programadas a futuro<br>**Cuando** El administrador intenta eliminarlo del catálogo<br>**Entonces** El sistema impide la eliminación y sugiere desactivar el servicio en lugar de eliminarlo, para no afectar las citas ya reservadas. | Borrado con citas → `409 HAS_APPOINTMENTS` con sugerencia `deactivate`; la interfaz ofrece "Desactivar"; servicio inactivo no admite reservas nuevas. | U `businessRules` · I `functional` › HU-03-E4 | ✅ Verificado |

## HU-04 · Registro de citas

**Prioridad alta** · Excel, filas 19–22.

Como cliente, quiero reservar una cita eligiendo el servicio, el profesional y un horario disponible. Para asegurar mi atención sin necesidad de llamar por teléfono o acercarme presencialmente.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-04-E1` · Reserva exitosa de una cita<br>Camino feliz | **Dado que** Un cliente de la Clínica Dental Sonrisa Real ha iniciado sesión y selecciona el servicio "Limpieza dental"<br>**Cuando** Elige un profesional disponible y un horario libre, y confirma la reserva<br>**Entonces** El sistema registra la cita con estado "programada" y envía una confirmación al cliente. | Portal del cliente: reserva con disponibilidad real; la cita queda "programada" a su nombre con comprobante. **Confirmación por correo** al cliente (código, servicio, profesional, fecha y hora), estado registrado en la cita, sin duplicados y reserva conservada si el correo falla ([CORREO_CONFIRMACION.md](CORREO_CONFIRMACION.md)). | Reserva: I `functional` › HU-04-E1 · E capturas 09–11. Correo (modo de prueba, bandeja local): U `notifications` (11 pruebas). Pendiente de ejecución: I `notifications` y E (correo) | ⚠️ Correo verificado solo en unitarias (integración y E2E bloqueadas: acceso a Atlas). Sin envío real (no incluido) |
| `HU-04-E2` · Reserva sin preferencia de profesional<br>Flujo alternativo | **Dado que** Un cliente desea agendar una cita pero no tiene preferencia por un profesional específico<br>**Cuando** Selecciona la opción "Cualquier profesional disponible" para el horario elegido<br>**Entonces** El sistema asigna automáticamente al primer profesional disponible que cumpla con el servicio solicitado. | Opción "Cualquier profesional disponible": el servidor asigna el primero habilitado y libre. | U `availability` · I `functional` › HU-04-E2 · E reserva con esa opción | ✅ Verificado |
| `HU-04-E3` · Intento de reserva fuera del horario laboral<br>Manejo de error | **Dado que** Un cliente está seleccionando un horario para su cita<br>**Cuando** Elige un horario fuera del rango laboral configurado para la organización<br>**Entonces** El sistema muestra "El horario seleccionado no está disponible" y no permite continuar con la reserva. | Fuera de turno → `409 OUT_OF_SCHEDULE` con el mensaje oficial; la interfaz solo ofrece bloques libres. | U `availability` · I `functional` › HU-04-E3 (no se crea) | ✅ Verificado |
| `HU-04-E4` · Intento de reserva con sesión expirada<br>Caso de borde | **Dado que** La sesión del cliente expiró mientras completaba el formulario de reserva<br>**Cuando** Intenta confirmar la cita<br>**Entonces** El sistema rechaza la solicitud, no crea el registro y le solicita iniciar sesión nuevamente antes de continuar. | 401 `TOKEN_EXPIRED` sin crear la cita; el cliente HTTP cierra la sesión y avisa. | C `api.security` · F `client.test` · E paso HU-04-E4/HU-15-E4, captura 12 | ✅ Verificado |

## HU-05 · Reprogramación de citas

**Prioridad alta** · Excel, filas 24–27.

Como cliente, quiero reprogramar mi cita a otro horario disponible. Para ajustarla cuando surge un imprevisto, sin perder mi reserva por completo.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-05-E1` · Reprogramación exitosa<br>Camino feliz | **Dado que** Un cliente tiene una cita programada para el día siguiente<br>**Cuando** Selecciona un nuevo horario disponible con el mismo profesional y confirma el cambio<br>**Entonces** El sistema actualiza la fecha y hora de la cita y conserva el mismo identificador de reserva. | `PATCH /reschedule` conserva el ID; el cliente reprograma sus citas. | I `security` y `functional` › HU-05-E1 | ✅ Verificado |
| `HU-05-E2` · Reprogramación con cambio de profesional<br>Flujo alternativo | **Dado que** El profesional asignado inicialmente no tiene horarios disponibles en la fecha deseada<br>**Cuando** El cliente elige un profesional distinto con el mismo servicio y un horario disponible<br>**Entonces** El sistema reasigna la cita al nuevo profesional y actualiza el horario correspondiente. | Cambio a otro profesional habilitado; los bloques anteriores se liberan en la misma transacción. | I `functional` › HU-05-E2 (horario anterior libre; no habilitado → 409) | ✅ Verificado |
| `HU-05-E3` · Reprogramación fuera del plazo permitido<br>Manejo de error | **Dado que** La organización tiene configurado un plazo mínimo de 2 horas de anticipación para reprogramar<br>**Cuando** El cliente intenta reprogramar una cita que inicia en los próximos 30 minutos<br>**Entonces** El sistema muestra "No es posible reprogramar con menos de 2 horas de anticipación" y no aplica el cambio. | Plazo configurable (`/api/settings`, 2 h por defecto) aplicado al cliente. | U mensaje · I `functional` › HU-05-E3 (2 h y 3 h) | ✅ Verificado |
| `HU-05-E4` · Reprogramación de una cita ya cancelada<br>Caso de borde | **Dado que** Una cita fue cancelada previamente por el cliente<br>**Cuando** Intenta reprogramarla desde el historial de citas<br>**Entonces** El sistema le indica que la cita ya no está activa y le sugiere realizar una nueva reserva. | `409 APPOINTMENT_INACTIVE`; en "Mis citas" se ofrece hacer una nueva reserva. | I `functional` › HU-05-E4 (sigue cancelada) | ✅ Verificado |

## HU-06 · Cancelación de citas

**Prioridad alta** · Excel, filas 29–32.

Como recepcionista, quiero cancelar una cita a solicitud del cliente. Para liberar el horario del profesional y permitir que otro cliente pueda reservarlo.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-06-E1` · Cancelación exitosa<br>Camino feliz | **Dado que** Un cliente de la Barbería Estilo Urbano llama para cancelar su cita del día<br>**Cuando** La recepcionista busca la cita y confirma la cancelación<br>**Entonces** El sistema cambia el estado de la cita a "cancelada" y libera automáticamente el horario en la agenda del profesional. | Cancelación con confirmación; libera los bloques. | I `security` y `functional` › HU-06-E1 · E paso HU-06, captura 20 | ✅ Verificado |
| `HU-06-E2` · Cancelación con motivo registrado<br>Flujo alternativo | **Dado que** La recepcionista está cancelando una cita<br>**Cuando** Selecciona un motivo de la lista (por ejemplo, "cliente no puede asistir")<br>**Entonces** El sistema guarda el motivo junto con la cancelación para fines estadísticos del panel de control. | Motivo de una lista (`cancellationReason`); cancelaciones por motivo en el panel. | I `functional` › HU-06-E2 y HU-13 · E capturas 20 y 22 | ✅ Verificado |
| `HU-06-E3` · Cancelación de una cita ya completada<br>Manejo de error | **Dado que** Una cita tiene el estado "completada"<br>**Cuando** La recepcionista intenta cancelarla<br>**Entonces** El sistema muestra "No es posible cancelar una cita ya completada" y no permite la acción. | Máquina de estados con el mensaje oficial. | U `businessRules` · I `functional` › HU-06-E3 (estado intacto) | ✅ Verificado |
| `HU-06-E4` · Cancelación simultánea por dos usuarios<br>Caso de borde | **Dado que** La misma cita está siendo modificada al mismo tiempo por la recepcionista y por el cliente desde la app<br>**Cuando** Ambos intentan confirmar una acción sobre la cita en un margen de segundos<br>**Entonces** El sistema procesa solo la primera solicitud válida y notifica al segundo usuario que la cita ya fue actualizada. | Control de versión (`__v`): la segunda acción recibe `409 APPOINTMENT_UPDATED` y la interfaz avisa y recarga. | I `functional` › HU-06-E4 (dos peticiones simultáneas reales) | ✅ Verificado |

## HU-07 · Consulta de disponibilidad

**Prioridad alta** · Excel, filas 34–37.

Como cliente, quiero consultar los horarios disponibles de un profesional en una fecha específica. Para elegir el momento que más me convenga antes de confirmar mi reserva.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-07-E1` · Consulta con horarios disponibles<br>Camino feliz | **Dado que** Un cliente selecciona el servicio "Corte de cabello" y un profesional específico<br>**Cuando** Elige una fecha dentro de los próximos 30 días<br>**Entonces** El sistema muestra los bloques de horario disponibles según la duración del servicio y la agenda del profesional. | `GET /api/availability`: bloques de 15 min según duración, turno y ocupación. | U `availability` · I `functional` › HU-07-E1 · E captura 09 | ✅ Verificado |
| `HU-07-E2` · Consulta sin filtrar por profesional<br>Flujo alternativo | **Dado que** El cliente no tiene preferencia por un profesional<br>**Cuando** Consulta la disponibilidad general de la organización para un servicio y fecha determinados<br>**Entonces** El sistema muestra los horarios disponibles combinando la agenda de todos los profesionales habilitados para ese servicio. | Sin profesional: unión de la agenda de los profesionales activos y habilitados. | U `availability` · I `functional` › HU-07-E2 | ✅ Verificado |
| `HU-07-E3` · Fecha fuera del rango permitido<br>Manejo de error | **Dado que** El cliente está consultando disponibilidad<br>**Cuando** Selecciona una fecha anterior a la fecha actual<br>**Entonces** El sistema muestra "No es posible consultar disponibilidad para fechas pasadas" y no ejecuta la búsqueda. | Fecha pasada → `400 PAST_DATE` sin consultar la agenda. | U `availability` (sin consultas) · I `functional` › HU-07-E3 | ✅ Verificado |
| `HU-07-E4` · Profesional sin horarios disponibles en la fecha elegida<br>Caso de borde | **Dado que** El profesional seleccionado tiene su agenda completamente ocupada en la fecha elegida<br>**Cuando** El cliente consulta la disponibilidad<br>**Entonces** El sistema muestra "No hay horarios disponibles para esta fecha" y sugiere fechas cercanas con disponibilidad. | Agenda llena → mensaje oficial y hasta 3 fechas sugeridas; la interfaz las ofrece como botones. | U `availability` · I `functional` › HU-07-E4 | ✅ Verificado |

## HU-08 · Visualización de agenda (calendario)

**Prioridad alta** · Excel, filas 39–42.

Como profesional, quiero visualizar mi agenda diaria, semanal y mensual en un calendario interactivo. Para organizar mi tiempo de atención y anticipar la carga de trabajo de cada jornada.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-08-E1` · Visualización de la agenda semanal<br>Camino feliz | **Dado que** Un profesional del Taller Mecánico RapiFix ha iniciado sesión<br>**Cuando** Accede a su calendario y selecciona la vista semanal<br>**Entonces** El sistema muestra todas sus citas de la semana organizadas por día y hora, con un color distinto según el estado de cada una. | Calendario por rango visible, color por estado y leyenda; el profesional ve solo sus citas. | F `lib.test` (5 colores) · I `functional` › HU-10-E2 (alcance del profesional) · E captura 17 | ✅ Verificado |
| `HU-08-E2` · Cambio entre vistas del calendario<br>Flujo alternativo | **Dado que** El profesional se encuentra visualizando su agenda en vista mensual<br>**Cuando** Cambia a la vista diaria para un día específico<br>**Entonces** El sistema actualiza el calendario mostrando únicamente las citas de ese día con el detalle de cliente y servicio. | Vistas mes/semana/día; del mes al día con cliente y servicio; detalle al seleccionar. | E paso HU-08-E1/E2, captura 18 | ✅ Verificado |
| `HU-08-E3` · Error al cargar la agenda<br>Manejo de error | **Dado que** Existe una falla temporal de conexión con el servidor<br>**Cuando** El profesional intenta abrir su calendario<br>**Entonces** El sistema muestra un mensaje indicando que no se pudo cargar la agenda y ofrece un botón para reintentar la carga. | "No se pudo cargar la agenda" con botón Reintentar; sin datos parciales. | E paso HU-08-E3 (caída de red simulada), captura 16 | ✅ Verificado |
| `HU-08-E4` · Día sin citas programadas<br>Caso de borde | **Dado que** El profesional no tiene ninguna cita registrada para el día seleccionado<br>**Cuando** Consulta la vista diaria de su calendario<br>**Entonces** El sistema muestra el día vacío con un mensaje indicando que no hay citas programadas, sin generar errores. | Aviso "No hay citas programadas para este día". | F `lib.test` · E paso HU-08-E4, captura 19 | ✅ Verificado |

## HU-09 · Prevención de reservas duplicadas

**Prioridad alta** · Excel, filas 44–47.

Como cliente, quiero que el sistema impida reservar un horario que ya está ocupado por otra cita. Para evitar conflictos de agenda que afecten al profesional y a otros clientes.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-09-E1` · Bloqueo automático de horario ocupado<br>Camino feliz | **Dado que** El profesional ya tiene una cita confirmada de 3:00 p.m. a 3:30 p.m.<br>**Cuando** Otro cliente intenta reservar el mismo profesional en ese horario<br>**Entonces** El sistema no muestra ese bloque como disponible y evita que se genere la reserva duplicada. | La disponibilidad excluye bloques ocupados; índice único de `Slot`. | U `availability` · I `functional` › HU-09-E1 | ✅ Verificado |
| `HU-09-E2` · Sugerencia de horario alternativo<br>Flujo alternativo | **Dado que** El horario solicitado por el cliente ya está ocupado<br>**Cuando** El sistema detecta el conflicto al momento de la búsqueda<br>**Entonces** El sistema sugiere automáticamente el horario disponible más cercano con el mismo profesional o servicio. | El 409 incluye el inicio libre más cercano; la interfaz propone reservarlo. | U `availability` · I `functional` › HU-09-E2 | ✅ Verificado |
| `HU-09-E3` · Intento de reserva por condición de carrera<br>Manejo de error | **Dado que** Dos clientes seleccionan el mismo horario disponible casi al mismo tiempo<br>**Cuando** Ambos confirman la reserva en un margen de milisegundos<br>**Entonces** El sistema procesa solo la primera solicitud recibida en el servidor y devuelve un error al segundo cliente indicando que el horario ya no está disponible. | Índice único + transacción: una sola reserva; la otra recibe `409 SLOT_TAKEN`. | I `functional` › HU-09-E3 (dos reservas simultáneas, una cita en la base) | ✅ Verificado |
| `HU-09-E4` · Horario liberado justo antes de una nueva reserva<br>Caso de borde | **Dado que** Una cita fue cancelada segundos antes de que otro cliente intentara reservar el mismo horario<br>**Cuando** El segundo cliente confirma la reserva<br>**Entonces** El sistema valida la disponibilidad actualizada y permite la reserva, ya que el conflicto original ya no existe. | La cancelación libera los bloques en la misma transacción. | I `security` (regresión) y `functional` › HU-06-E1 | ✅ Verificado |

## HU-10 · Estados de la cita

**Prioridad media** · Excel, filas 49–52.

Como recepcionista, quiero actualizar el estado de cada cita (programada, confirmada, completada, cancelada o no asistió). Para llevar un control preciso de la atención brindada a cada cliente.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-10-E1` · Cambio de estado a "completada"<br>Camino feliz | **Dado que** Un cliente terminó su atención en el consultorio<br>**Cuando** La recepcionista marca la cita como "completada"<br>**Entonces** El sistema actualiza el estado y la incluye en los indicadores de citas atendidas del panel de control. | "Completada" cuenta como atendida en el panel. | U `businessRules` · I `functional` › HU-13-E1 (atendidas) | ✅ Verificado |
| `HU-10-E2` · Confirmación de asistencia previa a la cita<br>Flujo alternativo | **Dado que** Un cliente llamó para confirmar que asistirá a su cita del día<br>**Cuando** La recepcionista cambia el estado de "programada" a "confirmada"<br>**Entonces** El sistema actualiza el estado y lo refleja en la agenda del profesional correspondiente. | "Confirmada" con color propio en la agenda del profesional. | I `functional` › HU-10-E2 · E paso HU-10-E2 | ✅ Verificado |
| `HU-10-E3` · Cambio de estado inválido<br>Manejo de error | **Dado que** Una cita se encuentra en estado "cancelada"<br>**Cuando** La recepcionista intenta marcarla directamente como "completada"<br>**Entonces** El sistema muestra "No es posible completar una cita cancelada" y no permite el cambio de estado. | Cancelada → completada rechazada con el mensaje oficial. | U `businessRules` · I `functional` › HU-10-E3 | ✅ Verificado |
| `HU-10-E4` · Cliente que no asistió a la cita<br>Caso de borde | **Dado que** Pasó el horario de la cita y el cliente nunca llegó<br>**Cuando** La recepcionista marca la cita como "no asistió"<br>**Entonces** El sistema actualiza el estado y lo registra para el historial de asistencia del cliente. | "No asistió" solo tras la hora de inicio; historial de asistencia por cliente. | U `businessRules` · I `functional` › HU-10-E4 | ✅ Verificado |

## HU-11 · Control de acceso por roles (RBAC)

**Prioridad alta** · Excel, filas 54–57.

Como administrador, quiero asignar un rol específico (administrador, recepcionista, profesional o cliente) a cada usuario del sistema. Para que cada uno acceda únicamente a las funciones y datos que le corresponden según su perfil.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-11-E1` · Asignación exitosa de un rol<br>Camino feliz | **Dado que** El administrador está creando la cuenta de un nuevo colaborador<br>**Cuando** Le asigna el rol "recepcionista"<br>**Entonces** El sistema habilita únicamente los permisos correspondientes a ese rol (gestión de clientes y citas, sin acceso al panel financiero). | Política RBAC central; recepción sin panel, cuentas ni gestión de profesionales/servicios. | U `policies` · C `api.security` · I `security` · E capturas 07 y menú de recepción | ✅ Verificado |
| `HU-11-E2` · Cambio de rol de un usuario existente<br>Flujo alternativo | **Dado que** Un colaborador tenía el rol "recepcionista"<br>**Cuando** El administrador lo cambia a "profesional"<br>**Entonces** El sistema actualiza sus permisos y le retira el acceso a las funciones exclusivas de recepción. | `PATCH /api/users/:id/role`; la sesión relee el rol en cada petición. | C `api.security` · I `security` › HU-11-E1/E2 | ✅ Verificado |
| `HU-11-E3` · Intento de acceso a una función no autorizada<br>Manejo de error | **Dado que** Un usuario con rol "cliente" ha iniciado sesión<br>**Cuando** Intenta acceder al panel de control de indicadores del negocio<br>**Entonces** El sistema rechaza la solicitud y muestra "No tiene permisos para acceder a esta sección". | 403 con el mensaje oficial y sin datos; la interfaz oculta las secciones no permitidas. | C `api.security` · F `client.test` | ✅ Verificado |
| `HU-11-E4` · Usuario sin rol asignado<br>Caso de borde | **Dado que** Se creó una cuenta de usuario, pero no se le asignó ningún rol<br>**Cuando** El usuario intenta iniciar sesión<br>**Entonces** El sistema le impide el acceso y notifica al administrador que existe una cuenta pendiente de configuración. | Cuenta sin rol: 403 `ACCOUNT_PENDING` y aviso único a los administradores. | U · C `api.security` · I `security` y `demo` | ✅ Verificado |

## HU-12 · Búsqueda y filtrado de citas

**Prioridad media** · Excel, filas 59–62.

Como recepcionista, quiero buscar y filtrar citas por cliente, profesional, servicio o rango de fechas. Para ubicar rápidamente la información que necesito sin revisar toda la agenda manualmente.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-12-E1` · Filtro por nombre de cliente<br>Camino feliz | **Dado que** La recepcionista necesita ubicar las citas de un cliente específico<br>**Cuando** Escribe el nombre del cliente en el buscador<br>**Entonces** El sistema muestra todas las citas asociadas a ese cliente, ordenadas por fecha. | Filtro `q` por nombre de cliente en el servidor, orden por fecha. | I `functional` › HU-12-E1 · E captura 13 | ✅ Verificado |
| `HU-12-E2` · Combinación de filtros<br>Flujo alternativo | **Dado que** La recepcionista desea revisar la carga de trabajo de un profesional<br>**Cuando** Filtra por profesional y por un rango de fechas específico<br>**Entonces** El sistema muestra únicamente las citas que cumplen ambos criterios. | Filtros combinables (cliente, profesional, servicio, estado, rango). | F `lib.test` (consulta) · I `functional` › HU-12-E2 | ✅ Verificado |
| `HU-12-E3` · Rango de fechas inválido<br>Manejo de error | **Dado que** La recepcionista está configurando el filtro de fechas<br>**Cuando** Selecciona una fecha de inicio posterior a la fecha final<br>**Entonces** El sistema muestra "La fecha inicial no puede ser posterior a la fecha final" y no ejecuta la búsqueda. | Rango invertido: la interfaz no busca y la API responde 400 con el mensaje oficial. | U · F · I `functional` › HU-12-E3 · E captura 14 | ✅ Verificado |
| `HU-12-E4` · Búsqueda sin resultados<br>Caso de borde | **Dado que** La recepcionista aplica un filtro por un servicio que no tiene citas registradas en el periodo seleccionado<br>**Cuando** Confirma la búsqueda<br>**Entonces** El sistema muestra el mensaje "No se encontraron citas con los filtros seleccionados". | Mensaje "No se encontraron citas con los filtros seleccionados". | F · I `functional` › HU-12-E4 · E captura 15 | ✅ Verificado |

## HU-13 · Panel de control e indicadores

**Prioridad media** · Excel, filas 64–67.

Como administrador, quiero visualizar un panel con el número de citas programadas, los servicios más solicitados y mis clientes frecuentes. Para tomar decisiones informadas sobre la operación y el crecimiento de mi negocio.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-13-E1` · Visualización del panel con datos del mes<br>Camino feliz | **Dado que** La organización tiene citas registradas durante el mes actual<br>**Cuando** El administrador accede al panel de control<br>**Entonces** El sistema muestra el total de citas programadas, el servicio más solicitado y los tres clientes con más reservas. | Panel del mes: total, programadas, servicio más solicitado y top 3 clientes. | I `functional` › HU-13-E1/E2 · E captura 22 | ✅ Verificado |
| `HU-13-E2` · Cambio de periodo de análisis<br>Flujo alternativo | **Dado que** El panel muestra por defecto los indicadores del mes actual<br>**Cuando** El administrador selecciona "último trimestre"<br>**Entonces** El sistema recalcula los indicadores utilizando únicamente las citas del periodo seleccionado. | Selector de periodo (mes, trimestre, 12 meses) recalculado en el servidor. | U `businessRules` (rangos) · I `functional` › HU-13-E1/E2 | ✅ Verificado |
| `HU-13-E3` · Error al calcular los indicadores<br>Manejo de error | **Dado que** Ocurre una falla temporal al consultar la base de datos<br>**Cuando** El administrador intenta cargar el panel de control<br>**Entonces** El sistema muestra un mensaje de error amigable y no presenta datos incompletos o incorrectos. | `503 DASHBOARD_UNAVAILABLE` amigable; la interfaz descarta datos anteriores y ofrece reintentar. | U `businessRules` · E paso HU-13-E3, captura 23 | ✅ Verificado |
| `HU-13-E4` · Organización sin citas registradas<br>Caso de borde | **Dado que** Una organización recién se registró en la plataforma y aún no tiene citas<br>**Cuando** El administrador accede al panel de control<br>**Entonces** El sistema muestra los indicadores en cero junto con un mensaje de bienvenida indicando que aún no hay datos para mostrar. | Indicadores en cero y mensaje de bienvenida. | U · I `functional` › HU-13-E4 · E captura 01 | ✅ Verificado |

## HU-14 · Aislamiento multiinquilino (SaaS)

**Prioridad alta** · Excel, filas 69–72.

Como administrador de una organización, quiero que mis datos (clientes, empleados, servicios y citas) estén completamente aislados de otras organizaciones que usan la misma plataforma. Para garantizar la privacidad y seguridad de la información de mi negocio frente a otros inquilinos del sistema.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-14-E1` · Consulta de información dentro del propio inquilino<br>Camino feliz | **Dado que** El administrador de la Clínica Dental Sonrisa Real ha iniciado sesión<br>**Cuando** Consulta el listado de clientes y citas<br>**Entonces** El sistema muestra únicamente los registros asociados al identificador (tenantId) de su organización. | Repositorio acotado por `tenantId` en todo acceso. | U `tenantIsolation` · I `security` › HU-14-E1 | ✅ Verificado |
| `HU-14-E2` · Creación de un nuevo registro dentro del inquilino correcto<br>Flujo alternativo | **Dado que** El administrador registra un nuevo servicio<br>**Cuando** El sistema guarda el registro<br>**Entonces** El sistema asigna automáticamente el tenantId de la organización activa, sin requerir que el usuario lo indique manualmente. | `tenantId` fijado por el repositorio; un `tenantId` enviado se rechaza (400). | U · I `security` › HU-14-E2 | ✅ Verificado |
| `HU-14-E3` · Intento de acceso a datos de otra organización<br>Manejo de error | **Dado que** Un usuario autenticado de la Barbería Estilo Urbano intenta manipular la URL para consultar una cita<br>**Cuando** El identificador de la cita pertenece a otra organización (otro tenantId)<br>**Entonces** El sistema rechaza la solicitud en la capa de servicio y no expone ninguna información de la organización ajena. | Acceso por ID ajeno → 404 sin datos ni efectos. | U · I `security` › HU-14-E3 (2 pruebas) | ✅ Verificado |
| `HU-14-E4` · Usuario con sesión válida pero organización desactivada<br>Caso de borde | **Dado que** La organización a la que pertenece el usuario fue suspendida por el proveedor del SaaS<br>**Cuando** El usuario intenta iniciar sesión o realizar una operación<br>**Entonces** El sistema bloquea el acceso y muestra un mensaje indicando que la organización se encuentra inactiva. | Organización suspendida: 403 `TENANT_SUSPENDED` en login y con token previo. | C `api.security` · F `client.test` · I `security` › HU-14-E4 | ✅ Verificado |

## HU-15 · Autenticación segura

**Prioridad alta** · Excel, filas 74–77.

Como usuario del sistema (cliente, recepcionista, profesional o administrador), quiero iniciar sesión con mis credenciales y mantener una sesión protegida mediante un token. Para acceder de forma segura únicamente a las funciones que me corresponden según mi rol y organización.

| Escenario | Criterio Gherkin oficial (Excel) | Implementación | Evidencia ejecutada | Estado |
|---|---|---|---|---|
| `HU-15-E1` · Inicio de sesión exitoso<br>Camino feliz | **Dado que** El usuario tiene una cuenta activa dentro de su organización<br>**Cuando** Ingresa su correo y contraseña correctos<br>**Entonces** El sistema genera un token JWT válido y lo redirige al panel correspondiente a su rol. | Login por código de organización; JWT con `jti`; sección inicial por rol. | C `api.security` (4 roles) · E (cliente → Reservar, recepción → Citas, admin → Indicadores) | ✅ Verificado |
| `HU-15-E2` · Cierre de sesión manual<br>Flujo alternativo | **Dado que** El usuario tiene una sesión activa<br>**Cuando** Selecciona la opción "Cerrar sesión"<br>**Entonces** El sistema invalida el token actual y lo redirige a la pantalla de inicio de sesión. | `POST /api/auth/logout` revoca el token; vuelta a la pantalla de acceso. | C · I `security` › HU-15-E2 · E paso HU-15-E2 | ✅ Verificado |
| `HU-15-E3` · Credenciales incorrectas<br>Manejo de error | **Dado que** El usuario se encuentra en la pantalla de inicio de sesión<br>**Cuando** Ingresa una contraseña incorrecta<br>**Entonces** El sistema rechaza el acceso y muestra "Las credenciales ingresadas no son válidas", sin especificar si el error está en el correo o la contraseña. | Mismo 401 y mensaje oficial para organización, correo o contraseña incorrectos. | C · I `security` › HU-15-E3 · E captura 08 | ✅ Verificado |
| `HU-15-E4` · Token expirado durante el uso del sistema<br>Caso de borde | **Dado que** El token del usuario superó su tiempo de vida útil mientras navegaba en el sistema<br>**Cuando** Intenta realizar una nueva acción (por ejemplo, registrar una cita)<br>**Entonces** El sistema rechaza la solicitud, cierra la sesión automáticamente y solicita un nuevo inicio de sesión. | 401 `TOKEN_EXPIRED`; cierre automático de sesión con aviso. | C · F `client.test` · E captura 12 | ✅ Verificado |
