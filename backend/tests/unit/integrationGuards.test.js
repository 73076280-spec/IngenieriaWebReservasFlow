import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_DB, parseDbName, assertSafeTestUri, assertLeastPrivilege, readTestUri, SAFE_CONNECT_OPTIONS, UnsafeTestConfigError } from '../integration/guards.js';

// URIs ficticias: no corresponden a ningún clúster real.
const ok = `mongodb+srv://rf_test:clave@cluster0.ejemplo.mongodb.net/${TEST_DB}?retryWrites=true&w=majority`;

describe('Salvaguardas de integración · URI', () => {
  it('acepta solo la base reservas_saas_test con usuario y contraseña', () => {
    expect(() => assertSafeTestUri(ok)).not.toThrow();
    expect(() => assertSafeTestUri(`mongodb://rf_test:clave@localhost:27017/${TEST_DB}?replicaSet=rs0`)).not.toThrow();
  });

  it.each([
    ['sin URI', undefined],
    ['base principal', ok.replace(TEST_DB, 'reservas_saas')],
    ['sin base (usaría "test")', 'mongodb+srv://rf_test:clave@cluster0.ejemplo.mongodb.net/?retryWrites=true'],
    ['nombre parecido', ok.replace(TEST_DB, TEST_DB + '_old')],
    ['sin credenciales', `mongodb+srv://cluster0.ejemplo.mongodb.net/${TEST_DB}`],
    ['esquema distinto', `http://rf_test:clave@host/${TEST_DB}`],
    ['authSource ajeno', ok + '&authSource=reservas_saas'],
  ])('rechaza %s', (_label, uri) => {
    expect(() => assertSafeTestUri(uri)).toThrow(UnsafeTestConfigError);
  });

  it('los mensajes de error nunca incluyen la contraseña', () => {
    try { assertSafeTestUri(ok.replace(TEST_DB, 'reservas_saas')); } catch (e) { expect(e.message).not.toContain('clave'); }
  });

  it('parseDbName extrae la base de la ruta', () => {
    expect(parseDbName(ok)).toBe(TEST_DB);
    expect(parseDbName('mongodb://u:p@h1,h2/otra?x=1')).toBe('otra');
    expect(parseDbName('mongodb://u:p@h')).toBe('');
  });

  it('la conexión fuerza la base de pruebas y desactiva escrituras automáticas', () => {
    expect(SAFE_CONNECT_OPTIONS).toMatchObject({ dbName: TEST_DB, autoIndex: false, autoCreate: false });
  });

  it('lee MONGO_URI_TEST solo del archivo indicado y no de las variables del sistema', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-guard-'));
    const file = path.join(dir, '.env.test');
    try {
      expect(readTestUri(file)).toBeNull();
      fs.writeFileSync(file, `MONGO_URI_TEST=${ok}\nMONGO_URI=no-debe-usarse\n`);
      process.env.MONGO_URI_TEST = 'mongodb://variable-del-sistema/otra';
      expect(readTestUri(file)).toBe(ok);
    } finally {
      delete process.env.MONGO_URI_TEST;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Salvaguardas de integración · privilegios mínimos', () => {
  const status = (roles) => ({ authInfo: { authenticatedUsers: [{ user: 'rf_test', db: 'admin' }], authenticatedUserRoles: roles } });

  it('acepta un usuario con readWrite solo sobre reservas_saas_test', () => {
    expect(() => assertLeastPrivilege(status([{ role: 'readWrite', db: TEST_DB }]))).not.toThrow();
  });

  it.each([
    ['acceso a la base principal', [{ role: 'readWrite', db: TEST_DB }, { role: 'readWrite', db: 'reservas_saas' }]],
    ['readWriteAnyDatabase', [{ role: 'readWriteAnyDatabase', db: 'admin' }]],
    ['atlasAdmin', [{ role: 'atlasAdmin', db: 'admin' }]],
    ['dbOwner de la base de pruebas', [{ role: 'dbOwner', db: TEST_DB }]],
    ['sin roles', []],
  ])('rechaza %s', (_label, roles) => {
    expect(() => assertLeastPrivilege(status(roles))).toThrow(UnsafeTestConfigError);
  });

  it('rechaza una conexión no autenticada', () => {
    expect(() => assertLeastPrivilege({ authInfo: { authenticatedUsers: [], authenticatedUserRoles: [] } })).toThrow(UnsafeTestConfigError);
  });
});
