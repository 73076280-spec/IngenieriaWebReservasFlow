# Design

## Context

`appointmentService.create` registra la cita en una transacción (cita y bloques de 15 minutos) y devuelve un comprobante. La consigna del curso no exige correo electrónico; HU-04-E1 pide "enviar una confirmación al cliente".

## Decisions

1. **Confirmación generada sin envío real (simplificación del 2026-11-23).** Se genera el correo con una plantilla HTML y texto, y se entrega a una bandeja local:
   - `file`: archivo `.html` en `backend/.mail-outbox/`.
   - `memory`: en memoria, para pruebas.
   - `disabled`: no genera correos.

   El estado queda registrado en la cita. No se incluye SMTP: el cliente SMTP propio de la fase anterior se retiró por su complejidad, y Nodemailer no pudo instalarse (registro de npm inaccesible). Añadirlo es una extensión documentada en `docs/CORREO_CONFIRMACION.md`.
2. **Estados honestos.** `simulada` significa "generado en modo de prueba, no enviado". `enviada` queda reservado para un proveedor real.
3. **Después de la transacción.** La confirmación se genera tras confirmar la cita. Si falla, la cita sigue registrada y la notificación queda `fallida` con un código genérico.
4. **Sin duplicados.** Una actualización atómica condicionada al estado reserva cada confirmación:
   - El primer intento exige que no haya estado.
   - El reintento manual, solo del personal, exige `fallida` o `sin_correo`.
   - En otro caso: `409 CONFIRMATION_ALREADY_SENT`.
5. **Aislamiento.** Cliente, servicio y profesional se leen con los repositorios acotados por la organización de la sesión.
6. **Plantilla.** Los datos de usuario se escapan y las fechas usan la zona horaria de la organización.
