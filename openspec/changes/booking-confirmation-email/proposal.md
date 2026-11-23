# Proposal

## Why

HU-04-E1 exige que, al confirmar la reserva, el sistema "registra la cita con estado 'programada' y **envía una confirmación al cliente**". Antes solo se mostraba un comprobante en pantalla.

## What Changes

- Correo de confirmación generado al registrar una cita: código, organización, servicio, profesional, fecha, horario, duración y precio, con plantilla HTML y texto plano.
- Entrega en modo de prueba (`MAIL_TRANSPORT`): `file` guarda el `.html` en una bandeja local, `memory` sirve a las pruebas y `disabled` no genera correos. No hay envío real por SMTP.
- Estado de la confirmación en la cita (`notification`) visible en la API y la interfaz. Un único correo por cita y reenvío manual del personal si falló.
- La reserva se conserva aunque la confirmación falle.

## Capabilities

### New Capabilities
- `booking-notifications`: confirmación de reservas por correo y registro de su estado (HU-04-E1).

## Impact

- Backend: `src/notifications/` (`mailer.js`, `templates.js`, `bookingConfirmation.js`), `config/env.js`, campo opcional `Appointment.notification`, `appointmentService.create` y `POST /api/appointments/:id/notification`. Sin dependencias nuevas.
- Frontend: estado del correo en el comprobante, "Mis citas" y el listado; botón "Reenviar confirmación".
- Fuera de alcance: envío real por SMTP (extensión documentada).
