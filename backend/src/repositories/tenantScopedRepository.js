import mongoose from 'mongoose';

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

// Quita cualquier tenantId que venga en los datos: la organización solo la decide la sesión (HU-14-E2).
const withoutTenant = (data = {}) => {
  const { tenantId: _ignored, ...rest } = data;
  return rest;
};

/**
 * Repositorio con alcance de organización (HU-14). Toda operación añade el
 * tenantId de la sesión al filtro y lo fija en las altas; no existe forma de
 * consultar sin tenant desde los servicios.
 */
export function createTenantRepository(Model) {
  return {
    model: Model,
    forTenant(tenantId) {
      if (!tenantId) throw new Error('tenantId es obligatorio para acceder a ' + Model.modelName);
      const tid = toObjectId(tenantId);
      // tenantId va al final para que un filtro externo no pueda sobrescribirlo.
      const scope = (filter = {}) => ({ ...withoutTenant(filter), tenantId: tid });
      return {
        tenantId: tid,
        find: (filter, projection) => Model.find(scope(filter), projection),
        findOne: (filter, projection) => Model.findOne(scope(filter), projection),
        findById: (id, projection) => Model.findOne(scope({ _id: id }), projection),
        exists: (filter) => Model.exists(scope(filter)),
        countDocuments: (filter) => Model.countDocuments(scope(filter)),
        create: async (data, options) => {
          if (options?.session) {
            const [doc] = await Model.create([{ ...withoutTenant(data), tenantId: tid }], options);
            return doc;
          }
          return Model.create({ ...withoutTenant(data), tenantId: tid });
        },
        insertMany: (docs, options) => Model.insertMany(docs.map((d) => ({ ...withoutTenant(d), tenantId: tid })), options),
        updateById: (id, data, options = {}) =>
          Model.findOneAndUpdate(scope({ _id: id }), { $set: withoutTenant(data) }, { new: true, runValidators: true, ...options }),
        updateMany: (filter, data, options) => Model.updateMany(scope(filter), { $set: withoutTenant(data) }, options),
        // Actualización atómica condicionada (p. ej. reservar un envío una sola vez). null si no coincide.
        findOneAndUpdate: (filter, data, options = {}) =>
          Model.findOneAndUpdate(scope(filter), { $set: withoutTenant(data) }, { new: true, runValidators: true, ...options }).lean(),
        deleteById: (id, options) => Model.findOneAndDelete(scope({ _id: id }), options),
        deleteMany: (filter, options) => Model.deleteMany(scope(filter), options),
        aggregate: (pipeline = []) => Model.aggregate([{ $match: { tenantId: tid } }, ...pipeline]),
      };
    },
  };
}
