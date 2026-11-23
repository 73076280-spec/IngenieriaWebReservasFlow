# agenda-calendar Specification

## Purpose
Agenda diaria, semanal y mensual en un calendario interactivo (HU-08).

## Requirements

### Requirement: Calendario por rango con colores por estado
La interfaz SHALL mostrar las citas del rango visible en vistas mensual, semanal y diaria, con un color distinto por estado y una leyenda. El profesional SHALL ver solo sus citas; el personal SHALL poder filtrar por profesional y ver su horario laboral. Al seleccionar una cita SHALL mostrar cliente, servicio, profesional, horario y estado.

#### Scenario: HU-08-E1 Agenda semanal del profesional
- **GIVEN** un profesional autenticado con citas en varios estados
- **WHEN** abre la vista semanal
- **THEN** ve solo sus citas, organizadas por día y hora, con color según el estado

#### Scenario: HU-08-E2 Cambio de vista mensual a diaria
- **GIVEN** la vista mensual
- **WHEN** cambia a la vista diaria de un día
- **THEN** ve solo las citas de ese día con cliente y servicio

### Requirement: Estados de error y vacío de la agenda
Si la carga falla, la interfaz SHALL mostrar "No se pudo cargar la agenda" con un botón "Reintentar". Si el rango visible no tiene citas, SHALL mostrar un aviso de que no hay citas programadas, sin errores.

#### Scenario: HU-08-E3 Error al cargar la agenda
- **GIVEN** una falla temporal del servidor
- **WHEN** el profesional abre el calendario
- **THEN** ve el mensaje de error y puede reintentar la carga

#### Scenario: HU-08-E4 Día sin citas
- **GIVEN** un día sin citas
- **WHEN** abre la vista diaria
- **THEN** ve el día vacío con el aviso "No hay citas programadas para este día"
