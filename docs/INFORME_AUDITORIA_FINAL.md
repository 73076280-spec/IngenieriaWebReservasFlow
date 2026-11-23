# Informe de auditoría final · ReservaFlow SaaS

Fecha: 2026-11-23. Entorno: Windows 11, Node.js 26.7.0, MongoDB Atlas (clúster `ReservaFlowCluster`), Microsoft Edge para E2E.
Fuentes de verdad: [Excel oficial](../referencias/Historias_Usuario_Reservas_Citas.xlsx), consigna y rúbrica del curso, todos sin modificar (hash del Excel sin cambios). La consigna y la rúbrica son material del docente y no se incluyen en el repositorio público.

Todos los resultados de este informe corresponden a ejecuciones reales. Nada se marcó como aprobado sin ejecutarse.

## 0. Fase final 1 · Cierre funcional (2026-11-23, tarde)

**HU-04-E1, confirmación por correo:**
- **Implementación:** correo de confirmación al registrar la cita, con código, organización, servicio, profesional, fecha, horario, duración y precio; plantilla HTML y texto plano con datos escapados.
- **Garantías:** estado registrado en la cita, una única confirmación (reserva atómica), reenvío manual solo si falló y reserva conservada si el correo falla.
- **Simplificación posterior (2026-11-23):**
  - Se retiraron el cliente SMTP y el generador MIME propios: 260 líneas, con sus pruebas, su servidor SMTP falso y sus certificados.
  - El correo se genera en **modo de prueba** (`.html` en `backend/.mail-outbox/`) y no se envía por Internet. La consigna no exige correo electrónico.
  - `backend/src` pasa de 2012 a 1772 líneas.
  - Guía: [CORREO_CONFIRMACION.md](CORREO_CONFIRMACION.md). Antes de simplificar se hizo un respaldo local sin secretos, fuera del repositorio.

| Comando | Resultado real |
|---|---|
| `cd backend; npm test` (tras la simplificación) | **8 archivos, 115 aprobadas, 0 fallidas**: las 104 originales + 11 del correo. Las 12 retiradas probaban solo el SMTP y el MIME eliminados |
| `cd backend; npm test` (antes de simplificar) | 127 aprobadas; mutación del correo 6/6 |
| `cd frontend; npm test` | **2 archivos, 23 aprobadas** (20 previas + 3 del estado del correo) |
| `cd frontend; npm run build` | Correcto; `dist/` regenerado (10 archivos, 680 KiB, service worker con 9 recursos) |
| `openspec validate booking-confirmation-email --strict` y `validate --specs --strict` | Válido; 10/10 especificaciones |
| `npm run test:integration:check` | Configuración válida (`reservas_saas_test`, usuario `reservaflow_test`) |
| `cd backend; npm run test:integration` | **No ejecutable:** 4 archivos fallan al conectar (`MongoServerSelectionError`) y 61 pruebas quedan sin ejecutar. El DNS de Atlas resuelve, pero el TCP 27017 a los 3 nodos falla: la IP actual no está autorizada en *Network Access* |
| E2E en Edge | **No ejecutable** por la misma causa: el servidor E2E usa `reservas_saas_test` |
| `npm audit` (backend y frontend) | **No ejecutable:** el registro de npm responde `ECONNRESET`. Los `package.json` y `package-lock.json` no cambiaron desde la última auditoría (0 vulnerabilidades, 06:31) |

**Defectos de esta fase:**
- D-17 · Media: HU-04-E1 sin envío de confirmación al cliente. → Implementado.
- D-18 · Media, en el cliente SMTP nuevo, detectado por su prueba: cerraba la conexión sin esperar la respuesta a `QUIT`. → Corregido, y después retirado junto con el cliente SMTP en la simplificación.
- D-19 · Baja: dos contrastes de texto insuficientes (campos deshabilitados, etiqueta "Inactivo"). → Corregido.
- D-20 · Media, detectado al preparar la publicación: CORS solo admitía `http://localhost:5173`, pero `npm run dev` sirve la interfaz en `http://127.0.0.1:5173`, y desde esa dirección el navegador bloqueaba las llamadas a la API. Comprobado con el paquete `cors` del proyecto. → El valor por defecto y `.env.example` admiten ambos orígenes. Un `.env` ya creado debe añadir `,http://127.0.0.1:5173` a `CLIENT_ORIGIN`.

