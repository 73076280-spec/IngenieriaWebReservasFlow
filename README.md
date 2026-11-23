# ReservaFlow — Sistema web de reservas de citas (SaaS)

ReservaFlow es una aplicación web **multiinquilino** para que clínicas, barberías, talleres y otros negocios con atención programada gestionen su agenda. Cada organización tiene sus propios clientes, profesionales, servicios y citas, aislados del resto, y cuatro perfiles de usuario: administrador, recepción, profesional y cliente.

Proyecto académico de Ingeniería Web: implementa las **15 historias de usuario y los 60 escenarios Gherkin** del [Excel de historias](referencias/Historias_Usuario_Reservas_Citas.xlsx).

**Funciones principales:**
- Clientes, profesionales con turnos semanales y servicios con duración y costo.
- Consulta de horarios disponibles por profesional y fecha.
- Reserva, reprogramación y cancelación con motivo, sin reservas duplicadas.
- Estados de la cita y agenda diaria, semanal y mensual.
- Búsqueda con filtros y panel de indicadores.
- Portal del cliente y confirmación de cada reserva por correo en modo de prueba.

| Para… | Ver |
|---|---|
| Preparar la sustentación (arranque, demostración de 8 min y preguntas) | [docs/SUSTENTACION.md](docs/SUSTENTACION.md) |
| Estado actual y resultados de las pruebas | [docs/ESTADO.md](docs/ESTADO.md) |
| Las 15 historias y los 60 escenarios, con su evidencia | [docs/MATRIZ_TRAZABILIDAD.md](docs/MATRIZ_TRAZABILIDAD.md) |
| Informe de auditoría y defectos corregidos | [docs/INFORME_AUDITORIA_FINAL.md](docs/INFORME_AUDITORIA_FINAL.md) |

## Arquitectura

```
Navegador · React + Vite (PWA)                         frontend/
        │  JSON por HTTP, con token JWT
        ▼
API REST · Node.js + Express                           backend/src/
  routes/        cada URL declara el permiso que exige
  middlewares/   autenticación (JWT) y control de roles
  services/      reglas de negocio: disponibilidad, estados de la cita, permisos, panel
  repositories/  acceso a datos, siempre filtrado por organización (tenantId)
  models.js      esquemas de Mongoose
        │
        ▼
MongoDB Atlas · una base compartida, separada por tenantId
```

- **Multiinquilino:** cada documento lleva `tenantId`, que se toma del token verificado y nunca de lo que envía el usuario.
- **Roles (RBAC):** una sola tabla de permisos en [backend/src/services/policies.js](backend/src/services/policies.js). La ruta y el servicio la comprueban.
- **Sin reservas duplicadas:** cada cita ocupa bloques de 15 minutos con índice único, escritos dentro de una transacción.
- **Especificación:** OpenSpec (desarrollo guiado por especificaciones) en [openspec/](openspec/).

**Estructura del repositorio:**

| Carpeta | Contenido |
|---|---|
| `backend/` | API REST, scripts de operación y pruebas (unitarias, de componentes e integración) |
| `frontend/` | Interfaz React, pruebas unitarias y prueba E2E con Microsoft Edge |
| `openspec/` | Especificaciones vigentes y cambios archivados |
| `docs/` | Sustentación, informe, matriz de trazabilidad, guías y capturas de la E2E |
| `referencias/` | Excel con las historias de usuario y los criterios Gherkin |
| `.claude/`, `.opencode/` | Comandos `/opsx-*` de OpenSpec para asistentes de código |

## Requisitos

- **Node.js 22 LTS** o una versión compatible más reciente (incluye npm).
- **MongoDB Atlas** (recomendado; el plan gratuito basta). MongoDB local también sirve, pero debe ejecutarse como *replica set*, porque las reservas usan transacciones.
- Git y un navegador moderno. MongoDB Compass es opcional.

## Instalación

```powershell
git clone https://github.com/73076280-spec/IngenieriaWebReservasFlow.git
cd IngenieriaWebReservasFlow

cd backend
npm install
cd ../frontend
npm install
```

## Configuración

### 1. MongoDB Atlas
1. Crea un proyecto y un clúster en https://cloud.mongodb.com/.
2. En *Database Access*, crea un usuario con acceso solo a la base del proyecto.
3. En *Network Access*, autoriza la IP de tu equipo. No uses `0.0.0.0/0`.
4. En *Connect › Drivers*, copia la cadena de conexión. Si la contraseña tiene caracteres especiales, codifícalos (por ejemplo, `@` → `%40`).

