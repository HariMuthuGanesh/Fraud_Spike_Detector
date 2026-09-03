import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/ingest': 'http://127.0.0.1:8000',
      '/merchants': 'http://127.0.0.1:8000',
      '/alerts': 'http://127.0.0.1:8000',
      '/dashboard': 'http://127.0.0.1:8000',
      '/simulator': 'http://127.0.0.1:8000',
      '/healthz': 'http://127.0.0.1:8000',
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
