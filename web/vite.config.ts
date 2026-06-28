import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tijdens ontwikkeling draait de backend op poort 8080; de proxy stuurt /api daarheen.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
