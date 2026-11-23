# Design

## Context

El backend es un único `server.js` que mezcla arranque, conexión a MongoDB, rutas, validación, reglas de negocio y autorización (`roles(...)` repartido por las rutas). No hay pruebas. El arranque conecta a la base al importar el módulo, por lo que la API no puede probarse sin una base real. La consigna exige arquitectura por capas, SOLID, autorización centralizada en servicios y aislamiento por inquilino en repositorios. Ver `proposal.md` para la motivación.

Restricciones: MongoDB Atlas es la base principal; las pruebas con base solo pueden usar `reservas_saas_test` con credenciales propias y nunca deben tocar `.env`. Disco C: con poco espacio, así que no se descargan binarios de MongoDB.

## Goals / Non-Goals

**Goals:**
- Separar `createApp(deps)` (sin efectos) del arranque (`server.js`) para poder probar la API.
- Capas: `config` → `routes` (HTTP) → `services` (reglas y autorización) → `repositories` (acceso a datos acotado por tenant) → `models`.
- Inyección de dependencias en los servicios de autenticación para probar las reglas de seguridad sin base de datos.
- Conservar el comportamiento de los flujos de clientes, profesionales, servicios y citas.

**Non-Goals:**
- Portal del cliente, consulta de disponibilidad, filtros y nuevo dashboard (incrementos posteriores).
- Cookies HttpOnly, refresh tokens o MFA.
- Consola de "superadministrador" del proveedor SaaS; la suspensión se hace con un script operativo.

## Decisions

1. **Zod 4.6.7** (`zod@^4.6.7`). La rama 3 no recibe la corrección. Se usan las APIs no obsoletas: `z.strictObject`, `z.email()`, `z.iso.datetime({offset:true})`. Alternativa descartada: Validator.js, que la consigna sugiere, porque cambiar de librería no aporta seguridad adicional y Zod ya cubre esquemas estrictos que rechazan `tenantId` (HU-14-E2).
2. **Política de permisos declarativa** (`services/policies.js`): mapa `permiso → roles`. El middleware `authorize(permiso)` la aplica en la ruta y los servicios la reutilizan para reglas de propiedad (profesional y sus citas). Alternativa descartada: listas de roles en cada ruta (situación actual), que dispersa la política.
3. **Repositorio con alcance de tenant** (`repositories/tenantScopedRepository.js`): `forTenant(tenantId)` devuelve operaciones que siempre añaden `tenantId` al filtro y lo fijan al crear, ignorando cualquier `tenantId` del cuerpo. Los servicios no pueden consultar sin tenant.
4. **Revocación por `jti`** en la colección `revokedtokens` con índice TTL sobre `expiresAt`. Revoca solo la sesión cerrada (HU-15-E2 habla del "token actual"); el documento se borra solo al expirar el token. Alternativa descartada: `tokenVersion` por usuario, que cierra todas las sesiones del usuario.
5. **Códigos de error estables** en `errors/`: `AppError(status, code, message)`; mensajes oficiales del Excel en un único módulo `messages.js`. El manejador de errores devuelve `{error, code}`.
6. **Login por organización** con `organization` = código legible (`slug`, generado en el registro y único) o el ObjectId heredado. Comparación de contraseña contra un hash ficticio cuando el usuario no existe para igualar tiempos (HU-15-E3).
7. **Estado de organización** `Tenant.status ∈ {activa, suspendida}` (por defecto `activa`, así las organizaciones existentes siguen activas sin migración). Se comprueba en login y en cada petición autenticada (la petición ya lee el usuario; se añade una lectura de tenant por `_id`). Suspensión mediante `scripts/tenant-status.js`, que el operador ejecuta contra su propia base.
8. **Cuentas sin rol**: `role` admite `null` y no tiene valor por defecto. El login de una cuenta sin rol crea (una sola vez, upsert) una `Notification` de tipo `cuenta_pendiente` para la organización y responde 403 `ACCOUNT_PENDING`.
9. **Pruebas en dos niveles** con Vitest + Supertest:
   - *Componentes* (se ejecutan siempre): `createApp` con un `authService` construido sobre repositorios en memoria. Cubren tokens, revocación, suspensión, cuentas sin rol, credenciales y RBAC sin red ni base.
   - *Integración* (`tests/integration`): solo si existe `MONGO_URI_TEST`; se niegan a ejecutarse si el nombre de la base no es `reservas_saas_test`; cada prueba crea sus propias organizaciones y borra únicamente los documentos de esas organizaciones. Cubren aislamiento real por tenant y regresión de los flujos CRUD y de citas.
10. **Frontend**: `src/api/client.js` concentra `fetch`, cabecera `Authorization` y el tratamiento de 401/403 de sesión, invocando un único `onSessionEnd(mensaje)`. `GET /api/me` devuelve los permisos efectivos del rol y la interfaz construye con ellos el menú y la carga de datos, sin duplicar la política (la API sigue siendo la autoridad). Alternativa descartada: copiar el mapa de permisos al frontend, que podría desincronizarse.

## Risks / Trade-offs

- [Recepcionistas pierden escritura de profesionales/servicios y el panel] → Alineado con HU-02, HU-03 y HU-11-E1; documentado como BREAKING.
- [Lectura extra de tenant y de revocación por petición] → Consultas por `_id`/índice único; aceptable para el volumen del proyecto.
- [Índice único `slug` sobre organizaciones existentes sin código] → índice `sparse`, no falla con documentos sin `slug`.
- [Las pruebas de integración no se ejecutan hasta tener la cuenta de pruebas] → Se informan como pendientes; ningún escenario dependiente se marca aprobado.
- [Token en `sessionStorage` sigue expuesto a XSS] → Fuera de alcance; la revocación reduce el impacto. Pendiente evaluar cookies HttpOnly.

## Migration Plan

1. `npm install` en backend y frontend.
2. Al arrancar, Mongoose crea los índices nuevos (`tenants.slug` sparse único, TTL de `revokedtokens`, `notifications`); no se modifica ni borra ningún documento existente.
3. Las organizaciones previas siguen entrando con su ID; las nuevas reciben además un código legible.
4. Rollback: restaurar el código anterior; los campos e índices nuevos son ignorados por la versión anterior salvo el rol obligatorio, que no afecta a documentos ya guardados.
