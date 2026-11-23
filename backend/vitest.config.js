import { defineConfig } from 'vitest/config';

// Dos proyectos: "unit" (sin red ni base de datos, se ejecuta siempre) e
// "integration" (requiere MONGO_URI_TEST apuntando a reservas_saas_test).
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.js'], environment: 'node' } },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.js'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
