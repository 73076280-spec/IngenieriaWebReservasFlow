# Spec Delta

## Purpose

Garantiza que los datos de cada organización (clientes, profesionales, servicios, citas y cuentas) queden aislados de las demás organizaciones de la plataforma y que una organización suspendida no pueda operar (HU-14).

## ADDED Requirements

### Requirement: Lecturas acotadas a la organización de la sesión
El sistema SHALL filtrar toda lectura de datos de negocio por el `tenantId` derivado de la sesión verificada, nunca por un valor enviado por el cliente.

#### Scenario: HU-14-E1 Consulta dentro del propio inquilino
- **GIVEN** dos organizaciones con clientes y citas propios
- **WHEN** el administrador de una de ellas consulta el listado de clientes y de citas
- **THEN** el sistema devuelve solo los registros de su organización

### Requirement: Asignación automática del tenantId
El sistema SHALL asignar el `tenantId` de la organización activa a todo registro creado y MUST rechazar con 400 cualquier cuerpo que intente indicar un `tenantId`.

#### Scenario: HU-14-E2 Creación de un registro en el inquilino correcto
- **WHEN** el administrador registra un servicio sin indicar organización
- **THEN** el servicio se guarda con el `tenantId` de su sesión

#### Scenario: HU-14-E2 Intento de fijar otro tenantId
- **WHEN** el cuerpo de la petición incluye un `tenantId`
- **THEN** el sistema responde 400 y no crea el registro

### Requirement: Rechazo del acceso por ID a datos de otra organización
El sistema MUST responder 404 sin datos cuando una lectura, modificación o eliminación por ID se refiere a un registro de otra organización, sin producir efectos sobre ese registro.

#### Scenario: HU-14-E3 Manipulación de la URL de una cita
- **GIVEN** un usuario autenticado de la organización A
- **WHEN** solicita el detalle de una cita cuyo ID pertenece a la organización B
- **THEN** el sistema responde 404 sin exponer información de B

#### Scenario: HU-14-E3 Modificación cruzada
- **WHEN** el mismo usuario intenta editar o eliminar un cliente de la organización B por su ID
- **THEN** el sistema responde 404 y el cliente de B no cambia

### Requirement: Bloqueo de organizaciones suspendidas
El sistema MUST impedir el inicio de sesión y toda petición autenticada de usuarios de una organización con estado `suspendida`, respondiendo 403 con el código `TENANT_SUSPENDED` y el mensaje "La organización se encuentra inactiva. Contacte al proveedor del servicio."

#### Scenario: HU-14-E4 Inicio de sesión con organización suspendida
- **GIVEN** una organización suspendida por el proveedor
- **WHEN** uno de sus usuarios intenta iniciar sesión con credenciales correctas
- **THEN** el sistema responde 403 con el mensaje de organización inactiva y no emite token

#### Scenario: HU-14-E4 Token previo tras la suspensión
- **GIVEN** un usuario con token emitido antes de la suspensión
- **WHEN** realiza una operación
- **THEN** el sistema responde 403 con el código `TENANT_SUSPENDED` y no ejecuta la operación