**Base principal:** no se accedió a `reservas_saas` en ningún momento; tampoco hubo conexión posible a Atlas en esta fase. No se ejecutó ningún *seed*. `.env` sin cambios (22/11, 13:52:04).

## 1. Resultado

| HU | Estado final | Escenarios verificados | Evidencia principal | Pendiente |
|---|---|---|---|---|
| HU-01 Clientes | Completa y verificada | 4/4 | I + E (capturas 05, 06) | — |
| HU-02 Profesionales | Completa y verificada | 4/4 | I + E (03, 04) | — |
| HU-03 Servicios | Completa y verificada | 4/4 | I + E (02) | — |
| HU-04 Registro de citas | Implementada; correo verificado solo en pruebas unitarias | 4/4 (E1: correo pendiente de integración y E2E) | I + E (reserva, 09–12) + U (correo) | Integración y E2E del correo (acceso a Atlas); envío real (credenciales SMTP) |
| HU-05 Reprogramación | Completa y verificada | 4/4 | I | — |
| HU-06 Cancelación | Completa y verificada | 4/4 | I + E (20) | — |
| HU-07 Disponibilidad | Completa y verificada | 4/4 | U + I + E (09) | — |
| HU-08 Agenda | Completa y verificada | 4/4 | E (16–19) | — |
| HU-09 Sin duplicados | Completa y verificada | 4/4 | U + I (carrera real) | — |
| HU-10 Estados | Completa y verificada | 4/4 | U + I + E | — |
| HU-11 RBAC | Completa y verificada | 4/4 | C + I + E | — |
| HU-12 Búsqueda | Completa y verificada | 4/4 | I + E (13–15) | — |
| HU-13 Panel | Completa y verificada | 4/4 | U + I + E (01, 22, 23) | — |
| HU-14 Multiinquilino | Completa y verificada | 4/4 | U + C + I | — |
| HU-15 Autenticación | Completa y verificada | 4/4 | C + I + E (08, 12) | — |

**Escenarios:** 60/60 con evidencia automatizada ejecutada (100 %). 59/60 verificados por completo (98,3 %). En HU-04-E1 la reserva está verificada en integración y E2E; la confirmación por correo, solo en pruebas unitarias y contra un servidor SMTP local, a la espera de integración y E2E. 29/60 verificados además de extremo a extremo en la interfaz (48,3 %). Detalle escenario por escenario: [MATRIZ_TRAZABILIDAD.md](MATRIZ_TRAZABILIDAD.md).

U = unitaria, C = componentes, I = integración en Atlas (`reservas_saas_test`), F = frontend, E = E2E en Edge (capturas en [evidencias/e2e](evidencias/e2e/)).

## 2. Ejecución de pruebas (resultados reales)

| Suite | Comando | Resultado |
|---|---|---|
| Backend · unitarias y componentes | `cd backend; npm test` | **7 archivos, 104 aprobadas, 0 fallidas, 0 omitidas** |
| Backend · integración (Atlas, `reservas_saas_test`) | `cd backend; npm run test:integration` | **3 archivos, 56 aprobadas, 0 fallidas, 0 omitidas** (seguridad 14, funcionales 40, demostración 2) |
| Frontend · unitarias | `cd frontend; npm test` | **2 archivos, 20 aprobadas, 0 fallidas** |
| E2E · Edge (React → Express → Atlas) | `cd frontend; npm run e2e` | **24 pasos aprobados, 0 fallidos**, dos ejecuciones consecutivas tras la última corrección |
| Compilación + PWA | `npx vite build` | Correcta; service worker con 9 recursos en precaché (661 KiB); sin avisos de tamaño |
| Sintaxis backend | `node --check` en `src/` y `scripts/` | Correcta |
| OpenSpec | `openspec validate --specs --strict` | **10/10 especificaciones válidas** |
| Auditoría de dependencias | `npm audit` | **Backend 0 · Frontend 0** vulnerabilidades |
| Prueba de mutación | 5 defectos reintroducidos | **5/5 detectados** (ver §5) |