### 2. Backend (`backend/.env`)
```powershell
cd backend
Copy-Item .env.example .env      # en macOS o Linux: cp .env.example .env
```
Edita `backend/.env`:

| Variable | Valor |
|---|---|
| `MONGO_URI` | La cadena de Atlas, con el nombre de la base antes de `?`, por ejemplo `.../reservas_saas?retryWrites=true&w=majority` |
| `JWT_SECRET` | Texto aleatorio de 32 caracteres o más. Para generarlo: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_ORIGIN` | Orígenes autorizados de la interfaz. La plantilla ya admite `http://localhost:5173` y `http://127.0.0.1:5173` |

`.env` está excluido de Git y no debe compartirse.

### 3. Frontend (opcional)
Por defecto, la interfaz llama a `http://localhost:4000/api`. Para usar otra URL, copia `frontend/.env.example` a `frontend/.env` y cambia `VITE_API_URL`.

## Ejecución

Abre dos terminales en la raíz del repositorio:

```powershell
# Terminal 1 · API
cd backend
npm run dev          # http://localhost:4000  (comprobar: http://localhost:4000/api/health)

# Terminal 2 · Interfaz
cd frontend
npm run dev          # http://127.0.0.1:5173
```

### Primer recorrido
1. **Crear organización y administrador.** El sistema muestra el **código de organización** (por ejemplo, `clinica-central`) que usará el equipo para iniciar sesión.
2. **Servicios:** duración (múltiplo de 15 minutos) y costo.
3. **Profesionales:** especialidad, servicios que atienden y horario semanal (editor por día).
4. **Clientes:** teléfono, correo y notas de atención.
5. **Usuarios:** cuentas de recepción, profesionales (vinculadas a su perfil) y clientes (vinculadas a su ficha).
6. **Citas:** reservar sobre horarios realmente disponibles, confirmar, completar, cancelar con motivo o reprogramar. Los clientes gestionan sus propias citas desde su portal.

El recorrido guiado para la sustentación está en [docs/SUSTENTACION.md](docs/SUSTENTACION.md) y el detallado por escenario, en [docs/GUIA_DEMOSTRACION.md](docs/GUIA_DEMOSTRACION.md).

## Pruebas

```powershell
cd backend
npm test                          # unitarias y de componentes: sin red ni base de datos
npm run test:integration:check    # valida backend/.env.test sin conectarse
npm run test:integration          # integración contra la base aislada reservas_saas_test

cd ../frontend
npm test                          # unitarias del frontend
npm run build                     # compilación de producción y PWA
```

Las pruebas de integración y la E2E usan una cuenta de Atlas exclusiva y la base `reservas_saas_test`. Se niegan a ejecutarse con cualquier otra base. Configuración: [docs/GUIA_PRUEBAS_INTEGRACION.md](docs/GUIA_PRUEBAS_INTEGRACION.md).

**E2E con Microsoft Edge** (React → Express → `reservas_saas_test`), en tres terminales:
```powershell
cd backend;  $env:E2E_TAG='e2e-abc123'; npm run e2e:server            # API de pruebas en 127.0.0.1:4100
cd frontend; $env:VITE_API_URL='http://127.0.0.1:4100/api'; npx vite --host 127.0.0.1 --port 5174
cd frontend; $env:E2E_TAG='e2e-abc123'; npm run e2e                   # capturas en docs/evidencias/e2e/
Invoke-RestMethod -Method Post http://127.0.0.1:4100/__e2e/shutdown    # borra los datos de esa ejecución
```

Últimos resultados: [docs/ESTADO.md](docs/ESTADO.md).

## API

- `GET /api/health`
- `POST /api/auth/register`, `POST /api/auth/login` (`organization` = código o ID), `POST /api/auth/logout`, `GET /api/me`
- Catálogo: `GET/POST /api/{clients|employees|services}`, `PUT/DELETE /api/{recurso}/:id`, `PATCH /api/{employees|services}/:id/status`, `GET /api/clients/:id/history`
- Disponibilidad: `GET /api/availability?serviceId&date=AAAA-MM-DD[&employeeId]`
- Citas:
  - `GET /api/appointments?q&clientId&employeeId&serviceId&status&from&to`
  - `GET /api/appointments/:id`
  - `POST /api/appointments`: sin `employeeId` asigna cualquier profesional disponible. La respuesta incluye `notification`, el estado del correo de confirmación.
  - `PATCH /api/appointments/:id/status` (`status`, `reason`, `version`)
  - `PATCH /api/appointments/:id/reschedule` (`start`, `employeeId`, `version`)
  - `POST /api/appointments/:id/notification`: reenvía una confirmación fallida (solo el personal).
