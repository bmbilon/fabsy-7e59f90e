import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'ontario/anderhue-paralegal-site'),
  envDir: __dirname,
  publicDir: false,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    outDir: path.resolve(__dirname, 'dist-anderhue'),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'ontario/anderhue-paralegal-site/portal.html') },
  },
});
