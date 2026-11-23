import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: { name: 'ReservaFlow SaaS', short_name: 'ReservaFlow', description: 'Gestión de reservas', theme_color: '#0f766e', background_color: '#f8fafc', display: 'standalone', start_url: '/', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] },
      // Solo se precachea la estructura estática; las respuestas privadas de la API nunca se cachean.
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,ico}'] },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Bloques separados: el calendario y las librerías cambian poco y se cachean aparte.
        manualChunks: {
          calendar: ['@fullcalendar/core', '@fullcalendar/react', '@fullcalendar/daygrid', '@fullcalendar/timegrid', '@fullcalendar/interaction'],
          ui: ['sweetalert2', 'react-toastify'],
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});
