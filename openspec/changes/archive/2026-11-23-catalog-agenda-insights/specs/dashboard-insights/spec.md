# Spec Delta

## Purpose

Panel de control con indicadores por periodo (HU-13).

## ADDED Requirements

### Requirement: Indicadores por periodo
`GET /api/dashboard` SHALL calcular, por defecto para el mes actual y opcionalmente para el último trimestre o año: citas por estado (programadas, confirmadas, completadas, canceladas, no asistidas), servicio más solicitado, los tres clientes con más reservas y las cancelaciones por motivo, usando solo citas de la organización cuya fecha de inicio está en el periodo.

#### Scenario: HU-13-E1 Panel con datos del mes
- **GIVEN** citas este mes y en meses anteriores
- **WHEN** el administrador abre el panel
- **THEN** ve el total de citas programadas, el servicio más solicitado y los tres clientes con más reservas del mes

#### Scenario: HU-13-E2 Cambio de periodo
- **GIVEN** el panel del mes actual
- **WHEN** selecciona "último trimestre"
- **THEN** los indicadores se recalculan con las citas del trimestre, incluidas las de meses anteriores

### Requirement: Error amigable y organización sin datos
Ante una falla al consultar la base, el sistema SHALL responder 503 con un mensaje amigable y la interfaz MUST NOT mostrar datos anteriores o incompletos. Una organización sin citas SHALL ver los indicadores en cero y un mensaje de bienvenida.

#### Scenario: HU-13-E3 Error al calcular los indicadores
- **GIVEN** una falla temporal de la base de datos
- **WHEN** el administrador carga el panel
- **THEN** recibe un mensaje de error amigable y ningún indicador

#### Scenario: HU-13-E4 Organización sin citas
- **GIVEN** una organización recién registrada
- **WHEN** el administrador abre el panel
- **THEN** ve los indicadores en cero y un mensaje de bienvenida indicando que aún no hay datos
