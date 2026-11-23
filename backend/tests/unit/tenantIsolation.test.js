import { describe, it, expect, vi } from 'vitest';
import { ZodError } from 'zod';
import { createTenantRepository } from '../../src/repositories/tenantScopedRepository.js';
import { createCatalogService } from '../../src/services/catalogService.js';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

// Modelo falso que registra los argumentos con los que el repositorio llama a Mongoose.
function fakeModel() {
  const query = { sort: () => query, lean: async () => [] };
  return {
    modelName: 'Fake',
    find: vi.fn(() => query),
    findOne: vi.fn(() => query),
    exists: vi.fn(async () => null),
    countDocuments: vi.fn(async () => 0),
    create: vi.fn(async (d) => d),
    insertMany: vi.fn(async (d) => d),
    findOneAndUpdate: vi.fn(async () => null),
    updateMany: vi.fn(async () => ({})),
    findOneAndDelete: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({})),
    aggregate: vi.fn(async () => []),
  };
}

describe('HU-14 · Repositorio con alcance de organización', () => {
  it('HU-14-E1 toda lectura añade el tenantId de la sesión y no puede sobrescribirse', () => {
    const M = fakeModel();
    const repo = createTenantRepository(M).forTenant(A);
    repo.find({ tenantId: B, name: 'Ana' });
    repo.findById('cccccccccccccccccccccccc');
    repo.exists({ tenantId: B });
    repo.countDocuments();
    for (const [filter] of [M.find.mock.calls[0], M.findOne.mock.calls[0], M.exists.mock.calls[0], M.countDocuments.mock.calls[0]]) {
      expect(String(filter.tenantId)).toBe(A);
    }
    expect(M.find.mock.calls[0][0].name).toBe('Ana');
  });

  it('HU-14-E2 las altas reciben el tenantId de la sesión aunque los datos traigan otro', async () => {
    const M = fakeModel();
    const repo = createTenantRepository(M).forTenant(A);
    await repo.create({ name: 'Cambio de aceite', tenantId: B });
    await repo.insertMany([{ at: 1, tenantId: B }]);
    expect(String(M.create.mock.calls[0][0].tenantId)).toBe(A);
    expect(String(M.insertMany.mock.calls[0][0][0].tenantId)).toBe(A);
  });

  it('HU-14-E3 modificar o eliminar por ID siempre filtra por la organización de la sesión', async () => {
    const M = fakeModel();
    const repo = createTenantRepository(M).forTenant(A);
    await repo.updateById('cccccccccccccccccccccccc', { phone: '999', tenantId: B });
    await repo.deleteById('cccccccccccccccccccccccc');
    const [filter, update] = M.findOneAndUpdate.mock.calls[0];
    expect(String(filter.tenantId)).toBe(A);
    expect(update.$set.tenantId).toBeUndefined();
    expect(String(M.findOneAndDelete.mock.calls[0][0].tenantId)).toBe(A);
  });

  it('las agregaciones empiezan filtrando por organización', async () => {
    const M = fakeModel();
    await createTenantRepository(M).forTenant(A).aggregate([{ $group: { _id: '$serviceId' } }]);
    expect(String(M.aggregate.mock.calls[0][0][0].$match.tenantId)).toBe(A);
  });

  it('no permite construir un repositorio sin organización', () => {
    expect(() => createTenantRepository(fakeModel()).forTenant(undefined)).toThrow(/tenantId/);
  });
});

describe('HU-14-E2 · Alta de registros en el inquilino correcto (servicio de catálogo)', () => {
  const build = () => {
    const created = [];
    const repo = (kind) => ({
      forTenant: vi.fn((tid) => ({ create: async (d) => { created.push({ kind, tid, d }); return { ...d, tenantId: tid }; }, exists: async () => null })),
    });
    const repos = { clients: repo('clients'), employees: repo('employees'), services: repo('services'), appointments: repo('appointments') };
    return { service: createCatalogService({ repos }), created, repos };
  };
  const admin = { id: 'u1', tenantId: A, role: 'admin' };

  it('crea el servicio con el tenantId de la sesión sin que el usuario lo indique', async () => {
    const { service, created } = build();
    const doc = await service.create(admin, 'services', { name: 'Cambio de aceite', duration: 30, price: 45 });
    expect(created).toEqual([{ kind: 'services', tid: A, d: { name: 'Cambio de aceite', duration: 30, price: 45 } }]);
    expect(doc.tenantId).toBe(A);
  });

  it('rechaza un cuerpo que intenta fijar el tenantId y no crea nada', async () => {
    const { service, created } = build();
    await expect(service.create(admin, 'services', { name: 'X', duration: 30, price: 1, tenantId: B })).rejects.toBeInstanceOf(ZodError);
    expect(created).toHaveLength(0);
  });

  it('la capa de servicio también aplica la política RBAC', async () => {
    const { service, created } = build();
    await expect(service.create({ tenantId: A, role: 'recepcionista' }, 'services', { name: 'X', duration: 30, price: 1 })).rejects.toMatchObject({ status: 403 });
    expect(created).toHaveLength(0);
  });
});
