# Proposal

## Why

La revisión del starter detectó brechas de seguridad que bloquean las historias oficiales HU-11 (RBAC), HU-14 (aislamiento multiinquilino) y HU-15 (autenticación segura): Zod 3 tiene una vulnerabilidad alta (GHSA-mrhx-c7xc-m3w5), toda cuenta sin rol se convierte en administrador, no se puede suspender una organización, cerrar sesión no invalida el token y el frontend no trata de forma uniforme las sesiones vencidas. Estas son la base del resto de incrementos, por eso van primero.

## What Changes

- Actualizar Zod a la rama 4 (corrige la vulnerabilidad alta) y adaptar los esquemas de validación.
- **BREAKING** Eliminar el rol `admin` por defecto en el modelo de usuario: una cuenta sin rol queda pendiente de configuración, no puede iniciar sesión y genera un aviso para los administradores de su organización.
- Centralizar la autorización en una política única de permisos por rol, utilizada por la API y reflejada en la interfaz.
- **BREAKING** Ajustar permisos a las historias oficiales: profesionales y servicios solo los gestiona el administrador; el panel de indicadores es exclusivo del administrador; el listado de clientes no está disponible para el rol cliente.
- Acceso a datos acotado por `tenantId` mediante repositorios con alcance de organización; nuevo detalle de cita por ID que responde 404 ante IDs de otra organización.
- Estado de organización (`activa` / `suspendida`): bloqueo en el inicio de sesión y en cada petición con token previo.
- Cierre de sesión en servidor que invalida el token actual (lista de tokens revocados con expiración automática).
- Respuestas 401/403 con código estable (`TOKEN_EXPIRED`, `SESSION_REVOKED`, `TENANT_SUSPENDED`, …) y cliente HTTP centralizado en el frontend que cierra la sesión y pide un nuevo inicio de sesión.
- Inicio de sesión con código legible de organización (además del ID heredado) y mensaje oficial para credenciales inválidas.
- Administración básica de cuentas (alta de colaboradores con rol, cambio de rol) para el administrador.
- Pruebas automatizadas de los escenarios de seguridad oficiales.

## Capabilities

### New Capabilities
- `user-auth`: inicio y cierre de sesión, emisión y validación de tokens, tratamiento de sesiones vencidas o revocadas (HU-15).
- `tenant-isolation`: asignación y filtrado obligatorio por organización, acceso cruzado y suspensión de organizaciones (HU-14).
- `access-control`: roles, permisos por rol, cuentas sin rol y administración de roles (HU-11).

### Modified Capabilities
<!-- No existen specs OpenSpec previos; `openspec/specs/initial-scope.md` es un documento de alcance heredado, no un capability. -->

## Impact

- Backend: `models.js` (rol sin valor por defecto, estado y código de organización, tokens revocados, notificaciones), separación de `server.js` en configuración, middlewares, políticas, servicios, repositorios y rutas; nuevos endpoints `POST /api/auth/logout`, `GET /api/appointments/:id`, `GET/POST /api/users`, `PATCH /api/users/:id/role`, `GET /api/notifications`.
- Frontend: nuevo cliente HTTP centralizado, inicio de sesión por código de organización, menú y carga de datos según permisos.
- Dependencias: `zod@4`; desarrollo: `vitest`, `supertest`.
- Datos: los usuarios existentes ya tienen `role` persistido; las organizaciones existentes sin código siguen entrando con su ID. Nuevos índices no destructivos.
- Recepcionistas existentes pierden acceso de escritura a profesionales y servicios y al panel de indicadores (alineado con HU-02, HU-03 y HU-11-E1).
