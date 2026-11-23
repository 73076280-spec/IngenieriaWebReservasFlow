# Spec Delta

## Purpose

Búsqueda y filtrado de citas (HU-12).

## ADDED Requirements

### Requirement: Filtros combinables en el servidor
`GET /api/appointments` SHALL aceptar `q` (nombre de cliente), `clientId`, `employeeId`, `serviceId`, `status`, `from` y `to`, combinarlos con Y lógico dentro de la organización y el alcance del rol, y devolver las citas ordenadas por fecha.

#### Scenario: HU-12-E1 Filtro por nombre de cliente
- **GIVEN** citas de varios clientes
- **WHEN** se busca por el nombre de un cliente
- **THEN** se devuelven solo sus citas ordenadas por fecha

#### Scenario: HU-12-E2 Combinación de filtros
- **GIVEN** citas de varios profesionales en varias fechas
- **WHEN** se filtra por un profesional y un rango de fechas
- **THEN** se devuelven solo las citas que cumplen ambos criterios

### Requirement: Validación del rango y resultados vacíos
Un rango con inicio posterior al fin MUST rechazarse con 400 "La fecha inicial no puede ser posterior a la fecha final" sin ejecutar la búsqueda. Sin coincidencias, la interfaz SHALL mostrar "No se encontraron citas con los filtros seleccionados".

#### Scenario: HU-12-E3 Rango de fechas inválido
- **GIVEN** la recepcionista configurando el filtro de fechas
- **WHEN** la fecha inicial es posterior a la final
- **THEN** el sistema muestra "La fecha inicial no puede ser posterior a la fecha final" y no busca

#### Scenario: HU-12-E4 Búsqueda sin resultados
- **GIVEN** un servicio sin citas en el periodo
- **WHEN** se filtra por ese servicio
- **THEN** la lista está vacía y se muestra "No se encontraron citas con los filtros seleccionados"
