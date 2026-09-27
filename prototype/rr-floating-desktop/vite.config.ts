import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The desktop talks to the same FastAPI backend as apps/web and reuses its API client and contracts
// (apps/web/src/lib), so there is one copy of each. Radar images and callout polygons also come from the main app.
// The dev server proxies /api to the backend, so the API needs no extra CORS origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.RR_API_URL || 'http://127.0.0.1:8000';
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('../../apps/web/src', import.meta.url)) },
    },
    define: {
      'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(env.VITE_API_URL || '/api'),
      'process.env.API_INTERNAL_URL': 'undefined',
    },
    server: {
      fs: { allow: ['../..'] },
      proxy: {
        '/api': { target, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      },
    },
    preview: {
      proxy: {
        '/api': { target, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      },
    },
  };
});
