# access-control Specification

## Purpose
Define los roles de la plataforma (administrador, recepcionista, profesional y cliente), los permisos de cada uno y la administración de roles, aplicados de forma centralizada en la API y reflejados en la interfaz (HU-11).

## Requirements

### Requirement: Política centralizada de permisos por rol
El sistema SHALL decidir cada acceso con una única política de permisos por rol. Recepcionista: gestión completa de clientes (incluida su eliminación, HU-01) y de citas, lectura de profesionales y servicios. Profesional: lectura y cambio de estado de sus propias citas. Cliente: consulta de disponibilidad y reserva, reprogramación y cancelación únicamente de sus propias citas. Administrador: todo, incluido el panel de indicadores, la configuración y las cuentas.

#### Scenario: HU-11-E1 Permisos del rol recepcionista
- **GIVEN** un usuario con rol recepcionista
- **WHEN** gestiona clientes y citas
- **THEN** el sistema permite las operaciones
- **AND** al solicitar el panel de indicadores o crear un profesional o servicio responde 403

#### Scenario: Profesional limitado a sus citas
- **GIVEN** un profesional vinculado a un perfil de empleado
- **WHEN** consulta las citas
- **THEN** el sistema devuelve solo las citas asignadas a ese perfil

#### Scenario: Cliente limitado a sus citas
- **GIVEN** un usuario con rol cliente vinculado a su ficha de cliente
- **WHEN** consulta, reprograma o cancela citas
- **THEN** el sistema solo opera sobre sus propias citas y responde 404 ante citas de otros clientes

### Requirement: Mensaje uniforme ante acceso no autorizado
El sistema MUST responder 403 con el mensaje "No tiene permisos para acceder a esta sección" y sin datos cuando un rol solicita una función no permitida.

#### Scenario: HU-11-E3 Cliente intenta abrir el panel de indicadores
- **GIVEN** un usuario con rol cliente autenticado
- **WHEN** solicita el panel de indicadores
- **THEN** el sistema responde 403 con "No tiene permisos para acceder a esta sección" sin datos del negocio

### Requirement: Cuentas sin rol pendientes de configuración
El sistema MUST NOT asignar un rol por defecto. Una cuenta sin rol SHALL quedar pendiente: su inicio de sesión se rechaza con 403 y código `ACCOUNT_PENDING`, y se registra un aviso para los administradores de su organización.

#### Scenario: HU-11-E4 Usuario sin rol asignado
- **GIVEN** una cuenta creada sin rol
- **WHEN** el usuario intenta iniciar sesión con credenciales correctas
- **THEN** el sistema responde 403 con código `ACCOUNT_PENDING` y no emite token
- **AND** los administradores de la organización ven un aviso de cuenta pendiente de configuración

### Requirement: Administración de cuentas y roles
El administrador SHALL poder crear cuentas de colaboradores con un rol (o sin rol, quedando pendientes) y cambiar el rol de una cuenta existente de su organización; el cambio MUST aplicarse en la siguiente petición de esa cuenta. Un administrador MUST NOT poder quitarse su propio rol de administrador.

#### Scenario: HU-11-E1 Asignación de rol al crear un colaborador
- **WHEN** el administrador crea una cuenta con rol "recepcionista"
- **THEN** la cuenta inicia sesión y solo obtiene los permisos de recepción

#### Scenario: HU-11-E2 Cambio de rol de un usuario existente
- **GIVEN** un colaborador con rol recepcionista y sesión activa
- **WHEN** el administrador cambia su rol a profesional
- **THEN** la siguiente petición de ese colaborador a una función exclusiva de recepción responde 403
