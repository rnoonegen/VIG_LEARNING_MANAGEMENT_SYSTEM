import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Env lives at the project root so one file serves the database, backend and frontend.
  const env = loadEnv(mode, path.resolve(here, '..'), 'VITE_');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(here, 'src'),
      },
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL ?? 'http://localhost:4000/api/v1'),
    },
    server: {
      port: 5173,
      strictPort: false,
    },
  };
});
