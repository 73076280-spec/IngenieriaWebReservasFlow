import 'dotenv/config';
import mongoose from 'mongoose';
import { loadConfig } from './config/env.js';
import { createApp } from './app.js';
import { createAuthService } from './services/authService.js';
import { createMongoAuthStore } from './repositories/authStore.js';
import { Tenant, User, Slot, RevokedToken, Notification } from './models.js';

// Punto de arranque: configuración, conexión, índices y servidor HTTP.
const config = loadConfig();
await mongoose.connect(config.mongoUri);
// Índices nuevos no destructivos: slug único (sparse), TTL de tokens revocados, avisos.
await Promise.all([User.init(), Slot.init(), Tenant.init(), RevokedToken.init(), Notification.init()]);

const authService = createAuthService({
  store: createMongoAuthStore(),
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
  bcryptRounds: config.bcryptRounds,
});
const app = createApp({ config, authService });
app.listen(config.port, () => {
  console.log(`API lista: http://localhost:${config.port}`);
  const { transport, outboxDir } = config.mail;
  console.log(transport === 'file' ? `Correos de confirmación (modo de prueba, no se envían): ${outboxDir}` : `Correos de confirmación: ${transport}`);
});