- Administración: `GET /api/dashboard?period=mes|trimestre|anio`, `GET/PATCH /api/settings`, `GET/POST /api/users`, `PATCH /api/users/:id/role`, `GET /api/notifications`

Los errores responden `{ "error": "<mensaje>", "code": "<CÓDIGO>"[, "details": … ] }`. Los mensajes de validación y de reglas de negocio son los textos oficiales del Excel de historias de usuario.

## Permisos por rol

| Permiso | Admin | Recepción | Profesional | Cliente |
|---|---|---|---|---|
| Clientes: ver, crear, editar y eliminar | ✔ | ✔ | — | — |
| Profesionales y servicios: ver | ✔ | ✔ | ✔ | ✔ (al reservar) |
| Profesionales y servicios: gestionar y desactivar | ✔ | — | — | — |
| Disponibilidad | ✔ | ✔ | ✔ | ✔ |
| Citas: ver | ✔ | ✔ | solo las suyas | solo las suyas |
| Citas: crear y reprogramar | ✔ | ✔ | — | solo las suyas (plazo mínimo) |
| Citas: cambiar estado | ✔ | ✔ | confirmar, completar, no asistió (las suyas) | cancelar (las suyas) |
| Panel, configuración, cuentas y avisos | ✔ | — | — | — |

## Correo de confirmación

Cada reserva genera una confirmación para el cliente (HU-04-E1) en **modo de prueba**: el mensaje se guarda como `.html` en `backend/.mail-outbox/` (excluido de Git) y **no se envía por Internet**. La interfaz lo indica como "Correo de prueba generado". Detalles: [docs/CORREO_CONFIRMACION.md](docs/CORREO_CONFIRMACION.md).

## Operación

- Suspender o reactivar una organización: `cd backend; npm run tenant:status -- <id-o-codigo> suspendida|activa`.
- Datos de demostración, incluidas citas pasadas: `cd backend; npm run demo:seed -- --confirm`. Crea una organización nueva en la base de `MONGO_URI` y no modifica datos existentes. Ver la [guía de demostración](docs/GUIA_DEMOSTRACION.md).
- Plazo mínimo para que un cliente reprograme: **Configuración** (administrador). Por defecto, 2 horas.

## Seguridad y limitaciones conocidas

- El `tenantId` sale siempre del JWT verificado contra la base. Todo acceso a datos pasa por repositorios acotados por organización.
- Contraseñas con bcrypt. Límite de intentos en el inicio de sesión. El cierre de sesión revoca el token en el servidor.
- Los secretos solo se leen de variables de entorno. En el repositorio solo hay plantillas (`.env.example`, `.env.test.example`).
- La PWA solo precachea la estructura estática, **nunca** respuestas de la API.
- Limitaciones:
  - La sesión se guarda en `sessionStorage`. Para producción conviene evaluar cookies HttpOnly con protección CSRF.
  - Las confirmaciones por correo se generan en modo de prueba; el envío real no está incluido.
  - No hay autorregistro de clientes ni turnos que crucen la medianoche.
  - La interfaz muestra las horas según el navegador (la organización usa America/Lima).
  - No hay despliegue público.

## Especificación (OpenSpec)

OpenSpec 1.16.1 (`npx @fission-ai/openspec@1.16.1 <comando>`):
- Especificaciones vigentes en [openspec/specs/](openspec/specs/): `user-auth`, `tenant-isolation`, `access-control`, `availability`, `appointment-booking`, `appointment-lifecycle`, `catalog-management`, `agenda-calendar`, `appointment-search` y `dashboard-insights`.
- Cambios archivados en [openspec/changes/archive/](openspec/changes/archive/): `security-foundation`, `booking-flows` y `catalog-agenda-insights`.
- Cambio en curso: `booking-confirmation-email` (correo de confirmación). Se archivará cuando se ejecuten su integración y su E2E.
