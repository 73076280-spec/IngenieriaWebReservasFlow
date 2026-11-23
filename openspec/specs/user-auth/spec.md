# user-auth Specification

## Purpose
Permite que cada usuario de una organización inicie sesión con sus credenciales y mantenga una sesión protegida por un token firmado, que expira, puede revocarse y se valida en cada petición (HU-15).

## Requirements

### Requirement: Inicio de sesión con credenciales
El sistema SHALL autenticar a un usuario con el código o ID de su organización, su correo y su contraseña, y SHALL emitir un token JWT firmado con expiración, un identificador único y el rol del usuario en la respuesta.

#### Scenario: HU-15-E1 Inicio de sesión exitoso
- **GIVEN** un usuario con cuenta activa y rol asignado en una organización activa
- **WHEN** envía su correo y contraseña correctos
- **THEN** el sistema responde 200 con un token JWT válido y el rol del usuario
- **AND** la interfaz lo dirige a la sección inicial de su rol

### Requirement: Rechazo uniforme de credenciales inválidas
El sistema MUST responder 401 con el mensaje "Las credenciales ingresadas no son válidas" cuando el correo no existe o la contraseña es incorrecta, sin revelar cuál de los dos datos falló.

#### Scenario: HU-15-E3 Contraseña incorrecta
- **WHEN** el usuario envía una contraseña incorrecta
- **THEN** el sistema responde 401 con "Las credenciales ingresadas no son válidas" y no emite token

#### Scenario: HU-15-E3 Correo inexistente
- **WHEN** se envía un correo que no existe en la organización
- **THEN** la respuesta es idéntica en código y mensaje a la de contraseña incorrecta

### Requirement: Cierre de sesión con invalidación del token
El sistema SHALL invalidar en el servidor el token usado para cerrar sesión, de modo que cualquier petición posterior con ese token sea rechazada hasta su expiración natural.

#### Scenario: HU-15-E2 Cierre de sesión manual
- **GIVEN** un usuario con sesión activa
- **WHEN** selecciona "Cerrar sesión"
- **THEN** el sistema invalida el token actual y la interfaz muestra la pantalla de inicio de sesión

#### Scenario: HU-15-E2 Reutilización de un token cerrado
- **GIVEN** un token cuya sesión fue cerrada
- **WHEN** se usa en una petición protegida
- **THEN** el sistema responde 401 con el código `SESSION_REVOKED`

### Requirement: Rechazo de tokens expirados o inválidos
El sistema MUST rechazar con 401 y un código estable (`SESSION_REQUIRED`, `TOKEN_EXPIRED`, `SESSION_INVALID`, `SESSION_REVOKED`) toda petición protegida sin token, con token vencido, alterado o revocado, sin ejecutar la operación solicitada.

#### Scenario: HU-15-E4 Token expirado durante el uso del sistema
- **GIVEN** un token que superó su tiempo de vida
- **WHEN** el usuario intenta registrar una cita
- **THEN** el sistema responde 401 con el código `TOKEN_EXPIRED` y no crea la cita

#### Scenario: Token alterado
- **WHEN** se envía un token con firma inválida
- **THEN** el sistema responde 401 con el código `SESSION_INVALID`

### Requirement: Cierre automático de sesión en la interfaz
La interfaz SHALL tratar cualquier respuesta 401 de la API, y las respuestas 403 de organización suspendida o cuenta pendiente, eliminando el token local, mostrando el motivo y solicitando un nuevo inicio de sesión.

#### Scenario: HU-04-E4 Sesión expirada al confirmar una reserva
- **GIVEN** la sesión expiró mientras el usuario completaba el formulario de reserva
- **WHEN** confirma la cita
- **THEN** la API rechaza la solicitud sin crear el registro y la interfaz solicita iniciar sesión nuevamente
