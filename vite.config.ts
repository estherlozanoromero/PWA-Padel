import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [],
      manifest: {
        name: 'Padel Scorekeeper',
        short_name: 'Padel Score',
        description: 'Marcador de pádel móvil y sin conexión.',
        theme_color: '#071a14',
        background_color: '#f3f7f5',
        display: 'standalone',
        orientation: 'any',
        lang: 'es',
        start_url: '/',
      },
      workbox: {
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
