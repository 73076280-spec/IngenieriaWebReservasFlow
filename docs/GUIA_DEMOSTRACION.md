# Guía de demostración · ReservaFlow SaaS

Recorrido de unos 15 minutos para la sustentación. Cada paso indica el escenario oficial (`HU-XX-EY`) que demuestra.

## 1. Preparación (una vez, antes de exponer)

```powershell
# Terminal 1 · API (usa backend/.env: MONGO_URI y JWT_SECRET), desde la raíz del repositorio
cd backend
npm install
npm run dev

# Terminal 2 · Interfaz, desde la raíz del repositorio
cd frontend
npm install
npm run dev          # abre http://127.0.0.1:5173
```

En Atlas › *Network Access* debe estar autorizada la IP del equipo que expone.

### Datos de demostración (opcional, recomendado)

Las citas pasadas (completadas, no asistidas, del trimestre) no se pueden crear desde la interfaz, porque no se reserva en el pasado. El script crea **una organización nueva** con datos ficticios en la base de `backend/.env`. **No modifica ni borra nada** y, si la organización ya existe, no hace ningún cambio.

```powershell
cd backend
$env:DEMO_PASSWORD='Demo-12345'      # o la contraseña que prefieras (mínimo 10 caracteres)
npm run demo:seed -- --confirm
```

| Rol | Correo | Contraseña |
|---|---|---|
| Código de organización | `demo-sonrisa-real` | — |
| Administradora | `admin@demo.reservaflow.pe` | la de `DEMO_PASSWORD` |
| Recepción | `recepcion@demo.reservaflow.pe` | ídem |
| Profesional (Ana Torres) | `ana@demo.reservaflow.pe` | ídem |
| Cliente (Juan Pérez) | `juan@demo.reservaflow.pe` | ídem |
| Cuenta sin rol | `pendiente@demo.reservaflow.pe` | ídem |

Contenido: 3 profesionales con turnos y servicios distintos, 4 servicios, 5 clientes y 12 citas. Las pasadas están en los dos meses anteriores (completadas, una no asistida y una cancelada con motivo) y las futuras, en los próximos días (programadas y confirmadas).

## 2. Recorrido

### A. Seguridad y acceso (2 min)
1. Iniciar sesión con una contraseña incorrecta → "Las credenciales ingresadas no son válidas" (**HU-15-E3**).
2. Entrar con `pendiente@…` → acceso denegado por cuenta pendiente (**HU-11-E4**).
3. Entrar como administradora → abre **Indicadores**, su sección inicial (**HU-15-E1**).

### B. Administradora (4 min)
4. **Indicadores:** mes actual con citas por estado, servicio más solicitado, top 3 clientes y cancelaciones por motivo (**HU-13-E1**). Cambiar a "Último trimestre" para ver el recálculo (**HU-13-E2**).
5. **Usuarios:** aparece el aviso de la cuenta pendiente del paso 2 (**HU-11-E4**). Asignarle el rol *recepcionista* (**HU-11-E1/E2**).
6. **Profesionales** › Editar a Ana › marcar *Sábado* en el editor de turnos (**HU-02-E2**). Intentar guardar un profesional nuevo sin especialidad → "Debe seleccionar al menos una especialidad" (**HU-02-E3**).
7. **Profesionales** › *Desactivar* a Ana → advierte que tiene citas pendientes y ofrece verlas (**HU-02-E4**).
8. **Servicios** › nuevo servicio con duración 0 → "La duración del servicio debe ser mayor que cero" (**HU-03-E3**). *Eliminar* "Limpieza dental" → sugiere desactivarlo (**HU-03-E4**). Pulsar *Cerrar*: si se desactiva, el cliente no podrá reservarlo en el paso 17.
9. **Configuración:** plazo mínimo de reprogramación (2 horas).
10. *Cerrar sesión* → vuelve a la pantalla de acceso (**HU-15-E2**).

