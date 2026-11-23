# Tasks

## 1. Catálogos (HU-01, HU-02, HU-03)

- [x] 1.1 `Client.notes`, mensajes oficiales de correo, especialidad y duración; validación de turnos (inicio < fin, sin solapes); verificar con pruebas unitarias de esquemas — *`businessRules.test.js`*
- [x] 1.2 Eliminación protegida (`HAS_ACTIVE_APPOINTMENTS`, `HAS_HISTORY`, `HAS_APPOINTMENTS`, `HAS_FUTURE_APPOINTMENTS`) y `PATCH /:kind/:id/status`; verificar HU-01-E4, HU-02-E4 y HU-03-E4 en integración — *aprobadas*
- [x] 1.3 Interfaz: notas, especialidad y servicios habilitados, editor de turnos, activar/desactivar, advertencias accionables; verificar con `vite build` — *compilación correcta; E2E HU-01-E1/E3, HU-02-E1/E2/E3, HU-03-E1/E3*

## 2. Agenda (HU-08)

- [x] 2.1 Calendario por rango visible con colores y leyenda, filtro por profesional y horario laboral, detalle, aviso de vacío y error con reintento; verificar con pruebas del frontend y `vite build` — *E2E HU-08-E1..E4 (la E3 con caída de red simulada)*

## 3. Búsqueda (HU-12)

- [x] 3.1 Filtros combinables y `INVALID_RANGE` en la API; verificar HU-12-E1..E3 en integración — *aprobadas, incluida HU-12-E4*
- [x] 3.2 Barra de filtros en la interfaz con validación previa y mensaje sin resultados; verificar con pruebas del frontend — *`lib.test.js` y E2E HU-12-E1/E3/E4*

## 4. Panel (HU-13)

- [x] 4.1 Periodos, clientes frecuentes, cancelaciones por motivo, `empty` y `503 DASHBOARD_UNAVAILABLE`; verificar HU-13-E3 con prueba unitaria y E1, E2 y E4 en integración — *aprobadas*
- [x] 4.2 Interfaz con selector de periodo, bienvenida y error con reintento sin datos obsoletos — *E2E HU-13-E1/E3/E4*

## 5. Verificación

- [x] 5.1 Ejecutar todas las pruebas y `vite build`; registrar resultados reales — *ver `docs/INFORME_AUDITORIA_FINAL.md`*
- [x] 5.2 `openspec validate catalog-agenda-insights --strict`
