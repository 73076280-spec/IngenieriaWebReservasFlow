# Spec Delta

## Purpose

Registro de citas por el personal y por el propio cliente, asignación automática de profesional y prevención de reservas duplicadas (HU-04, HU-09).

## ADDED Requirements

### Requirement: Reserva por el cliente
Un usuario con rol cliente SHALL poder reservar una cita para sí mismo eligiendo servicio, profesional y un horario libre. La cita MUST quedar en estado "programada", asociada a la ficha de cliente de la sesión (se ignora cualquier `clientId` enviado), y el sistema SHALL devolver un comprobante con el código de reserva.

#### Scenario: HU-04-E1 Reserva exitosa de una cita
- **GIVEN** un cliente autenticado y un horario libre del profesional
- **WHEN** confirma la reserva
- **THEN** el sistema registra la cita "programada" a su nombre y devuelve el comprobante

### Requirement: Asignación automática de profesional
Si la reserva no indica profesional, el sistema SHALL asignar el primer profesional activo, habilitado para el servicio y libre en ese horario.

#### Scenario: HU-04-E2 Reserva sin preferencia de profesional
- **GIVEN** un profesional habilitado ocupado y otro libre a la misma hora
- **WHEN** se reserva con "Cualquier profesional disponible"
- **THEN** la cita se asigna al profesional libre y habilitado

### Requirement: Horario fuera del turno
El sistema MUST rechazar con 409 y el mensaje "El horario seleccionado no está disponible" una reserva fuera del turno del profesional, sin crear registros.

#### Scenario: HU-04-E3 Reserva fuera del horario laboral
- **GIVEN** un profesional con turno de 09:00 a 18:00
- **WHEN** se intenta reservar a las 20:00
- **THEN** el sistema responde 409 con "El horario seleccionado no está disponible" y no crea la cita

### Requirement: Sin reservas duplicadas
El sistema MUST impedir dos citas activas que compartan un bloque del mismo profesional, también ante solicitudes simultáneas. La solicitud que pierde SHALL recibir 409 `SLOT_TAKEN` "El horario seleccionado ya no está disponible". Un horario liberado por cancelación SHALL poder reservarse de inmediato.

#### Scenario: HU-09-E3 Condición de carrera
- **GIVEN** dos solicitudes para el mismo profesional y horario enviadas a la vez
- **WHEN** el servidor las procesa
- **THEN** solo una crea la cita y la otra recibe 409 `SLOT_TAKEN`

#### Scenario: HU-09-E4 Horario liberado justo antes
- **GIVEN** una cita cancelada
- **WHEN** otro cliente reserva ese mismo horario
- **THEN** el sistema crea la nueva cita