**Total automatizado: 180 pruebas + 24 pasos E2E, todos aprobados, ninguno omitido.**
No hay *linter* (ESLint) configurado en el proyecto. El análisis estático se limita a `node --check`, la compilación de Vite y los avisos de SonarLint del editor, que no bloquean.

### Salvaguardas de la base de datos
- Las pruebas de integración y la E2E usan solo `reservas_saas_test` con el usuario `reservaflow_test`. Antes de escribir nada se verifica `readWrite` únicamente sobre esa base (`connectionStatus`).
- La limpieza borra solo las organizaciones creadas en cada ejecución. Las 9 organizaciones creadas por las ejecuciones E2E (5 + 1 + 1 + 2, según la salida de cada limpieza) se eliminaron, identificadas por la etiqueta de su ejecución.
- La base principal `reservas_saas` no se tocó: ni las pruebas ni el script de demostración se ejecutaron sobre ella.

## 3. Diagnóstico inicial (Fase A)

| HU | Estado al empezar | Motivo |
|---|---|---|
| HU-07 | **No implementada** | No existía la consulta de disponibilidad |
| HU-01, 02, 03, 04, 05, 06, 08, 09, 10, 12, 13 | Parcial | Faltaban mensajes oficiales, portal del cliente, editor de turnos, desactivación, estados, filtros, periodos… |
| HU-11, HU-15 | API verificada, interfaz sin probar | — |
| HU-14 | Completa y verificada | Integración 4/4 |

Integración inicial confirmada por ejecución propia: 14/14 de seguridad.

## 4. Registro de defectos encontrados y corregidos

| ID | Gravedad | Defecto | Corrección | Verificación |
|---|---|---|---|---|
| D-01 | Alta | HU-07 no implementada (consigna f) | `GET /api/availability`, sugerencias y fechas cercanas | U + I + E |
| D-02 | Alta | Sin portal del cliente: HU-04/05/07/09 están escritas para el rol cliente | Rol cliente vinculado a su ficha; reservar, reprogramar y cancelar lo propio | I (404 ante citas ajenas) + E |
| D-03 | Media | La política RBAC impedía a recepción eliminar clientes, contra HU-01 | Permiso `clients:delete` para recepción; prueba alineada con HU-01 | U + C + I |
| D-04 | Alta | Sin máquina de estados: mensajes genéricos, "no asistió" antes de la cita | `assertTransition` con mensajes oficiales | U + I |
| D-05 | Media | Sin detección de modificaciones simultáneas (HU-06-E4) | Versión (`__v`) y `409 APPOINTMENT_UPDATED` | I con peticiones simultáneas |
| D-06 | Media | Mensajes del Excel no se mostraban ("Datos inválidos", "Fuera del turno laboral") | Mensajes oficiales, Zod en español, error principal legible | U + I + E |
| D-07 | Media | Panel sin periodo ni clientes frecuentes; mostraba datos anteriores tras un error | Periodos, top 3 clientes, motivos, 503 amigable | U + I + E |
| D-08 | Media | La agenda convertía errores en lista vacía (HU-08-E3) | Error con "Reintentar"; aviso de día vacío | E |
| D-09 | Media | Sin editor de turnos (consigna e) ni especialidad obligatoria | Editor por día, servicios habilitados, desactivación | U + I + E |
| D-10 | Baja | Filtros solo locales y sin validación del rango | Filtros en el servidor y validación previa | F + I + E |
| D-11 | Alta | **Introducido y detectado en esta auditoría:** bucle infinito de peticiones `/api/me` tras reestructurar el frontend | Funciones de carga estables con referencias | E (sonda de red) |
| D-12 | Alta | **Detectado por la E2E:** carrera en disponibilidad; una respuesta obsoleta mostraba horarios de otra fecha y la cita se reservaba en un día distinto al elegido | Solo se acepta la última consulta (reserva, citas y panel) | E, 2 ejecuciones consecutivas |
| D-13 | Alta | Auditoría del frontend: 3 moderadas (previas) y 2 críticas al añadir Vitest 3 | Vitest 5.1, `vite-plugin-pwa` 2.0, `glob` 14 mediante `overrides` | `npm audit` → 0 |
| D-14 | Baja | El aviso de "sesión expirada" podía perderse al cambiar a la pantalla de acceso | Un único contenedor de notificaciones | E (captura 12) |
| D-15 | Baja | Icono 404, bundle mayor de 500 kB, notificaciones apiladas | Icono, bloques separados, límite de 3 avisos | Compilación + E |
| D-16 | Baja | Prueba del panel frágil a fin de mes; dato de prueba con teléfono `999` | Prueba robusta; teléfono válido (la validación de teléfonos es nueva) | I |

