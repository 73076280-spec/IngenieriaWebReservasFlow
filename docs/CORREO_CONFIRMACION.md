# Confirmación de reservas por correo (HU-04-E1)

Al registrar una cita, ReservaFlow genera un correo de confirmación para el cliente. Incluye el código de reserva, la organización, el servicio, el profesional, la fecha y el horario (hora de Lima), la duración y el precio.

**Cómo funciona (modo de prueba):** el correo **no se envía por Internet**. Se guarda como archivo `.html` en `backend/.mail-outbox/`, que se puede abrir en el navegador durante la demostración. La interfaz lo indica: "Correo de prueba generado (no se envió un correo real)".

| Estado (`notification.status` de la cita) | Significado |
|---|---|
| `simulada` | Correo generado en la bandeja local (modo de prueba) |
| `sin_correo` | El cliente no tiene correo en su ficha |
| `fallida` | No se pudo generar. **La reserva sigue registrada**; el personal puede pulsar *Reenviar confirmación* |
| `desactivada` | `MAIL_TRANSPORT=disabled` |
| `pendiente` | En curso |

Garantías:
- Un solo correo por cita.
- Cada organización solo genera correos para sus propios clientes.
- Si el correo falla, la cita no se pierde.

## Configuración

No hace falta configurar nada. Opcionalmente, en `backend/.env`:

```
MAIL_TRANSPORT=file        # por defecto; "disabled" para no generar correos
```

## Por qué no se envían correos reales

La consigna del curso no exige correo electrónico, y HU-04-E1 pide "enviar una confirmación al cliente". Eso se cumple con la confirmación registrada, visible para el cliente en su portal y generada como correo. En la fase anterior se había escrito un cliente SMTP propio; se retiró en la simplificación por su complejidad.

Si el equipo quiere envío real, el camino sencillo es:
1. `npm install nodemailer` en `backend`.
2. En `src/notifications/mailer.js`, añadir un modo `smtp` que llame a `nodemailer.createTransport({ host, port, auth })` con credenciales en `.env`.

No está incluido ni verificado.
