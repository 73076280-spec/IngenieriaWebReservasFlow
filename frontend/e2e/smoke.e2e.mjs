// Prueba E2E de la interfaz (React → Express → MongoDB reservas_saas_test) con Microsoft Edge.
// Requiere: API de pruebas (backend/scripts/e2e-server.js) en E2E_API y Vite en E2E_URL.
// Guarda capturas y el resultado de cada paso en docs/evidencias/e2e/.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const URL_APP = process.env.E2E_URL || 'http://127.0.0.1:5174';
const API = process.env.E2E_API || 'http://127.0.0.1:4100';
const TAG = process.env.E2E_TAG;
if (!/^e2e-[a-z0-9]{6}$/.test(TAG || '')) throw new Error('E2E_TAG requerido (e2e-xxxxxx)');
const OUT = fileURLToPath(new URL('../../docs/evidencias/e2e/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const PASS = 'Demo-12345';
const users = { admin: `admin-${TAG}@demo.test`, recep: `recep-${TAG}@demo.test`, pro: `ana-${TAG}@demo.test`, cliente: `juan-${TAG}@demo.test` };
const results = [];
let shot = 0;

// Próximo día de lunes a sábado a partir de mañana (el profesional atiende de lunes a sábado).
function nextWorkingDay() {
  const d = new Date();
  do d.setDate(d.getDate() + 1); while (d.getDay() === 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 860 }, locale: 'es-PE', timezoneId: 'America/Lima' });
page.setDefaultTimeout(15000);
// Registro de las últimas respuestas de la API para diagnosticar un paso fallido.
const apiLog = [];
page.on('response', async (r) => {
  if (!r.url().includes('/api/')) return;
  let size = '';
  try { const b = await r.json(); size = Array.isArray(b) ? `items=${b.length}` : ''; } catch { /* sin cuerpo JSON */ }
  apiLog.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')} ${size}`);
  if (apiLog.length > 15) apiLog.shift();
});
page.on('requestfailed', (r) => { if (r.url().includes('/api/')) apiLog.push(`FALLÓ ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });

async function capture(name) {
  const file = `${String(++shot).padStart(2, '0')}-${name.replace(/[^\w-]+/g, '-')}.png`;
  await page.screenshot({ path: OUT + file, fullPage: true });
  return file;
}
async function step(id, title, fn) {
  const started = Date.now();
  try {
    const evidence = await fn();
    results.push({ id, title, ok: true, ms: Date.now() - started, evidence: evidence || null });
    console.log(`✔ ${id} ${title}`);
  } catch (err) {
    const evidence = await capture('FALLO-' + id).catch(() => null);
    results.push({ id, title, ok: false, ms: Date.now() - started, error: String(err.message).split('\n')[0], evidence, api: [...apiLog] });
    console.log(`✘ ${id} ${title}\n   ${String(err.message).split('\n')[0]}\n   Últimas respuestas de la API:\n     ${apiLog.join('\n     ')}`);
    throw err;
  }
}
const expectText = async (locator, text) => { await locator.filter({ hasText: text }).first().waitFor({ state: 'visible' }); };
const swalOk = async () => { await page.locator('.swal2-confirm').click(); await page.locator('.swal2-popup').waitFor({ state: 'detached' }); };
const nav = (label) => page.locator('nav button', { hasText: label }).click();
const modal = () => page.locator('.modal');
// Elige la fecha y espera a que los horarios mostrados sean los de ESA fecha (p. ej. "24 de noviembre").
const dayLabel = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'UTC' }); };
async function pickDate(iso) {
  await page.locator('label:has-text("Fecha") input').fill(iso);
  await expectText(page.locator('fieldset.slots legend'), dayLabel(iso));
}

async function login(email, orgCode, password = PASS) {
  await page.locator('input[name=organization]').fill(orgCode);
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('.authCard button.primary').click();
}
async function logout() {
  await page.locator('button.logout').click();
  await page.locator('.authCard').waitFor();
}

let orgCode;
let failed = false;
try {
  await page.goto(URL_APP);

  await step('HU-13-E4', 'Registro de organización: panel en cero con mensaje de bienvenida', async () => {
    await page.locator('button.link', { hasText: 'Crear organización' }).click();
    await page.locator('input[name=organization]').fill(`Clínica Dental Sonrisa Real ${TAG}`);
    await page.locator('input[name=name]').fill('Administradora Demo');
    await page.locator('input[name=email]').fill(users.admin);
    await page.locator('input[name=password]').fill(PASS);
    await page.locator('.authCard button.primary').click();
    orgCode = (await page.locator('.swal2-html-container b').textContent()).trim();
    await swalOk();
    await expectText(page.locator('h1'), 'Indicadores');
    await expectText(page.locator('.banner'), 'Aún no hay datos para mostrar');
    return capture('panel-bienvenida');
  });

  await step('HU-03-E3', 'Servicio con duración 0: mensaje oficial y no se guarda', async () => {
    await nav('Servicios');
    await page.locator('button', { hasText: '+ Nuevo servicio' }).click();
    await modal().locator('input[name=name]').fill('Limpieza dental');
    await modal().locator('input[name=duration]').fill('0');
    await modal().locator('input[name=price]').fill('45');
    await modal().locator('button.primary').click();
    await expectText(modal().locator('.form-error'), 'La duración del servicio debe ser mayor que cero');
    return capture('servicio-duracion-invalida');
  });

  await step('HU-03-E1', 'Servicio "Limpieza dental" de 30 min y S/ 45 creado', async () => {
    await modal().locator('input[name=duration]').fill('30');
    await modal().locator('button.primary').click();
    await modal().waitFor({ state: 'detached' });
    await expectText(page.locator('tbody tr'), 'Limpieza dental');
  });

  await step('HU-02-E3', 'Profesional sin especialidad: mensaje oficial', async () => {
    await nav('Profesionales');
    await page.locator('button', { hasText: '+ Nuevo profesional' }).click();
    await modal().locator('input[name=name]').fill('Ana Torres');
    await modal().locator('button.primary').click();
    await expectText(modal().locator('.form-error'), 'Debe seleccionar al menos una especialidad');
    return capture('profesional-sin-especialidad');
  });

  await step('HU-02-E1/E2', 'Profesional con especialidad y horario de lunes a sábado', async () => {
    await modal().locator('input[name=specialty]').fill('Odontología general');
    await modal().locator('.schedule-row', { hasText: 'Sábado' }).locator('input[type=checkbox]').check();
    await modal().locator('.schedule-row', { hasText: 'Sábado' }).locator('input[type=time]').last().fill('13:00');
    const file = await capture('profesional-editor-turnos');
    await modal().locator('button.primary').click();
    await modal().waitFor({ state: 'detached' });
    await expectText(page.locator('tbody tr'), 'Lun–Vie 09:00–18:00 · Sáb 09:00–13:00');
    return file;
  });

  await step('HU-01-E3', 'Cliente con correo "juan@correo": mensaje oficial', async () => {
    await nav('Clientes');
    await page.locator('button', { hasText: '+ Nuevo cliente' }).click();
    await modal().locator('input[name=name]').fill('Juan Pérez');
    await modal().locator('input[name=email]').fill('juan@correo');
    await modal().locator('button.primary').click();
    await expectText(modal().locator('.form-error'), 'El correo electrónico no tiene un formato válido');
    return capture('cliente-correo-invalido');
  });

  await step('HU-01-E1', 'Cliente registrado con teléfono y notas de atención', async () => {
    await modal().locator('input[name=email]').fill(`juan.perez-${TAG}@correo.pe`);
    await modal().locator('input[name=phone]').fill('987654321');
    await modal().locator('textarea[name=notes]').fill('Prefiere atención por la mañana');
    await modal().locator('button.primary').click();
    await modal().waitFor({ state: 'detached' });
    await expectText(page.locator('tbody tr'), 'Juan Pérez');
    return capture('clientes-listado');
  });

  await step('HU-11-E1', 'El administrador crea las cuentas de recepción, profesional y cliente', async () => {
    await nav('Usuarios');
    for (const [name, email, role] of [['Recepción Demo', users.recep, 'recepcionista'], ['Ana Torres', users.pro, 'profesional'], ['Juan Pérez', users.cliente, 'cliente']]) {
      await page.locator('button', { hasText: '+ Nueva cuenta' }).click();
      await modal().locator('input[name=name]').fill(name);
      await modal().locator('input[name=email]').fill(email);
      await modal().locator('input[name=password]').fill(PASS);
      await modal().locator('select[name=role]').selectOption(role);
      if (role === 'cliente') await modal().locator('select[name=clientId]').selectOption({ label: 'Juan Pérez' });
      if (role === 'profesional') await modal().locator('select[name=employeeId]').selectOption({ label: 'Ana Torres' });
      await modal().locator('button.primary').click();
      await modal().waitFor({ state: 'detached' });
    }
    await expectText(page.locator('tbody tr'), 'Recepcionista');
    return capture('usuarios-roles');
  });

  await step('HU-15-E2', 'Cerrar sesión vuelve a la pantalla de inicio de sesión', async () => {
    await logout();
  });

  await step('HU-15-E3', 'Contraseña incorrecta: mensaje oficial sin indicar el campo', async () => {
    await login(users.admin, orgCode, 'incorrecta-123');
    await expectText(page.locator('.form-error'), 'Las credenciales ingresadas no son válidas');
    return capture('login-credenciales-invalidas');
  });

  const date = nextWorkingDay();
  await step('HU-15-E1/HU-07-E1/HU-04-E1', 'El cliente entra a "Reservar cita", consulta disponibilidad y reserva', async () => {
    await login(users.cliente, orgCode);
    await expectText(page.locator('h1'), 'Reservar cita');
    await page.locator('label:has-text("Servicio") select').selectOption({ index: 1 });
    await pickDate(date);
    await page.locator('.slot').nth(2).click();
    const file = await capture('cliente-disponibilidad');
    await page.locator('button', { hasText: 'Confirmar reserva' }).click();
    await expectText(page.locator('.swal2-popup'), 'Reserva confirmada');
    // Modo de prueba: la interfaz no lo presenta como un correo real.
    await expectText(page.locator('.swal2-popup .swal-note'), 'no se envió un correo real');
    await capture('cliente-reserva-confirmada');
    await page.locator('.swal2-confirm').click();
    await expectText(page.locator('.appt-card'), 'Programada');
    await expectText(page.locator('.appt-card .mail'), 'Correo de prueba generado');
    await capture('cliente-mis-citas');
    return file;
  });

  await step('HU-04-E1 (correo)', 'El correo de confirmación generado contiene código, servicio, profesional, fecha y hora', async () => {
    const outbox = await (await fetch(API + '/__e2e/outbox')).json();
    const mail = outbox.at(-1);
    if (!mail || mail.to !== `juan.perez-${TAG}@correo.pe`) throw new Error('No se generó el correo para el cliente');
    for (const s of ['Limpieza dental', 'Ana Torres', 'Programada']) if (!mail.html.includes(s)) throw new Error('Falta en el correo: ' + s);
    const view = await browser.newPage({ viewport: { width: 720, height: 900 } });
    await view.setContent(mail.html);
    const file = `${String(++shot).padStart(2, '0')}-correo-confirmacion-modo-prueba.png`;
    await view.screenshot({ path: OUT + file, fullPage: true });
    await view.close();
    return file;
  });

  await step('HU-04-E4/HU-15-E4', 'Sesión vencida al confirmar una reserva: no se crea y se pide iniciar sesión', async () => {
    await nav('Reservar cita');
    await page.locator('label:has-text("Servicio") select').selectOption({ index: 1 });
    await pickDate(date);
    await page.locator('.slot').nth(6).click();
    const token = await page.evaluate(() => sessionStorage.getItem('rf_token'));
    const expired = (await (await fetch(API + '/__e2e/expire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })).json()).token;
    // El token vence justo antes de confirmar: la petición viaja con el token expirado.
    await page.route('**/api/appointments', (route) => route.continue({ headers: { ...route.request().headers(), authorization: 'Bearer ' + expired } }));
    await page.locator('button', { hasText: 'Confirmar reserva' }).click();
    await page.locator('.authCard').waitFor();
    await expectText(page.locator('.Toastify__toast'), 'Su sesión ha expirado');
    await page.unroute('**/api/appointments');
    const file = await capture('sesion-expirada');
    await login(users.cliente, orgCode);
    await nav('Mis citas');
    await page.locator('.appt-card').first().waitFor();
    if ((await page.locator('.appt-card').count()) !== 1) throw new Error('Se creó una cita con la sesión vencida');
    return file;
  });

  await step('HU-05-E1', 'El cliente reprograma su cita desde "Mis citas" (mismo código)', async () => {
    const before = await page.locator('.appt-card').first().textContent();
    await page.locator('.appt-card button', { hasText: 'Reprogramar' }).click();
    await pickDate(date);
    await modal().locator('.slot').nth(8).click();
    const file = await capture('cliente-reprogramar');
    await modal().locator('button', { hasText: 'Confirmar reprogramación' }).click();
    await modal().waitFor({ state: 'detached' });
    await expectText(page.locator('.Toastify__toast'), 'Cita reprogramada');
    const after = await page.locator('.appt-card').first().textContent();
    const code = /Código (\w{8})/.exec(before)[1];
    if (!after.includes(code) || after === before) throw new Error('La cita no conservó su código o no cambió de horario');
    await logout();
    return file;
  });

  await step('HU-02-E4/HU-03-E4/HU-05-E3', 'Administradora: advertencias al desactivar y eliminar, y plazo de reprogramación', async () => {
    await login(users.admin, orgCode);
    await nav('Profesionales');
    await page.locator('tbody tr', { hasText: 'Ana Torres' }).locator('button', { hasText: 'Desactivar' }).click();
    await expectText(page.locator('.swal2-popup'), 'Reasígnelas a otro profesional antes de desactivarlo');
    const file = await capture('profesional-desactivar-advertencia');
    await page.locator('.swal2-cancel').click();
    await expectText(page.locator('tbody tr', { hasText: 'Ana Torres' }), 'Activo');
    await nav('Servicios');
    await page.locator('tbody tr', { hasText: 'Limpieza dental' }).locator('button', { hasText: 'Eliminar' }).click();
    await page.locator('.swal2-confirm').click();
    await expectText(page.locator('.swal2-popup'), 'Desactívelo en lugar de eliminarlo');
    await capture('servicio-eliminar-sugerencia');
    await page.locator('.swal2-cancel').click();
    await nav('Configuración');
    await page.locator('input[name=hours]').fill('3');
    await page.locator('button.primary', { hasText: 'Guardar' }).click();
    await expectText(page.locator('.Toastify__toast'), 'Configuración guardada');
    await logout();
    return file;
  });

  await step('HU-15-E1/HU-11-E1', 'Recepción entra a "Citas" y no ve el panel de indicadores', async () => {
    await login(users.recep, orgCode);
    await expectText(page.locator('h1'), 'Citas');
    if (await page.locator('nav button', { hasText: 'Indicadores' }).count()) throw new Error('Recepción ve Indicadores');
  });

  await step('HU-12-E1', 'Búsqueda por nombre de cliente', async () => {
    await page.locator('.filters label:has-text("Cliente") input').fill('juan');
    await page.locator('.filters button.primary').click();
    await expectText(page.locator('tbody tr'), 'Juan Pérez');
    return capture('citas-busqueda-cliente');
  });

  await step('HU-12-E3', 'Rango de fechas invertido: mensaje oficial y no se busca', async () => {
    await page.locator('.filters label:has-text("Desde") input').fill('2026-12-20');
    await page.locator('.filters label:has-text("Hasta") input').fill('2026-12-01');
    await page.locator('.filters button.primary').click();
    await expectText(page.locator('.form-error'), 'La fecha inicial no puede ser posterior a la fecha final');
    return capture('citas-rango-invalido');
  });

  await step('HU-12-E4', 'Filtro sin resultados: mensaje oficial', async () => {
    await page.locator('.filters button', { hasText: 'Limpiar' }).click();
    await page.locator('.filters label:has-text("Estado") select').selectOption('no_asistio');
    await page.locator('.filters button.primary').click();
    await expectText(page.locator('.state-empty'), 'No se encontraron citas con los filtros seleccionados');
    await page.locator('.filters button', { hasText: 'Limpiar' }).click();
    return capture('citas-sin-resultados');
  });

  await step('HU-01-E2/HU-10-E4', 'Historial del cliente con sus citas y conteos de asistencia', async () => {
    await nav('Clientes');
    await page.locator('tbody tr', { hasText: 'Juan Pérez' }).locator('button', { hasText: 'Historial' }).click();
    await expectText(modal().locator('.mini-cards'), 'No asistió');
    await expectText(modal().locator('tbody tr'), 'Limpieza dental');
    await expectText(modal().locator('.notice'), 'Prefiere atención por la mañana');
    const file = await capture('cliente-historial');
    await modal().locator('button[aria-label="Cerrar"]').click();
    return file;
  });

  await step('HU-01-E4', 'Eliminar un cliente con citas pendientes: advertencia y el cliente se conserva', async () => {
    await page.locator('tbody tr', { hasText: 'Juan Pérez' }).locator('button', { hasText: 'Eliminar' }).click();
    await page.locator('.swal2-confirm').click();
    await expectText(page.locator('.swal2-popup'), 'Primero debe cancelar o reasignar sus citas pendientes');
    const file = await capture('cliente-eliminar-advertencia');
    await page.locator('.swal2-cancel').click();
    await expectText(page.locator('tbody tr'), 'Juan Pérez');
    await nav('Citas');
    return file;
  });

  await step('HU-10-E2', 'Recepción confirma la cita', async () => {
    await page.locator('tbody tr', { hasText: 'Juan Pérez' }).locator('button', { hasText: 'Confirmar' }).click();
    await expectText(page.locator('tbody tr'), 'Confirmada');
  });

  await step('HU-08-E3', 'Falla al cargar la agenda: mensaje y botón Reintentar', async () => {
    await page.route(/\/api\/appointments\?/, (route) => route.abort());
    await nav('Calendario');
    await expectText(page.locator('.state-error'), 'No se pudo cargar la agenda');
    const file = await capture('agenda-error-reintentar');
    await page.unroute(/\/api\/appointments\?/);
    await page.locator('.state-error button', { hasText: 'Reintentar' }).click();
    await page.locator('.state-error').waitFor({ state: 'detached' });
    return file;
  });

  await step('HU-08-E1/E2', 'Agenda mensual con color por estado y paso a la vista diaria del día de la cita', async () => {
    if (new Date().getMonth() + 1 !== Number(date.slice(5, 7))) await page.locator('.fc-next-button').click();
    await page.locator('.fc-event').first().waitFor();
    const file = await capture('agenda-mensual-colores');
    // Vista mensual → diaria: el enlace del número de día abre solo las citas de ese día.
    await page.locator(`.fc-daygrid-day[data-date="${date}"] a.fc-daygrid-day-number`).click();
    await page.locator('.fc-timeGridDay-view').waitFor();
    await expectText(page.locator('.fc-event'), 'Juan Pérez · Limpieza dental');
    await capture('agenda-diaria-detalle');
    return file;
  });

  await step('HU-08-E4', 'Día sin citas: aviso explícito sin errores', async () => {
    await page.locator('.fc-next-button').click(); // el día siguiente a la cita no tiene citas
    await expectText(page.locator('.notice'), 'No hay citas programadas para este día');
    if (await page.locator('.state-error').count()) throw new Error('Se mostró un error en un día vacío');
    return capture('agenda-dia-vacio');
  });

  await step('HU-08-E1 (profesional)', 'La profesional ve su agenda semanal con su cita confirmada', async () => {
    await logout();
    await login(users.pro, orgCode);
    await expectText(page.locator('h1'), 'Calendario');
    await page.locator('.fc-timeGridWeek-view').waitFor();
    // La semana del calendario en español empieza el lunes: si la cita cae la semana siguiente, se avanza.
    const monday = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x.getTime(); };
    if (monday(`${date}T12:00:00`) > monday(new Date())) await page.locator('.fc-next-button').click();
    await expectText(page.locator('.fc-event'), 'Juan Pérez · Limpieza dental');
    const file = await capture('profesional-agenda-semanal');
    await logout();
    await login(users.recep, orgCode);
    return file;
  });

  await step('HU-06-E1/E2', 'Recepción cancela con motivo y el horario se libera', async () => {
    await nav('Citas');
    await page.locator('tbody tr', { hasText: 'Juan Pérez' }).locator('button', { hasText: 'Cancelar' }).click();
    await page.locator('.swal2-select').selectOption('cliente_no_puede_asistir');
    const file = await capture('cancelacion-motivo');
    await page.locator('.swal2-confirm').click();
    await expectText(page.locator('tbody tr'), 'Cancelada');
    await expectText(page.locator('tbody tr'), 'Cliente no puede asistir');
    return file;
  });

  await step('Responsivo', 'Vista móvil (390 px) del listado de citas', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const file = await capture('movil-citas');
    await page.setViewportSize({ width: 1366, height: 860 });
    await logout();
    return file;
  });

  await step('HU-13-E1/HU-06-E2', 'El administrador ve indicadores con la cancelación por motivo', async () => {
    await login(users.admin, orgCode);
    await expectText(page.locator('h1'), 'Indicadores');
    await expectText(page.locator('.cards article'), 'Cliente no puede asistir');
    return capture('panel-indicadores');
  });

  await step('HU-13-E3', 'Falla al calcular indicadores: error amigable sin datos obsoletos', async () => {
    await page.route('**/api/dashboard*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'No se pudieron calcular los indicadores en este momento. Intente nuevamente en unos minutos.', code: 'DASHBOARD_UNAVAILABLE' }) }));
    await page.locator('label:has-text("Periodo") select').selectOption('trimestre');
    await expectText(page.locator('.state-error'), 'No se pudieron calcular los indicadores');
    if (await page.locator('.cards').count()) throw new Error('Se muestran indicadores tras el error');
    const file = await capture('panel-error');
    await page.unroute('**/api/dashboard*');
    await page.locator('.state-error button', { hasText: 'Reintentar' }).click();
    await page.locator('.cards').first().waitFor();
    return file;
  });
} catch {
  failed = true;
} finally {
  await browser.close();
  const summary = { fecha: new Date().toISOString(), navegador: 'Microsoft Edge (playwright-core, sin interfaz)', base: 'reservas_saas_test', etiqueta: TAG, aprobados: results.filter((r) => r.ok).length, fallidos: results.filter((r) => !r.ok).length, pasos: results };
  writeFileSync(OUT + 'resultado.json', JSON.stringify(summary, null, 2));
  console.log(`\nE2E: ${summary.aprobados} aprobados, ${summary.fallidos} fallidos. Evidencias en docs/evidencias/e2e/`);
  process.exitCode = failed ? 1 : 0;
}
