# Tasks

## 1. Dependencias

- [x] 1.1 Actualizar `zod` a `^4.6.7` en backend y verificar que `npm audit` no reporta vulnerabilidades altas
- [x] 1.2 Añadir `vitest` y `supertest` como dependencias de desarrollo con scripts `test` y `test:integration`, y verificar que `npm test` arranca

## 2. Capas base del backend

- [x] 2.1 Crear `config/env.js`, `errors/AppError.js` y `errors/messages.js` con los mensajes oficiales; verificar con `node --check`
- [x] 2.2 Crear `app.js` con `createApp(deps)` sin conexión a base y dejar `server.js` solo como arranque; verificar que la app se construye en una prueba sin MongoDB
- [x] 2.3 Crear `repositories/tenantScopedRepository.js` que fuerza `tenantId` en filtros y altas; verificar con pruebas unitarias que se ignora un `tenantId` externo

## 3. Autenticación y sesiones (HU-15)

- [x] 3.1 Modelos: `Tenant.status` y `slug`, `User.role` sin valor por defecto, `RevokedToken` con TTL, `Notification`; verificar con `node --check`
- [x] 3.2 `services/authService.js` (registro, login, verificación, logout) con dependencias inyectadas; verificar HU-15-E1, E2, E3 y E4 con pruebas de componentes
- [x] 3.3 Middleware `authenticate` con códigos `SESSION_REQUIRED`, `TOKEN_EXPIRED`, `SESSION_INVALID`, `SESSION_REVOKED` y ruta `POST /api/auth/logout`; verificar con Supertest

## 4. Aislamiento multiinquilino (HU-14)

- [x] 4.1 Bloquear organizaciones suspendidas en login y en cada petición; verificar HU-14-E4 con pruebas de componentes
- [x] 4.2 Migrar catálogos y citas a repositorios acotados y añadir `GET /api/appointments/:id`; verificar HU-14-E1, E2 y E3 con pruebas de integración en `reservas_saas_test` — *integración ejecutada el 2026-11-23: 14/14 aprobadas*
- [x] 4.3 Script `scripts/tenant-status.js` para activar o suspender una organización; verificar con `node --check`

## 5. Control de acceso (HU-11)

- [x] 5.1 `services/policies.js` y middleware `authorize`; sustituir todos los `roles(...)`; verificar HU-11-E1 y HU-11-E3 con pruebas de componentes
- [x] 5.2 Cuentas sin rol: rechazo de login y aviso a administradores (`GET /api/notifications`); verificar HU-11-E4
- [x] 5.3 `GET/POST /api/users` y `PATCH /api/users/:id/role`; verificar HU-11-E2 (cambio efectivo en la siguiente petición) y que un admin no puede quitarse su rol — *integración ejecutada el 2026-11-23: aprobada*

## 6. Frontend

- [x] 6.1 `src/api/client.js` con tratamiento centralizado de 401/403 de sesión; verificar con `vite build`
- [x] 6.2 Login por código de organización, logout en servidor, menú y carga de datos según los permisos de `GET /api/me`, página de usuarios; verificar con `vite build`

## 7. Verificación e informe

- [x] 7.1 Ejecutar `npm test`, `npm audit` y `vite build`, y registrar los resultados reales en `docs/EVIDENCIAS_SECURITY_FOUNDATION.md`
- [x] 7.2 Actualizar `docs/MATRIZ_TRAZABILIDAD.md`, `docs/ESTADO.md` y `README.md` sin marcar como aprobados los escenarios no ejecutados
- [x] 7.3 Ejecutar `openspec validate security-foundation --strict` y verificar que pasa

## 8. Salvaguardas de integración

- [x] 8.1 Leer `MONGO_URI_TEST` solo de `backend/.env.test` y validar base, credenciales y `authSource` antes de conectar; verificar con `tests/unit/integrationGuards.test.js`
- [x] 8.2 Conectar con `dbName` forzado y `autoIndex`/`autoCreate` desactivados; comprobar privilegios mínimos con `connectionStatus` antes de escribir; verificar con pruebas unitarias
- [x] 8.3 Hacer que `npm run test:integration` falle sin configuración y añadir `npm run test:integration:check`; verificar que falla sin `.env.test` y sin conectar
- [x] 8.4 Documentar el usuario de Atlas de mínimo privilegio en `docs/GUIA_PRUEBAS_INTEGRACION.md`

## Workflow follow-up

- Ejecutar `npm run test:integration` cuando exista la cuenta exclusiva de `reservas_saas_test` y el usuario lo autorice; registrar resultados y marcar 4.2 y 5.3.
- Prueba manual en navegador de HU-15-E4 / HU-04-E4 (cierre automático de sesión en la interfaz) con la API conectada.
- Archivar el cambio (`openspec archive security-foundation`) después de la revisión y de las pruebas de integración.