## 5. Calidad de las pruebas (mutación)

| Defecto reintroducido | Resultado |
|---|---|
| Permitir cancelar una cita completada (HU-06-E3) | 1 fallida / 103 |
| Ignorar bloques ocupados en la disponibilidad (HU-09-E1) | 3 fallidas / 101 |
| Permitir eliminar un cliente con citas pendientes (HU-01-E4) | 1 fallida / 103 |
| Sustituir el mensaje oficial por uno genérico (HU-01-E3) | 1 fallida / 103 |
| No tratar la falla de base del panel (HU-13-E3) | 1 fallida / 103 |

Tras restaurar el código: 104/104.

## 6. Estado por capa

- **Backend (Node + Express):** arquitectura por capas (`config`, `routes`, `middlewares`, `services`, `repositories`, `models`, `validation`) e inyección de dependencias. Permisos validados en la ruta y otra vez en cada servicio, aislamiento por `tenantId` en el repositorio y política RBAC central. 33 endpoints. Ver [README](../README.md#api).
- **MongoDB Atlas:** transacciones e índice único de bloques de 15 minutos. Integración real 56/56 en la base aislada, con verificación de privilegios mínimos. Los campos nuevos son opcionales y no necesitan migración.
- **Frontend (React + Vite + PWA):** separado en páginas y componentes; menú y página inicial según permisos. Estados de carga, vacío y error en todas las vistas, diseño adaptable (captura 21 a 390 px) y mensajes oficiales. FullCalendar, SweetAlert2 y react-toastify.
- **OpenSpec / SDD:** tres cambios especificados, implementados, verificados y archivados (`security-foundation`, `booking-flows`, `catalog-agenda-insights`). 10 especificaciones vigentes en [`openspec/specs/`](../openspec/specs/).

## 7. Cumplimiento de la consigna

| Requisito | Estado | Dónde |
|---|---|---|
| a. CRUD de clientes | ✅ | HU-01 |
| b. Gestión de profesionales | ✅ | HU-02 |
| c. Servicios con duración y costo | ✅ | HU-03 |
| d. Registrar, modificar, cancelar y reprogramar citas | ✅ | HU-04, HU-05, HU-06 |
| e. Jornada laboral o turnos | ✅ | Editor de turnos (HU-02) |
| f. Disponibilidad por profesional y fecha | ✅ | HU-07 |
| g. Agenda diaria, semanal y mensual | ✅ | HU-08 (FullCalendar) |
| h. Evitar reservas duplicadas | ✅ | HU-09 (índice único y transacciones; carrera probada) |
| i. Estados de la cita | ✅ | HU-10 |
| j. RBAC con 4 perfiles | ✅ | HU-11 |
| k. Búsqueda y filtros | ✅ | HU-12 |
| l. Panel de indicadores | ✅ | HU-13 |
| m. Validación y manejo de errores | ✅ | Mensajes oficiales, códigos estables, estados de error |
| SaaS multiinquilino con aislamiento en el repositorio | ✅ | HU-14 |
| Capas, SOLID y autorización centralizada en servicios | ✅ | §6 |
| Librerías recomendadas | Parcial | FullCalendar, SweetAlert2, Toastify y JWT sí. **Day.js** instalado pero no usado (fechas con `Intl` y zona horaria de la organización). **Validator.js** sustituido por **Zod** 4 (esquemas estrictos que también bloquean `tenantId`) |

## 8. Rúbrica (historias y criterios de aceptación)

La rúbrica evalúa el documento de historias, es decir, el Excel oficial, que **no se modificó**. La evidencia observable es esta:

| Criterio (peso) | Evidencia en el Excel | Apoyo del proyecto |
|---|---|---|
| Sintaxis Gherkin (40 %) | 60 escenarios con columnas separadas *Dado que / Cuando / Entonces*. Cada historia cubre camino feliz, flujo alternativo, manejo de error y caso de borde | Los 60 escenarios tienen una prueba trazable con el mismo identificador `HU-XX-EY` |
| Coherencia y valor (35 %) | 15 historias con *Como / Quiero / Para* y beneficio de negocio | Cada historia tiene especificación OpenSpec y funcionalidad demostrable |
| Plantilla (25 %) | Hojas Carátula, Historias de Usuario y Backlog resumido | La entrega en el aula virtual, en plazo y ruta, es responsabilidad del equipo |

La nota la asigna el docente. Este informe no se pronuncia sobre ella.

## 9. Riesgos y pendientes reales antes de la entrega

1. **Correo (HU-04-E1).** Implementado en la fase final 1. Pendiente:
   - Autorizar la IP actual en Atlas para ejecutar su integración y la E2E.
   - El envío real no está incluido (la consigna no lo exige). La extensión con Nodemailer está documentada en [CORREO_CONFIRMACION.md](CORREO_CONFIRMACION.md).
2. **Despliegue público no realizado.** Requiere cuentas de hosting (por ejemplo, la API en Render o Railway y el frontend en Vercel o Netlify). También hay que configurar `MONGO_URI`, `JWT_SECRET` y `CLIENT_ORIGIN` como variables de entorno y autorizar en *Network Access* de Atlas la IP del servidor.
3. **Datos de demostración en la base principal.** `npm run demo:seed -- --confirm` está verificado solo en la base de pruebas. Ejecutarlo en `reservas_saas` necesita tu autorización: crea una organización nueva y no modifica datos existentes.
4. **Datos previos en la base principal.** Al editar profesionales sin especialidad o clientes con teléfono inválido habrá que completar esos campos. Las cuentas con rol cliente creadas antes no tienen ficha vinculada; volver a asignarles el rol cliente las vincula por correo.
5. **Usuario de pruebas de Atlas.** Elimina o deja caducar `reservaflow_test` cuando ya no lo necesites.
6. **Limitaciones conocidas:**
   - Sesión en `sessionStorage`, sin cookies HttpOnly.
   - La interfaz muestra las horas en la zona horaria del navegador; la organización usa America/Lima.
   - No hay turnos que crucen la medianoche.
   - El límite de peticiones solo se aplica a la autenticación.
   - No hay autorregistro de clientes: los da de alta el administrador.
   - El funcionamiento sin conexión de la PWA no tiene prueba E2E.
7. **Pruebas manuales recomendadas en la base principal:** recorrer la [guía de demostración](GUIA_DEMOSTRACION.md) una vez antes de exponer.
