import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import { authRoutes } from './routes/authRoutes.js';
import { businessRoutes } from './routes/businessRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { createServices } from './container.js';

/**
 * Construye la aplicación Express sin conectarse a la base de datos.
 * Las dependencias se inyectan para poder probar la API de forma aislada.
 */
export function createApp({ config, authService, services = createServices(config), logger = console }) {
  if (!authService) throw new Error('createApp requiere authService');
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
  app.use('/api', authRoutes({ authService, authRateLimit: config.authRateLimit }));
  app.use('/api', businessRoutes({ authService, services }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada', code: 'NOT_FOUND' }));
  app.use(errorHandler(logger));
  return app;
}