### C. Recepción (4 min)
11. Entrar como recepción → abre **Citas**, sin acceso a Indicadores (**HU-11-E1**).
12. Buscar "juan" (**HU-12-E1**). Filtrar por profesional y rango de fechas (**HU-12-E2**). Poner *Desde* posterior a *Hasta* → mensaje oficial (**HU-12-E3**). Filtrar por estado "No asistió" en un rango sin citas → "No se encontraron citas…" (**HU-12-E4**).
13. *Confirmar* una cita programada (**HU-10-E2**). *Cancelar* otra con motivo "Cliente no puede asistir" (**HU-06-E1/E2**).
14. **Clientes:** nuevo cliente con correo `juan@correo` → mensaje oficial (**HU-01-E3**). *Historial* de Pedro Gómez → muestra su inasistencia (**HU-10-E4**). *Eliminar* a Juan Pérez → lo impide porque tiene citas pendientes (**HU-01-E4**).
15. **Calendario:** vista mensual con colores por estado y leyenda. Pulsar un día → vista diaria con cliente y servicio; pulsar una cita para ver su detalle (**HU-08-E1/E2**). Ir a un día sin citas → aviso (**HU-08-E4**).

### D. Profesional (1 min)
16. Entrar como `ana@…` → **Calendario** en vista semanal, solo con sus citas (**HU-08-E1**).

### E. Cliente (3 min)
17. Entrar como `juan@…` → **Reservar cita**: servicio, "Cualquier profesional disponible", fecha → horarios libres según duración y turno (**HU-07-E1/E2**). Elegir uno → comprobante con código y estado del correo (**HU-04-E1/E2**). Abrir el `.html` más reciente de `backend/.mail-outbox/` en el navegador para mostrar el correo de confirmación generado. Aclarar que es **modo de prueba** y que no se envió un correo real ([CORREO_CONFIRMACION.md](CORREO_CONFIRMACION.md)).
18. Escribir una fecha pasada en el campo *Fecha* → "No es posible consultar disponibilidad para fechas pasadas" (**HU-07-E3**). Elegir *Blanqueamiento* con Carla Ruiz y un lunes (no atiende ese día) → "No hay horarios disponibles para esta fecha" con fechas cercanas sugeridas, que se pueden pulsar (**HU-07-E4**).
19. **Mis citas** › *Reprogramar* → otro horario, opcionalmente con otro profesional (**HU-05-E1/E2**). *Cancelar* una cita. En el historial, *Reprogramar* una cancelada → "La cita ya no está activa" y ofrece una nueva reserva (**HU-05-E4**).

### F. Aislamiento SaaS (1 min)
20. *Crear organización y administrador* con otra empresa (p. ej. "Barbería Estilo Urbano"). Su panel aparece vacío con bienvenida (**HU-13-E4**) y no ve ningún dato de la clínica (**HU-14-E1**).

## 3. Evidencias automatizadas para mostrar

```powershell
cd backend;  npm test                      # 104 pruebas unitarias y de componentes
cd backend;  npm run test:integration      # 56 pruebas en Atlas, base aislada reservas_saas_test
cd frontend; npm test                      # 20 pruebas del frontend
```

- Capturas reales de la E2E con Edge: [`docs/evidencias/e2e/`](evidencias/e2e/) (23 capturas y `resultado.json`).
- Matriz de los 60 escenarios: [MATRIZ_TRAZABILIDAD.md](MATRIZ_TRAZABILIDAD.md). Informe: [INFORME_AUDITORIA_FINAL.md](INFORME_AUDITORIA_FINAL.md).
- Especificaciones OpenSpec: [`openspec/specs/`](../openspec/specs/).

## 4. Si algo falla durante la demostración

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| "Error inesperado" al iniciar | La API no conecta con Atlas | Revisar la IP en *Network Access* y `MONGO_URI` |
| La sesión se cierra sola | Token vencido (8 h) o API reiniciada con otro `JWT_SECRET` | Volver a iniciar sesión |
| No aparecen horarios | El profesional no trabaja ese día o no ofrece el servicio | Elegir otra fecha o "Cualquier profesional disponible" |
| "Su cuenta de cliente no está vinculada…" | Cuenta de cliente creada sin ficha | Administrador › Usuarios › asignar el rol *Cliente* (vincula por correo) |
