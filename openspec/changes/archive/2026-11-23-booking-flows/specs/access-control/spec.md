# Spec Delta

## MODIFIED Requirements

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
