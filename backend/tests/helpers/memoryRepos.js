import { randomBytes } from 'node:crypto';

// Repositorios en memoria con la misma interfaz que createTenantRepository().forTenant(),
// suficientes para probar reglas de negocio sin MongoDB. Solo implementan los operadores usados.
export const newId = () => randomBytes(12).toString('hex');
const isPlainCond = (c) => c && typeof c === 'object' && !(c instanceof Date) && !Array.isArray(c) && !c.toHexString;
const getPath = (doc, key) => key.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);
function setPath(doc, key, value) {
  const parts = key.split('.');
  let target = doc;
  for (const p of parts.slice(0, -1)) target = target[p] ??= {};
  target[parts.at(-1)] = value;
}
function applySet(doc, patch) {
  for (const [k, v] of Object.entries(patch)) {
    setPath(doc, k, v);
  }
  return doc;
}
const clone = (doc) => (doc ? structuredClone(doc) : doc);

function test(op, value, arg) {
  switch (op) {
    case '$in': return arg.map(String).includes(String(value));
    case '$ne': return String(value) !== String(arg);
    case '$gte': return +new Date(value) >= +new Date(arg);
    case '$lt': return +new Date(value) < +new Date(arg);
    case '$exists': return (value !== undefined) === Boolean(arg);
    case '$regex': return new RegExp(arg, 'i').test(String(value ?? ''));
    case '$options': return true;
    default: throw new Error('Operador no soportado en memoria: ' + op);
  }
}

export function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    const value = getPath(doc, key);
    if (isPlainCond(cond)) return Object.entries(cond).every(([op, arg]) => test(op, value, arg));
    if (Array.isArray(value)) return value.map(String).includes(String(cond));
    return String(value) === String(cond);
  });
}

function query(resultFn) {
  let sortSpec = null;
  const q = {
    sort(spec) { sortSpec = spec; return q; },
    populate() { return q; },
    session() { return q; },
    lean() { return Promise.resolve(run()); },
    then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
  };
  function run() {
    const rows = resultFn();
    if (!sortSpec || !Array.isArray(rows)) return rows;
    const [[field, dir]] = Object.entries(sortSpec);
    return [...rows].sort((a, b) => (a[field] > b[field] ? dir : a[field] < b[field] ? -dir : 0));
  }
  return q;
}

/** Crea repositorios en memoria por colección, acotados por tenantId como los reales. */
export function createMemoryRepos(kinds = ['clients', 'employees', 'services', 'appointments', 'slots', 'users', 'notifications']) {
  const data = Object.fromEntries(kinds.map((k) => [k, []]));
  const calls = [];
  const repos = Object.fromEntries(kinds.map((kind) => [kind, {
    forTenant(tenantId) {
      const scoped = (filter = {}) => ({ ...filter, tenantId });
      const rows = (filter) => data[kind].filter((d) => matches(d, scoped(filter)));
      const record = (op, filter) => calls.push({ kind, op, filter });
      return {
        tenantId,
        find: (filter) => { record('find', filter); return query(() => rows(filter)); },
        findOne: (filter) => query(() => rows(filter)[0] ?? null),
        findById: (id) => query(() => rows({ _id: id })[0] ?? null),
        exists: async (filter) => (rows(filter).length ? { _id: rows(filter)[0]._id } : null),
        countDocuments: async (filter) => { record('count', filter); return rows(filter).length; },
        create: async (doc) => { const d = { _id: newId(), ...doc, tenantId }; data[kind].push(d); return d; },
        insertMany: async (docs) => docs.map((doc) => { const d = { _id: newId(), ...doc, tenantId }; data[kind].push(d); return d; }),
        // Comprobar y modificar ocurre en el mismo turno del bucle de eventos: atómico como en MongoDB.
        findOneAndUpdate: async (filter, patch) => { const d = rows(filter)[0]; return d ? clone(applySet(d, patch)) : null; },
        updateById: async (id, patch) => { const d = rows({ _id: id })[0]; if (!d) return null; return clone(applySet(d, patch)); },
        updateMany: async (filter, patch) => { for (const d of rows(filter)) applySet(d, patch); },
        deleteById: async (id) => { const d = rows({ _id: id })[0]; if (d) data[kind].splice(data[kind].indexOf(d), 1); return d ?? null; },
        aggregate: async () => [],
      };
    },
  }]));
  const seed = (kind, tenantId, doc) => { const d = { _id: newId(), ...doc, tenantId }; data[kind].push(d); return d; };
  return { repos, data, seed, calls };
}
