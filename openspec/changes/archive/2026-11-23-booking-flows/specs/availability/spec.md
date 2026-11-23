# Spec Delta

## Purpose

Consulta de horarios libres por servicio, fecha y profesional, y sugerencias cuando un horario está ocupado (HU-07, HU-09-E1, HU-09-E2).

## ADDED Requirements

### Requirement: Consulta de bloques disponibles
El sistema SHALL devolver los inicios libres de una fecha para un servicio, calculados con la duración del servicio, el turno del profesional en la zona horaria de la organización y los bloques ya ocupados. Sin profesional indicado SHALL combinar la agenda de todos los profesionales activos habilitados para el servicio e indicar qué profesionales están libres en cada inicio.

#### Scenario: HU-07-E1 Consulta con horarios disponibles
- **GIVEN** un servicio de 30 minutos y un profesional con turno de 09:00 a 12:00
- **WHEN** se consulta una fecha futura para ese servicio y profesional
- **THEN** el sistema devuelve inicios cada 15 minutos cuyo bloque completo cabe en el turno

#### Scenario: HU-07-E2 Consulta sin filtrar por profesional
- **GIVEN** dos profesionales habilitados para el servicio y uno no habilitado
- **WHEN** se consulta sin indicar profesional
- **THEN** el sistema devuelve la unión de los inicios libres de los habilitados con los profesionales disponibles en cada uno

#### Scenario: HU-09-E1 Bloque ocupado no se ofrece
- **GIVEN** una cita de 15:00 a 15:30 con un profesional
- **WHEN** se consulta la disponibilidad de ese profesional
- **THEN** ningún bloque devuelto se superpone con 15:00–15:30

### Requirement: Validación del rango de fechas
El sistema MUST rechazar con 400 y el mensaje "No es posible consultar disponibilidad para fechas pasadas" una fecha anterior a hoy, y MUST rechazar fechas a más de 90 días.

#### Scenario: HU-07-E3 Fecha anterior a la actual
- **GIVEN** un usuario consultando disponibilidad
- **WHEN** selecciona una fecha anterior a hoy
- **THEN** el sistema responde 400 con "No es posible consultar disponibilidad para fechas pasadas" sin calcular bloques

### Requirement: Agenda llena con fechas sugeridas
Cuando no haya bloques libres, el sistema SHALL responder con la lista vacía, el mensaje "No hay horarios disponibles para esta fecha" y hasta tres fechas cercanas con disponibilidad.

#### Scenario: HU-07-E4 Profesional sin horarios en la fecha
- **GIVEN** un profesional con la agenda completa en la fecha elegida
- **WHEN** se consulta su disponibilidad
- **THEN** el sistema devuelve "No hay horarios disponibles para esta fecha" y fechas sugeridas que sí tienen bloques libres

### Requirement: Sugerencia del horario libre más cercano
Cuando un horario solicitado esté ocupado, el sistema SHALL sugerir el inicio libre más cercano con el mismo profesional y, si no existe, con otro profesional habilitado para el servicio.

#### Scenario: HU-09-E2 Sugerencia de horario alternativo
- **GIVEN** un horario ya ocupado
- **WHEN** se intenta reservarlo
- **THEN** la respuesta 409 incluye el inicio libre más cercano y su profesional
