# Guía · Pruebas de integración con MongoDB Atlas

Las pruebas de integración (`backend/tests/integration/`) se ejecutan **solo** contra la base `reservas_saas_test`, con un usuario de Atlas que no puede leer ni escribir ninguna otra base.

## 1. Crear el usuario de pruebas en Atlas (mínimo privilegio)

1. Atlas → tu proyecto → **Security › Database Access** → **Add New Database User**.
2. **Authentication Method**: Password.
   - Usuario: `reservaflow_test`.
   - Contraseña: **Autogenerate Secure Password**. Es alfanumérica, así que no necesita codificarse en la URI. Guárdala en tu gestor de contraseñas.
3. **Database User Privileges** → **Specific Privileges** → **Add Specific Privilege**:
   - Role: `readWrite`.
   - Database: `reservas_saas_test`.
   - Collection: *(vacío)*.

   No elijas "Read and write to any database", "Atlas admin" ni `dbOwner`, porque la suite los rechaza.
4. **Restrict Access to Specific Clusters**: actívalo y marca solo el clúster del proyecto.
5. (Recomendado) **Temporary User**: 7 días.
6. **Add User**.

Y en **Security › Network Access** → **Add IP Address** → **Add Current IP Address**. No uses `0.0.0.0/0`.

> La base `reservas_saas_test` no hace falta crearla a mano: se crea con la primera ejecución.

## 2. Crear `backend/.env.test`

1. Atlas → **Connect** → **Drivers** → copia la cadena `mongodb+srv://...mongodb.net/?retryWrites=true&w=majority...`.
2. Sustituye el usuario y la contraseña por los de `reservaflow_test` y añade `/reservas_saas_test` justo antes de `?`.
3. En PowerShell:
   ```powershell
   cd backend                      # desde la raíz del repositorio
   Copy-Item .env.test.example .env.test
   code .env.test
   ```
4. Deja una sola línea con este formato:
   ```
   MONGO_URI_TEST=mongodb+srv://reservaflow_test:<CLAVE>@<cluster>.mongodb.net/reservas_saas_test?retryWrites=true&w=majority
   ```

Edita el archivo en el editor: no pegues la URI en la terminal, porque quedaría en el historial. `.env.test` está ignorado por git, y `.env` no se toca ni se lee.

## 3. Comprobar sin conectar

```powershell
npm run test:integration:check
```
Muestra el usuario, el host enmascarado y la base, sin la contraseña. No abre ninguna conexión.

## 4. Ejecutar (solo con autorización)

```powershell
npm run test:integration
```
El comando repite la comprobación previa y, si pasa, ejecuta la suite. Usa **PowerShell**: en Git Bash, Vitest falla al cargarse por la letra de unidad.

## Suites que se ejecutan

| Archivo | Contenido | Última ejecución |
|---|---|---|
| `security.integration.test.js` | HU-11, HU-14, HU-15 y regresiones | 14/14 |
| `functional.integration.test.js` | HU-01 a HU-10, HU-12 y HU-13, incluidas carreras reales (HU-09-E3, HU-06-E4) | 40/40 |
| `demo.integration.test.js` | Script de datos de demostración (solo en la base de pruebas) | 2/2 |
| `notifications.integration.test.js` | HU-04-E1: correo de confirmación con el transporte en memoria (nunca envía), fallo y reintentos simultáneos, aislamiento | Pendiente: escrita el 2026-11-23; Atlas no era accesible desde la IP actual |

Si `npm run test:integration` falla con `MongoServerSelectionError` y la comprobación previa es correcta, lo más probable es que la IP pública haya cambiado. Atlas › **Security › Network Access** › **Add Current IP Address**.

La E2E (`backend/scripts/e2e-server.js`) reutiliza `connectTestDb()`, así que hereda todas las salvaguardas de abajo. Además, solo borra organizaciones cuyo nombre contiene la etiqueta de su ejecución (`E2E_TAG`).

## Salvaguardas implementadas

| # | Protección | Dónde |
|---|---|---|
| 1 | La URI se lee **solo** de `backend/.env.test`; se ignoran `.env` y las variables del sistema | `guards.js › readTestUri` |
| 2 | Antes de conectar: la base de la URI debe ser exactamente `reservas_saas_test`, con usuario y contraseña, y con `authSource` limitado a `admin` o a la base de pruebas | `assertSafeTestUri` |
| 3 | La conexión fuerza `dbName: reservas_saas_test` y desactiva `autoIndex` y `autoCreate`: nada se escribe al conectar | `SAFE_CONNECT_OPTIONS` |
| 4 | Tras conectar, `connectionStatus` debe mostrar **solo** roles sobre `reservas_saas_test` y ningún rol administrativo o global; si no, se desconecta sin escribir | `assertLeastPrivilege` |
| 5 | Los índices se crean con `createIndexes` (nunca `syncIndexes`, que puede borrar índices) | `setup.js` |
| 6 | La limpieza borra solo los documentos con los `tenantId` y `jti` creados en esa ejecución; nunca colecciones ni bases | `cleanupAndDisconnect` |
| 7 | Sin configuración válida, la suite **falla** (no se omite), para que nunca parezca aprobada | `test:integration` |
| 8 | `npm test` no ejecuta la integración | `vitest.config.js` |
| 9 | La barrera real: aunque el código fallara, el usuario de Atlas no tiene permisos sobre `reservas_saas` | Paso 1 |

Las salvaguardas 1 a 4 tienen pruebas unitarias en `tests/unit/integrationGuards.test.js`, que no usan red.

## Después de la ejecución

- Si una ejecución se interrumpe, pueden quedar organizaciones de prueba con nombres terminados en `it-xxxxxx`. Solo pueden estar en `reservas_saas_test`.
- Cuando termine la validación, elimina o deja caducar el usuario `reservaflow_test`.
- Comprobación manual opcional: abre Compass con la URI de pruebas e intenta abrir `reservas_saas`. Debe responder *not authorized*.
- **`bad auth : Authentication failed` (code 8000)**: Atlas rechaza el par usuario/contraseña, aunque la red esté bien.
  1. Database Access → copia el **Username** exacto de la fila del usuario de pruebas (no la descripción).
  2. **Edit → Edit Password → Autogenerate**, copia la contraseña nueva y pulsa **Update User**. Espera a que el despliegue termine (1–2 min).
  3. Vuelve a escribir el usuario y la contraseña en `.env.test`. Si el usuario tiene espacios u otros símbolos, codifícalos (espacio = `%20`).

  `authSource` no hace falta: con `mongodb+srv`, Atlas ya aplica `admin`.
- Si la suite se detiene con "Rol … no permitido" teniendo solo `readWrite@reservas_saas_test`, Atlas está reportando un rol adicional. Revisa el usuario en **Database Access**; no relajes la comprobación.
