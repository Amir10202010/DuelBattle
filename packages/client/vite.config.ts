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
    rollupOptions: {
      output: {
        /*
         * The topic pool gets its own file.
         *
         * It is about sixty kilobytes of prompts that change when somebody
         * regenerates them and at no other time, so bundling it with the app
         * would throw all of it away on every deploy. Split out, it is
         * fingerprinted separately and stays in a returning player's cache
         * across releases that never touched it.
         */
        manualChunks(id) {
          // Cache the framework separately from frequently changing game UI.
          const path = id.replaceAll('\\', '/');
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(path)) return 'react-runtime';
          if (id.includes('shared/dist/topics/pool')) return 'topics';
          return undefined;
        },
      },
    },
  },
});
