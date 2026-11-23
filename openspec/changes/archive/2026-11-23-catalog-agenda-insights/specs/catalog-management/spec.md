# Spec Delta

## Purpose

Gestión de clientes, profesionales y servicios de la organización (HU-01, HU-02, HU-03).

## ADDED Requirements

### Requirement: Registro y edición de clientes
El sistema SHALL registrar clientes con nombre, teléfono, correo y notas de atención dentro de la organización de la sesión, y SHALL editarlos conservando su identificador y su historial de citas. Un correo con formato inválido MUST rechazarse con "El correo electrónico no tiene un formato válido".

#### Scenario: HU-01-E1 Registro exitoso de un cliente
- **GIVEN** una recepcionista autenticada
- **WHEN** registra un cliente con nombre, teléfono y correo válidos
- **THEN** el cliente aparece solo en el listado de su organización

#### Scenario: HU-01-E2 Edición de un cliente existente
- **GIVEN** un cliente con citas
- **WHEN** se actualiza su teléfono
- **THEN** el cliente conserva su identificador y sus citas siguen asociadas

#### Scenario: HU-01-E3 Correo con formato inválido
- **GIVEN** una recepcionista registrando un cliente
- **WHEN** ingresa el correo "juan@correo"
- **THEN** el sistema responde "El correo electrónico no tiene un formato válido" y no guarda el registro

### Requirement: Protección al eliminar clientes
El sistema MUST impedir la eliminación de un cliente con citas pendientes, indicando que primero debe cancelar o reasignar esas citas.

#### Scenario: HU-01-E4 Eliminar un cliente con citas activas
- **GIVEN** un cliente con una cita programada a futuro
- **WHEN** la recepcionista intenta eliminarlo
- **THEN** el sistema responde 409 indicando que primero debe cancelar o reasignar sus citas pendientes y el cliente se conserva

### Requirement: Profesionales con especialidad y turnos
El sistema SHALL registrar profesionales con nombre, especialidad obligatoria, servicios habilitados y turnos por día (inicio anterior al fin, sin solapes). Sin especialidad MUST responder "Debe seleccionar al menos una especialidad". La disponibilidad SHALL reflejar los turnos actualizados.

#### Scenario: HU-02-E1 Registro de un profesional
- **GIVEN** el administrador autenticado
- **WHEN** registra un profesional con nombre, especialidad y turno
- **THEN** el profesional queda activo y recibe citas solo dentro de su turno

#### Scenario: HU-02-E2 Modificación del horario laboral
- **GIVEN** un profesional con turno de lunes a viernes
- **WHEN** el administrador agrega el sábado
- **THEN** la disponibilidad del sábado muestra bloques libres

#### Scenario: HU-02-E3 Registro sin especialidad
- **GIVEN** el administrador registrando un profesional
- **WHEN** guarda sin especialidad
- **THEN** el sistema responde "Debe seleccionar al menos una especialidad" y no guarda

### Requirement: Desactivación de profesionales
El sistema SHALL desactivar profesionales en lugar de eliminarlos cuando tengan citas. MUST rechazar la desactivación si el profesional tiene citas futuras pendientes, indicando cuántas y solicitando reasignarlas.

#### Scenario: HU-02-E4 Desactivar un profesional con citas futuras
- **GIVEN** un profesional con citas programadas la próxima semana
- **WHEN** el administrador intenta desactivarlo
- **THEN** el sistema responde 409 con la advertencia de citas pendientes y el perfil sigue activo

### Requirement: Servicios con duración y costo
El sistema SHALL registrar servicios con duración (múltiplo de 15, mayor que cero) y costo no negativo. Una duración cero o negativa MUST rechazarse con "La duración del servicio debe ser mayor que cero". El precio de una cita SHALL fijarse al reservar y no cambiar al editar el servicio.

#### Scenario: HU-03-E1 Creación de un servicio
- **GIVEN** el administrador en la sección de servicios
- **WHEN** registra "Cambio de aceite" de 30 minutos y S/ 45
- **THEN** el servicio queda disponible para reservar

#### Scenario: HU-03-E2 Actualización del costo
- **GIVEN** una cita reservada con el servicio a S/ 20
- **WHEN** el costo cambia a S/ 25
- **THEN** la cita conserva S/ 20 y las nuevas reservas usan S/ 25

#### Scenario: HU-03-E3 Duración inválida
- **GIVEN** el administrador registrando un servicio
- **WHEN** ingresa una duración de 0 o negativa
- **THEN** el sistema responde "La duración del servicio debe ser mayor que cero" y no guarda

### Requirement: Servicios con citas se desactivan
El sistema MUST impedir eliminar un servicio con citas asociadas y SHALL sugerir desactivarlo. Un servicio inactivo no admite nuevas reservas y conserva sus citas.

#### Scenario: HU-03-E4 Eliminar un servicio con citas futuras
- **GIVEN** el servicio "Limpieza dental" con citas futuras
- **WHEN** el administrador intenta eliminarlo
- **THEN** el sistema responde 409 sugiriendo desactivarlo y el servicio y sus citas se conservan
