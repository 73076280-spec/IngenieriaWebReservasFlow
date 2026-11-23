# Tasks

## 1. Backend

- [x] 1.1 Modos `file`, `memory` y `disabled` en `src/notifications/mailer.js`; `MAIL_TRANSPORT` validado en `config/env.js` (simplificado el 2026-11-23: se retiraron el cliente SMTP y el generador MIME propios)
- [x] 1.2 Plantilla HTML y de texto con datos escapados y fechas en la zona horaria de la organización
- [x] 1.3 `notification` en la cita, reserva atómica, estados explícitos y código de error genérico; confirmación tras la transacción de reserva
- [x] 1.4 `POST /api/appointments/:id/notification` (reintento desde `fallida` o `sin_correo`, solo personal)

## 2. Interfaz

- [x] 2.1 Estado de la confirmación en el comprobante, "Mis citas" y el listado de citas, y botón "Reenviar confirmación" — *`vite build` correcto; 23/23 pruebas del frontend*

## 3. Verificación

- [x] 3.1 Pruebas unitarias: plantilla y escape, modo archivo, configuración, estados, duplicados, fallo con la reserva conservada, aislamiento — *`notifications.test.js`, 11 pruebas*
- [ ] 3.2 Integración en `reservas_saas_test` (`notifications.integration.test.js`, 5 pruebas) — *escrita; pendiente: Atlas no acepta la conexión desde la IP actual*
- [ ] 3.3 E2E con Edge (comprobante y captura del correo generado) — *pasos añadidos; pendiente por la misma causa*
- [ ] 3.4 `npm audit` — *pendiente: el registro de npm no responde; sin dependencias nuevas*

Archivar el cambio cuando 3.2 a 3.4 estén aprobadas.
