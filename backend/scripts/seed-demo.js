// Crea la organización de demostración en la base configurada en backend/.env (MONGO_URI).
// Solo AÑADE una organización nueva con datos ficticios; nunca modifica ni borra datos.
// Uso (PowerShell):  $env:DEMO_PASSWORD='Demo-12345'; npm run demo:seed -- --confirm
import 'dotenv/config';
import mongoose from 'mongoose';
import { seedDemo } from '../src/demo/seedDemo.js';
import { Tenant, User, Client, Employee, Service, Appointment, Slot } from '../src/models.js';

if (!process.argv.includes('--confirm')) {
  console.log('Este script añade la organización "demo-sonrisa-real" en la base de MONGO_URI.');
  console.log('No borra ni modifica datos existentes. Para ejecutarlo: npm run demo:seed -- --confirm');
  process.exit(0);
}
const password = process.env.DEMO_PASSWORD || 'Demo-12345';
if (!process.env.MONGO_URI) throw new Error('Falta MONGO_URI en backend/.env');
await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
try {
  for (const M of [Tenant, User, Client, Employee, Service, Appointment, Slot]) await M.createIndexes();
  const result = await seedDemo({ password });
  if (!result.created) console.log(`La organización "${result.slug}" ya existe: no se hizo ningún cambio.`);
  else {
    console.log(`Organización creada · código: ${result.slug} · citas: ${result.appointments}`);
    for (const u of result.users) console.log(`  ${u.role || 'sin rol'}: ${u.email}`);
    console.log('Contraseña de todas las cuentas: la indicada en DEMO_PASSWORD (por defecto Demo-12345).');
  }
} finally {
  await mongoose.disconnect();
}
