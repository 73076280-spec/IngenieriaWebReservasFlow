# Design

## Context

Los catálogos ya pasan por `catalogService` y repositorios acotados por organización. El panel calcula conteos globales sin periodo. La agenda carga todas las citas al iniciar sesión y convierte los errores en una lista vacía.

## Goals / Non-Goals

**Goals:** cubrir HU-01, HU-02, HU-03, HU-08, HU-12 y HU-13 con los mensajes oficiales y estados de interfaz explícitos (carga, vacío, error).

**Non-Goals:** exportar informes, gráficos avanzados, papelera de registros eliminados.

## Decisions

1. **Eliminar vs. desactivar.** Un cliente con citas pendientes (programada/confirmada futuras) no se elimina: `409 HAS_ACTIVE_APPOINTMENTS` con el número de citas y la indicación de cancelarlas o reasignarlas. Con solo historial tampoco se elimina (`HAS_HISTORY`), para no romper el historial de citas. Profesionales y servicios con citas se **desactivan** (`active:false`) en lugar de eliminarse.
2. **Desactivar un profesional** con citas futuras activas → `409 HAS_FUTURE_APPOINTMENTS` con el número; el perfil sigue activo hasta reasignarlas (reprogramación con otro profesional, booking-flows). Un **servicio** se puede desactivar aunque tenga citas futuras: estas se conservan y no se aceptan reservas nuevas.
3. **Turnos.** Editor de un tramo por día de la semana en la interfaz; la API admite varios tramos por día y valida inicio < fin y que no se solapen.
4. **Filtros en el servidor.** `q` busca clientes por nombre (expresión escapada, sin distinción de mayúsculas) dentro de la organización y filtra por sus IDs. Rango invertido → `400 INVALID_RANGE` "La fecha inicial no puede ser posterior a la fecha final"; la interfaz lo valida también antes de llamar.
5. **Periodos del panel** (zona horaria de la organización, por fecha de inicio de la cita): `mes` = mes calendario actual; `trimestre` = mes actual y los dos anteriores; `anio` = mes actual y los once anteriores. Servicio más solicitado y clientes frecuentes excluyen canceladas.
6. **Errores del panel.** Un fallo de base se traduce en `503 DASHBOARD_UNAVAILABLE` con mensaje amigable; la interfaz descarta los datos anteriores y ofrece reintento.
7. **Agenda por rango visible.** El calendario pide `from/to` del rango visible, maneja carga, error con reintento y aviso de periodo sin citas.

## Risks / Trade-offs

- Bloquear el borrado de clientes con historial reduce la flexibilidad, pero protege HU-01-E2 (historial intacto).
