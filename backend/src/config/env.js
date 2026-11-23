import { fileURLToPath } from 'node:url';

const MAIL_TRANSPORTS = ['file', 'memory', 'disabled'];
const DEFAULT_OUTBOX = fileURLToPath(new URL('../../.mail-outbox/', import.meta.url));

/** Correo de confirmación (HU-04-E1): "file" por defecto (bandeja local, no envía); "disabled" en producción. */
export function loadMailConfig(env = process.env) {
  const transport = (env.MAIL_TRANSPORT || (env.NODE_ENV === 'production' ? 'disabled' : 'file')).toLowerCase();
  if (!MAIL_TRANSPORTS.includes(transport)) throw new Error(`MAIL_TRANSPORT debe ser uno de: ${MAIL_TRANSPORTS.join(', ')}`);
  return { transport, outboxDir: env.MAIL_OUTBOX_DIR || DEFAULT_OUTBOX };
}

// Lee y valida la configuración. No carga .env: eso lo hace server.js al arrancar,
// así las pruebas nunca leen el .env de desarrollo.
export function loadConfig(env = process.env) {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) throw new Error('Configura JWT_SECRET con al menos 32 caracteres');
  return {
    port: Number(env.PORT || 4000),
    mongoUri: env.MONGO_URI || 'mongodb://127.0.0.1:27017/reservas_saas',
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
    // Vite (npm run dev) sirve en 127.0.0.1:5173; se admiten ambos nombres del equipo local.
    clientOrigins: (env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()).filter(Boolean),
    authRateLimit: Number(env.AUTH_RATE_LIMIT || 50),
    bcryptRounds: Number(env.BCRYPT_ROUNDS || 12),
    mail: loadMailConfig(env),
  };
}
