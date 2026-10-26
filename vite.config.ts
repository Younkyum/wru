import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.WRU_API_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api/': `http://localhost:${API_PORT}` },
  },
});
