# Sustentación · ReservaFlow SaaS

## 1. Arranque (dos terminales, desde la raíz del repositorio)

```powershell
cd backend;  npm install; npm run dev    # API → http://localhost:4000
cd frontend; npm install; npm run dev    # Web → http://127.0.0.1:5173
```

Requisitos: `backend/.env` con `MONGO_URI` y `JWT_SECRET`, y la IP del equipo autorizada en Atlas (*Network Access*).

## 2. Arquitectura en una frase por capa

```
Navegador (React + Vite, PWA)
        │  JSON por HTTP con token JWT
        ▼
API REST (Node + Express)
  routes/        cada URL declara el permiso que exige
  middlewares/   autenticación (JWT) y autorización (rol)
  services/      reglas de negocio: disponibilidad, estados de la cita, permisos, panel
  repositories/  acceso a datos, siempre filtrado por la organización (tenantId)
  models.js      esquemas de Mongoose
        │
        ▼
MongoDB Atlas (una sola base para todas las organizaciones, separadas por tenantId)
```

Ideas clave:
- **Multiinquilino:** cada documento lleva `tenantId`, que se toma del token y nunca del usuario.
- **Roles:** una tabla única de permisos ([`services/policies.js`](../backend/src/services/policies.js)).
- **Reservas sin choques:** bloques de 15 minutos con índice único dentro de una transacción.

## 3. Recorrido de demostración (8 minutos, partiendo de cero)

1. **Crear organización** ("Crear organización y administrador"). El panel aparece en cero con mensaje de bienvenida (HU-13-E4). Anotar el código de organización.
2. **Servicios:** intentar duración 0 → mensaje oficial (HU-03-E3). Crear "Limpieza dental", 30 min, S/ 45.
3. **Profesionales:** guardar sin especialidad → mensaje oficial (HU-02-E3). Crear "Ana Torres" y marcar el sábado en el editor de turnos (HU-02-E1/E2).
4. **Clientes:** correo `juan@correo` → mensaje oficial (HU-01-E3). Crear "Juan Pérez" con un correo válido.
5. **Usuarios:** crear la recepción y la cuenta de cliente de Juan (HU-11-E1). *Cerrar sesión* (HU-15-E2).
6. **Cliente:** entrar como Juan. *Reservar cita*: servicio, "Cualquier profesional disponible", fecha → horarios libres (HU-07). Confirmar → comprobante con código y "correo de prueba generado" (HU-04-E1). Abrir el `.html` de `backend/.mail-outbox/`.
7. **Recepción:** entrar. Abre en *Citas*, sin Indicadores (HU-11-E1). Buscar "juan" (HU-12-E1). *Confirmar* la cita (HU-10-E2). *Calendario*: colores por estado y paso a la vista diaria (HU-08). *Cancelar* con motivo (HU-06-E1/E2).
8. **Administradora:** *Indicadores* muestra la cancelación por motivo (HU-13).
9. **Aislamiento:** crear una segunda organización. No ve nada de la primera (HU-14).

Para datos con historial (citas pasadas, trimestre) está `npm run demo:seed -- --confirm`. Crea una organización nueva, pero escribe en la base principal: ejecutarlo solo con autorización. Recorrido completo por escenario: [GUIA_DEMOSTRACION.md](GUIA_DEMOSTRACION.md).

## 4. Preguntas probables del profesor

**1. ¿Cómo evitan que una organización vea los datos de otra?**
Al iniciar sesión, el servidor firma un token con el id del usuario y de su organización. En cada petición se verifica el token y se relee el usuario en la base. El `tenantId` sale de ahí, nunca del formulario. Todo acceso a datos pasa por un repositorio (`forTenant(tenantId)`) que añade ese `tenantId` a cada consulta y a cada alta. Si alguien pide el ID de una cita ajena, recibe 404, como si no existiera. Lo comprueban pruebas de integración con dos organizaciones reales (HU-14).

**2. Si dos personas reservan el mismo horario a la vez, ¿qué pasa?**
Cada cita ocupa bloques de 15 minutos. MongoDB tiene un índice único sobre organización, profesional y hora del bloque. La cita y sus bloques se guardan en una transacción: si el segundo usuario intenta ocupar el mismo bloque, la base lo rechaza y se deshace todo. Esa persona recibe "El horario seleccionado ya no está disponible" con el horario libre más cercano. La prueba HU-09-E3 lanza dos reservas simultáneas y verifica que solo se crea una.

**3. ¿Cómo funciona el control por roles?**
Hay una sola tabla de permisos (`policies.js`), por ejemplo `'dashboard:read': ['admin']`. Cada ruta declara el permiso que necesita y el servicio lo vuelve a comprobar. Sin permiso, la respuesta es 403 con el mensaje oficial. La interfaz construye el menú con los permisos que devuelve `/api/me`. Como el rol se relee en cada petición, un cambio de rol se aplica en la siguiente acción del usuario (HU-11-E2).

**4. ¿Qué ocurre al cerrar sesión o si el token vence?**
El token (JWT) dura 8 horas y tiene un identificador único (`jti`). Al cerrar sesión se guarda ese identificador como revocado, de modo que el mismo token ya no sirve (HU-15-E2). Si el token venció, la API responde 401 `TOKEN_EXPIRED` sin ejecutar la acción, y la interfaz cierra la sesión y pide entrar de nuevo (HU-15-E4).

**5. ¿Cómo calculan los horarios disponibles?**
Para la fecha elegida, se toman los turnos del profesional de ese día (en hora de Lima). Se generan inicios cada 15 minutos en los que cabe la duración del servicio y se descartan los pasados y los que pisan bloques ya ocupados. Sin profesional elegido, se combinan los profesionales activos que ofrecen ese servicio. Si no hay horarios, se sugieren las fechas cercanas con disponibilidad (HU-07).

*Si preguntan por el correo:* la confirmación se genera y queda registrada, pero en modo de prueba no se envía por Internet. La consigna no exige correo, y no queríamos depender de credenciales externas. Añadir el envío real sería conectar Nodemailer en un solo archivo.
