// Uso (operador del SaaS): npm run tenant:status -- <idOCodigoOrganizacion> <activa|suspendida>
// Solo cambia el campo status de UNA organización; no borra ni modifica otros datos (HU-14-E4).
import 'dotenv/config';
import mongoose from 'mongoose';
import { Tenant, TENANT_STATUS } from '../src/models.js';

const [ref, status] = process.argv.slice(2);
if (!ref || !TENANT_STATUS.includes(status)) {
  console.error(`Uso: npm run tenant:status -- <idOCodigoOrganizacion> <${TENANT_STATUS.join('|')}>`);
  process.exit(1);
}
await mongoose.connect(process.env.MONGO_URI);
try {
  const filter = /^[a-f0-9]{24}$/i.test(ref) ? { $or: [{ _id: ref }, { slug: ref.toLowerCase() }] } : { slug: ref.toLowerCase() };
  const tenant = await Tenant.findOneAndUpdate(filter, { $set: { status } }, { new: true }).lean();
  if (!tenant) {
    console.error('Organización no encontrada');
    process.exitCode = 1;
  } else {
    console.log(`Organización "${tenant.name}" (${tenant._id}) → ${tenant.status}`);
  }
} finally {
  await mongoose.disconnect();
}
