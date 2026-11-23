# Evidencias · Incremento `security-foundation`

Cambio OpenSpec: [`openspec/changes/security-foundation/`](../openspec/changes/security-foundation/) (propuesta, specs `user-auth`, `tenant-isolation`, `access-control`, diseño y tareas).
Fecha de ejecución: 2026-11-22. Entorno: Windows 11, Node.js v26.7.0, npm 11.19.0.

## Cierre (2026-11-23)

Los pendientes de este incremento se ejecutaron:
- **Integración:** `npm run test:integration` en `reservas_saas_test` con el usuario de mínimo privilegio `reservaflow_test` → **14/14 aprobadas** en la primera ejecución con las credenciales corregidas. Hoy la suite completa suma 56/56.
- **Pruebas "manuales" de la interfaz:** cubiertas por la E2E con Edge, que tiene capturas reales en [evidencias/e2e](evidencias/e2e/):
  - HU-15-E1: redirección por rol.
  - HU-15-E2: vuelta al login.
  - HU-15-E3: captura 08.
  - HU-15-E4 y HU-04-E4: captura 12.
  - HU-11-E1: menú de recepción sin Indicadores.

El cambio OpenSpec está archivado como `2026-11-23-security-foundation`. Estado por escenario: [MATRIZ_TRAZABILIDAD.md](MATRIZ_TRAZABILIDAD.md). Las secciones siguientes se conservan como registro histórico.

## Niveles de evidencia

| Nivel | Qué significa |
|---|---|
| **Verificado (componentes)** | Prueba automatizada ejecutada y aprobada sobre la API real (rutas, middlewares, política RBAC, servicio de autenticación y manejo de errores) con almacenamiento en memoria, sin red ni base de datos. |
| **Verificado (unitario)** | Prueba automatizada ejecutada y aprobada sobre un módulo aislado (repositorio, política, servicio). |
| **Pendiente (integración)** | Prueba escrita en `backend/tests/integration/` que requiere la base aislada `reservas_saas_test`. **No ejecutada**: falta la cuenta exclusiva de pruebas y la autorización expresa. |
| **Pendiente (manual)** | Comportamiento de la interfaz que requiere navegador con la API conectada. **No ejecutado**. |

Ningún escenario se considera aceptado hasta completar sus niveles pendientes.

## Resultados ejecutados

| Verificación | Comando | Resultado real |
|---|---|---|
| Pruebas unitarias y de componentes | `cd backend && npm test` | **4 archivos, 47 pruebas, 47 aprobadas, 0 fallidas** (con las salvaguardas añadidas después: 5 archivos, 66/66) |
| Pruebas de integración | `cd backend && npm run test:integration` | **Ejecutado el 2026-11-22, falla en la autenticación**: `MongoServerError: bad auth` (Atlas, code 8000); 14 pruebas omitidas, 0 aprobadas, nada escrito. Ver "Primer intento de integración" |
| Auditoría backend | `cd backend && npm audit` | **0 vulnerabilidades** (antes: 1 alta, Zod 3.25.76, GHSA-mrhx-c7xc-m3w5) |
| Auditoría frontend | `cd frontend && npm audit` | 3 **moderadas** en `minimatch` (herramientas de compilación, `npm audit fix` disponible); 0 altas. Fuera del alcance de este incremento |
| Compilación frontend + PWA | `npx vite build` (a carpeta temporal, sin tocar `dist/`) | Correcta; service worker generado (7 entradas en precaché). Aviso no bloqueante: bundle de 617 kB |
| Sintaxis backend | `node --check` en `src/` y `scripts/` | Correcta |
| Especificación | `openspec validate security-foundation --strict` | `Change 'security-foundation' is valid` |

### Prueba de mutación (calidad de las pruebas)

Para confirmar que las pruebas detectan regresiones, se reintrodujo cada defecto, se ejecutó la suite y se restauró el código:

| Defecto reintroducido | Resultado de la suite |
|---|---|
| Rol `admin` por defecto en el usuario (HU-11-E4) | 1 fallida / 46 aprobadas |
| `logout` no revoca el token (HU-15-E2) | 2 fallidas / 45 aprobadas |
| Token previo ignora la suspensión (HU-14-E4) | 1 fallida / 46 aprobadas |
| Un filtro externo sobrescribe el `tenantId` (HU-14-E1) | 1 fallida / 46 aprobadas |
| Panel abierto a recepción y cliente (HU-11-E1/E3) | 5 fallidas / 42 aprobadas |

Tras restaurar: 47/47 aprobadas.

## Estado por escenario oficial

