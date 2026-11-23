// Comprobación previa SIN conexión: valida backend/.env.test y muestra un resumen sin secretos.
// Uso: npm run test:integration:check
import { ENV_TEST_PATH, TEST_DB, readTestUri, assertSafeTestUri, parseDbName } from '../tests/integration/guards.js';

const uri = readTestUri();
try {
  assertSafeTestUri(uri);
  const user = decodeURIComponent(/^mongodb(?:\+srv)?:\/\/([^:/@]+):/i.exec(uri)[1]);
  const host = /@([^/?#]+)/.exec(uri)[1].replace(/^([^.]{0,4})[^.]*/, '$1****');
  console.log('Configuración de pruebas válida (no se ha conectado a ninguna base):');
  console.log(`  archivo : ${ENV_TEST_PATH}`);
  console.log(`  usuario : ${user}`);
  console.log('  clave   : ******** (oculta)');
  console.log(`  host    : ${host}`);
  console.log(`  base    : ${parseDbName(uri)} (requerida: ${TEST_DB})`);
  console.log('Siguiente paso, con autorización: npm run test:integration');
} catch (err) {
  console.error('Configuración de pruebas NO válida: ' + err.message);
  process.exitCode = 1;
}
