import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Salvaguardas de las pruebas de integración. Funciones puras: se prueban sin conexión
// en tests/unit/integrationGuards.test.js. Ningún mensaje incluye la URI ni credenciales.
export const TEST_DB = 'reservas_saas_test';
export const ENV_TEST_PATH = fileURLToPath(new URL('../../.env.test', import.meta.url));

// Roles que dan acceso más allá de una sola base: nunca deben usarse para pruebas.
const BROAD_ROLES = new Set([
  'root', 'atlasAdmin', 'readWriteAnyDatabase', 'readAnyDatabase', 'dbAdminAnyDatabase',
  'userAdminAnyDatabase', 'clusterAdmin', 'clusterManager', 'backup', 'restore', 'dbOwner', 'userAdmin',
]);

export class UnsafeTestConfigError extends Error {}
const fail = (msg) => { throw new UnsafeTestConfigError(msg); };

/** Lee MONGO_URI_TEST solo del archivo .env.test (no de .env ni de variables del sistema). */
export function readTestUri(path = ENV_TEST_PATH) {
  if (!fs.existsSync(path)) return null;
  return dotenv.parse(fs.readFileSync(path)).MONGO_URI_TEST?.trim() || null;
}

/** Nombre de la base en la ruta de la URI ('' si no tiene). */
export function parseDbName(uri) {
  const m = /^mongodb(?:\+srv)?:\/\/[^/?#]+\/([^?#]*)/i.exec(String(uri));
  return m ? decodeURIComponent(m[1]) : '';
}

/** Valida la URI antes de abrir ninguna conexión. */
export function assertSafeTestUri(uri) {
  if (!uri) fail(`Falta MONGO_URI_TEST en ${ENV_TEST_PATH}. Ver docs/GUIA_PRUEBAS_INTEGRACION.md`);
  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) fail('MONGO_URI_TEST debe empezar por mongodb:// o mongodb+srv://');
  if (!/^mongodb(\+srv)?:\/\/[^/@]+:[^/@]+@/i.test(uri)) fail('MONGO_URI_TEST debe incluir el usuario exclusivo de pruebas y su contraseña');
  const db = parseDbName(uri);
  if (db !== TEST_DB) fail(`La URI debe apuntar exactamente a /${TEST_DB} (recibido: "${db || '(sin base)'}")`);
  const authSource = /[?&]authSource=([^&#]+)/i.exec(uri)?.[1];
  if (authSource && !['admin', TEST_DB].includes(authSource)) fail('authSource no permitido');
}

/**
 * Comprueba con connectionStatus que el usuario conectado solo tiene roles sobre la base de pruebas
 * (mínimo privilegio). Rechaza usuarios con acceso a otras bases o roles administrativos.
 */
export function assertLeastPrivilege(status) {
  const info = status?.authInfo;
  if (!info?.authenticatedUsers?.length) fail('La conexión no está autenticada con el usuario de pruebas');
  const roles = info.authenticatedUserRoles ?? [];
  if (!roles.length) fail('El usuario de pruebas no tiene roles asignados');
  for (const { role, db } of roles) {
    if (BROAD_ROLES.has(role)) fail(`Rol "${role}" no permitido: el usuario de pruebas solo debe tener readWrite@${TEST_DB}`);
    if (db !== TEST_DB) fail(`Rol "${role}@${db}" no permitido: el usuario de pruebas solo puede tener roles sobre ${TEST_DB}`);
  }
}

/** Opciones de conexión: fuerzan la base de pruebas y desactivan escrituras automáticas de Mongoose. */
export const SAFE_CONNECT_OPTIONS = Object.freeze({
  dbName: TEST_DB,
  autoIndex: false,
  autoCreate: false,
  serverSelectionTimeoutMS: 15000,
});
