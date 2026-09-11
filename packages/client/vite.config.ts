import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.CLIENT_PORT ?? 5173),
    // In development the API and the socket live on the game server; proxying
    // keeps the browser on a single origin so the same-origin socket check and
    // relative URLs behave exactly as they do in production.
    proxy: {
      '/ws': { target: `ws://127.0.0.1:${SERVER_PORT}`, ws: true },
      '/api': { target: `http://127.0.0.1:${SERVER_PORT}` },
      '/healthz': { target: `http://127.0.0.1:${SERVER_PORT}` },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
