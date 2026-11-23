# appointment-lifecycle Specification

## Purpose
Reprogramación, cancelación, estados de la cita e historial de asistencia (HU-05, HU-06, HU-10).

## Requirements

### Requirement: Reprogramación conservando la reserva
El sistema SHALL mover una cita activa a otro horario libre conservando su identificador, opcionalmente con otro profesional activo habilitado para el mismo servicio, liberando los bloques anteriores en la misma transacción.

#### Scenario: HU-05-E1 Reprogramación exitosa
- **GIVEN** una cita programada
- **WHEN** se elige otro horario libre con el mismo profesional
- **THEN** la cita conserva su identificador con la nueva fecha y hora

#### Scenario: HU-05-E2 Reprogramación con cambio de profesional
- **GIVEN** otro profesional habilitado para el servicio con un horario libre
- **WHEN** se reprograma con ese profesional
- **THEN** la cita queda asignada al nuevo profesional y el horario anterior queda libre

### Requirement: Plazo mínimo para reprogramar
La organización SHALL configurar un plazo mínimo de anticipación (2 horas por defecto). Un cliente MUST NOT reprogramar una cita que empieza antes de ese plazo; el sistema responde 409 con "No es posible reprogramar con menos de N horas de anticipación".

#### Scenario: HU-05-E3 Reprogramación fuera del plazo
- **GIVEN** un plazo de 2 horas y una cita del cliente que empieza en 30 minutos
- **WHEN** el cliente intenta reprogramarla
- **THEN** el sistema responde "No es posible reprogramar con menos de 2 horas de anticipación" y la cita no cambia

### Requirement: Citas inactivas no se reprograman
El sistema MUST rechazar la reprogramación de una cita cancelada, completada o no asistida con 409 `APPOINTMENT_INACTIVE` indicando que ya no está activa y sugiriendo una nueva reserva.

#### Scenario: HU-05-E4 Reprogramar una cita cancelada
- **GIVEN** una cita cancelada
- **WHEN** se intenta reprogramar
- **THEN** el sistema indica que la cita ya no está activa, sugiere una nueva reserva y la cita sigue cancelada

### Requirement: Cancelación con motivo
La cancelación SHALL cambiar el estado a "cancelada", liberar los bloques y guardar el motivo elegido de una lista y la fecha de cancelación.

#### Scenario: HU-06-E1 Cancelación exitosa
- **GIVEN** una cita programada
- **WHEN** recepción confirma la cancelación
- **THEN** la cita queda "cancelada" y su horario vuelve a estar disponible

#### Scenario: HU-06-E2 Cancelación con motivo
- **GIVEN** recepción cancelando una cita
- **WHEN** selecciona el motivo "cliente no puede asistir"
- **THEN** el motivo queda guardado y se refleja en las estadísticas del panel

### Requirement: Transiciones de estado válidas
El sistema SHALL aplicar la máquina de estados: desde "programada" a confirmada, completada, cancelada o no asistió; desde "confirmada" a completada, cancelada o no asistió. Los estados completada, cancelada y no asistió son finales. Los mensajes MUST ser "No es posible cancelar una cita ya completada" y "No es posible completar una cita cancelada" en esos casos. "No asistió" solo se admite después de la hora de inicio.

#### Scenario: HU-06-E3 Cancelar una cita completada
- **GIVEN** una cita completada
- **WHEN** se intenta cancelar
- **THEN** el sistema responde "No es posible cancelar una cita ya completada" y el estado no cambia

#### Scenario: HU-10-E1 Marcar como completada
- **GIVEN** una cita programada
- **WHEN** recepción la marca como completada
- **THEN** el estado cambia y la cita cuenta como atendida en el panel

#### Scenario: HU-10-E2 Confirmación de asistencia
- **GIVEN** una cita programada
- **WHEN** recepción la cambia a confirmada
- **THEN** el estado cambia y la agenda del profesional la muestra como confirmada

#### Scenario: HU-10-E3 Completar una cita cancelada
- **GIVEN** una cita cancelada
- **WHEN** se intenta marcar como completada
- **THEN** el sistema responde "No es posible completar una cita cancelada"

#### Scenario: HU-10-E4 Cliente que no asistió
- **GIVEN** una cita cuya hora de inicio ya pasó
- **WHEN** recepción la marca como "no asistió"
- **THEN** el estado cambia y aparece en el historial de asistencia del cliente

### Requirement: Modificaciones simultáneas
Cuando la solicitud indique la versión leída de la cita y esta haya cambiado, el sistema MUST rechazarla con 409 `APPOINTMENT_UPDATED` "La cita ya fue actualizada por otro usuario" sin aplicar cambios.

#### Scenario: HU-06-E4 Cancelación simultánea por dos usuarios
- **GIVEN** dos usuarios con la misma versión de una cita
- **WHEN** ambos envían una acción sobre ella casi al mismo tiempo
- **THEN** se aplica solo la primera y la segunda recibe 409 `APPOINTMENT_UPDATED`

### Requirement: Historial de asistencia del cliente
El sistema SHALL ofrecer al personal autorizado el historial de citas de un cliente con el conteo de completadas, canceladas y no asistidas.

#### Scenario: Historial tras una inasistencia
- **GIVEN** un cliente con una cita marcada como "no asistió"
- **WHEN** recepción abre su historial
- **THEN** la cita aparece y el conteo de inasistencias es 1
