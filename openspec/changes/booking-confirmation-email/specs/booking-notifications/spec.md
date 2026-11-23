# Spec Delta

## Purpose

Confirmación por correo de las reservas registradas y registro del estado de cada confirmación, sin comprometer la reserva ni la privacidad entre organizaciones (HU-04-E1).

## ADDED Requirements

### Requirement: Confirmación de la reserva por correo
Al registrar una cita, el sistema SHALL generar una confirmación por correo dirigida al correo de la ficha del cliente, con el código de reserva, la organización, el servicio, el profesional, la fecha y el horario en la zona horaria de la organización. El mensaje SHALL tener versión HTML y de texto plano, y MUST escapar todo dato ingresado por usuarios.

#### Scenario: HU-04-E1 Reserva exitosa con confirmación
- **GIVEN** un cliente con correo registrado que reserva un horario libre
- **WHEN** confirma la reserva
- **THEN** la cita queda "programada" y se genera el correo con el código, el servicio, el profesional, la fecha y la hora
- **AND** la respuesta indica el estado de la confirmación

#### Scenario: Cliente sin correo
- **GIVEN** un cliente sin correo registrado
- **WHEN** se registra su cita
- **THEN** la cita se crea y la confirmación queda en estado `sin_correo`

### Requirement: La reserva no depende del correo
Si la confirmación falla, la cita MUST conservarse y la confirmación queda `fallida` con un código de error genérico.

#### Scenario: Falla al generar la confirmación
- **GIVEN** un fallo del módulo de correo
- **WHEN** se registra una cita
- **THEN** la cita existe con estado "programada" y la confirmación queda `fallida`

### Requirement: Una única confirmación por cita
El sistema MUST reservar cada confirmación de forma atómica para no generar duplicados. El reintento manual, reservado al personal, SHALL proceder solo si la anterior falló o si el cliente no tenía correo; en otro caso responde 409 `CONFIRMATION_ALREADY_SENT`.

#### Scenario: Reintentos simultáneos
- **GIVEN** una cita cuya confirmación falló
- **WHEN** dos usuarios solicitan el reenvío al mismo tiempo
- **THEN** se genera un solo correo y la otra solicitud recibe 409

### Requirement: Modo de prueba explícito
El sistema SHALL registrar el estado `simulada` para los correos generados en la bandeja local y MUST NOT presentarlos como enviados por Internet.

#### Scenario: Demostración sin correo real
- **GIVEN** el modo `file`
- **WHEN** se registra una cita
- **THEN** el correo se guarda en la bandeja local, la confirmación queda `simulada` y la interfaz indica que no se envió un correo real