| Escenario | Evidencia ejecutada | Pendiente |
|---|---|---|
| HU-15-E1 Inicio de sesión exitoso | Verificado (componentes): login con los 4 roles, JWT HS256 con `sub`, `tid`, `jti` y 8 h de vida; `/api/me` devuelve el rol | Manual: redirección a la sección inicial de cada rol |
| HU-15-E2 Cierre de sesión manual | Verificado (componentes y unitario): `POST /api/auth/logout` → 204; el mismo token → 401 `SESSION_REVOKED`; otras sesiones siguen válidas | Integración (revocación persistida en MongoDB); manual (vuelta al login) |
| HU-15-E3 Credenciales incorrectas | Verificado (componentes): contraseña errónea, correo inexistente y organización inexistente → idéntico 401 "Las credenciales ingresadas no son válidas" | Integración |
| HU-15-E4 Token expirado | Verificado (componentes): 401 `TOKEN_EXPIRED` y el servicio de citas no se invoca | Manual: cierre automático de sesión en la interfaz |
| HU-04-E4 Sesión expirada al reservar | Verificado (componentes) en la parte de API (sin alta de cita) | Manual: la interfaz pide iniciar sesión de nuevo |
| HU-14-E1 Consulta dentro del propio inquilino | Verificado (unitario): el repositorio fija el `tenantId` de la sesión y no puede sobrescribirse | Integración: dos organizaciones reales |
| HU-14-E2 Registro en el inquilino correcto | Verificado (unitario): alta con el `tenantId` de la sesión; cuerpo con `tenantId` → rechazado sin crear nada | Integración |
| HU-14-E3 Acceso a datos de otra organización | Verificado (unitario): lectura, edición y borrado por ID filtran por organización | Integración: `GET /api/appointments/:id` ajeno → 404, edición/borrado ajeno → 404 |
| HU-14-E4 Organización desactivada | Verificado (componentes): login → 403 `TENANT_SUSPENDED` con mensaje de organización inactiva; token previo → 403 y la operación no se ejecuta; otras organizaciones no se ven afectadas | Integración |
| HU-11-E1 Asignación de rol | Verificado (componentes): recepción gestiona clientes y citas; 403 en panel, profesionales, servicios, cuentas y borrado | Integración: alta real de la cuenta mediante `POST /api/users` |
| HU-11-E2 Cambio de rol | Verificado (componentes): la siguiente petición de la sesión activa ya aplica el nuevo rol | Integración: `PATCH /api/users/:id/role` |
| HU-11-E3 Acceso no autorizado | Verificado (componentes): cliente → 403 "No tiene permisos para acceder a esta sección", sin datos | Manual: aviso en la interfaz |
| HU-11-E4 Usuario sin rol | Verificado (componentes y unitario): el modelo no asigna rol; login → 403 `ACCOUNT_PENDING`; un único aviso para la organización | Integración: aviso visible en `GET /api/notifications` |

## Cómo ejecutar las pruebas de integración (cuando se autorice)

Ver [GUIA_PRUEBAS_INTEGRACION.md](GUIA_PRUEBAS_INTEGRACION.md): usuario de Atlas con `readWrite` solo sobre `reservas_saas_test`, `backend/.env.test`, `npm run test:integration:check` (sin conexión) y `npm run test:integration`.

### Endurecimiento de las salvaguardas (2026-11-22)

La revisión previa a la conexión detectó y corrigió cuatro debilidades en `tests/integration/setup.js`:

1. Mongoose creaba colecciones e índices automáticamente al conectar, **antes** de comprobar la base. Ahora se conecta con `dbName` forzado y `autoIndex`/`autoCreate` desactivados.
2. No se verificaban los permisos del usuario. Ahora `connectionStatus` debe mostrar solo roles sobre `reservas_saas_test`.
3. `.env.test` se buscaba en la carpeta actual y una variable del sistema tenía prioridad. Ahora se lee solo del archivo.
4. Sin configuración, la suite se omitía con código 0. Ahora falla.

Resultado: `npm test` → **5 archivos, 66 pruebas, 66 aprobadas** (19 nuevas de las salvaguardas). `npm run test:integration:check` sin `.env.test` → falla con "Falta MONGO_URI_TEST…", sin conectar.

### Primer intento de integración (2026-11-22, autorizado)

| Paso | Resultado real |
|---|---|
| `npm run test:integration:check` | Correcto: base `reservas_saas_test`, host `rese****.zciwsyq.mongodb.net`, usuario `prueba de flujo de reserva`, clave oculta |
| `npm run test:integration` | **Falla** en el `beforeAll`: `MongoServerError: bad auth : Authentication failed.` 1 archivo fallido, 14 pruebas omitidas |
| Sonda de solo lectura (`connectionStatus`, sin escrituras) | Falla igual (Atlas `code=8000`) con la URI tal cual, con `authSource=admin` explícito y con el usuario `reservaflow_test` |

Diagnóstico, sin imprimir secretos:

- **Red y lista de IPs: correctas.** El error lo devuelve Atlas, así que la conexión llega al clúster.
- **`authSource`: no es la causa.** Con `mongodb+srv`, el driver toma `authSource=admin` del registro DNS de Atlas (`connection_string.js`, `userSpecifiedAuthSource`), y forzarlo no cambia el resultado.
- **Codificación de la contraseña: correcta.** Tiene 13 caracteres, ningún carácter reservado sin codificar, ningún `%` y ningún marcador `<…>`.
- **Causa probable: el usuario o la contraseña no coinciden con ningún usuario de Atlas.** El nombre `prueba de flujo de reserva` (con espacios) parece la descripción y no el *username* que figura en **Database Access**.

Como la autenticación falla antes de cualquier operación, **no se escribió nada** en ninguna base. HU-14 y HU-11 siguen pendientes de integración.

## Cambios de comportamiento a tener en cuenta

- **Recepción** ya no crea ni edita profesionales ni servicios, ni ve el panel de indicadores (HU-02, HU-03, HU-11-E1).
- **Los tokens emitidos antes del cambio** (sin `jti`) dejan de ser válidos: hay que volver a iniciar sesión una vez.
- **Inicio de sesión**: se usa el código de organización (p. ej. `clinica-central`); las organizaciones existentes siguen entrando con su ID.
- **Suspender/reactivar una organización** (operador): `cd backend && npm run tenant:status -- <id-o-codigo> suspendida|activa`.
- La validación horaria normaliza la hora `24` que algunos motores de `Intl` devuelven para medianoche.
